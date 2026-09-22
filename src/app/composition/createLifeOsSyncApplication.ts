import { invoke, isTauri } from '@tauri-apps/api/core';
import { IndexedDbSyncStatusSource } from '../../infrastructure/sync/IndexedDbSyncStatusSource';
import { AttachmentTransferService } from '../../infrastructure/sync/attachments/AttachmentTransferService';
import { bootstrapAttachments } from '../../infrastructure/sync/attachments/AttachmentBootstrap';
import { SupabaseEncryptedBlobTransport } from '../../infrastructure/sync/supabase/SupabaseEncryptedBlobTransport';
import { IndexedDbRecoveryStore } from '../../infrastructure/sync/recovery/IndexedDbRecoveryStore';
import { SyncRecoveryService } from '../../application/sync/recovery/SyncRecoveryService';
import {
  SyncApplicationService,
  type SyncApplication,
} from '../../application/sync/SyncApplicationService';
import {
  PilotPullEngine,
  PilotPushEngine,
  PilotSyncCoordinator,
} from '../../application/sync/pilot';
import type { Clock } from '../../application/ports/Clock';
import type { IdGenerator } from '../../application/ports/IdGenerator';
import { IndexedDbSnapshotService } from '../../infrastructure/sync/IndexedDbSnapshotService';
import { IndexedDbPilotMutationRecorder } from '../../infrastructure/sync/pilot/IndexedDbPilotMutationRecorder';
import { IndexedDbPilotSyncStore } from '../../infrastructure/sync/pilot/IndexedDbPilotSyncStore';
import { PilotBootstrapService } from '../../infrastructure/sync/pilot/PilotBootstrapService';
import { IndexedDbSyncDeviceCacheRepository } from '../../infrastructure/sync/IndexedDbSyncDeviceCacheRepository';
import { IndexedDbSyncInstallationRepository } from '../../infrastructure/sync/IndexedDbSyncInstallationRepository';
import { UnavailableSyncApplication } from '../../infrastructure/sync/UnavailableSyncApplication';
import { TauriSyncCryptoService } from '../../infrastructure/sync/crypto/TauriSyncCryptoService';
import {
  readSupabasePublicConfig,
  type SupabasePublicEnvironment,
} from '../../infrastructure/sync/supabase/SupabaseConfig';
import { SupabaseSyncTrustTransport } from '../../infrastructure/sync/supabase/SupabaseSyncTrustTransport';
import { SupabasePilotSyncTransport } from '../../infrastructure/sync/supabase/SupabasePilotSyncTransport';
import { SupabaseAccountAuth } from '../../infrastructure/sync/supabase/SupabaseAccountAuth';
import { TauriSupabaseAuthStorage } from '../../infrastructure/sync/supabase/TauriSupabaseAuthStorage';
import { createLifeOsSupabaseClient } from '../../infrastructure/sync/supabase/createLifeOsSupabaseClient';
import type { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { PilotSyncLifecycle } from '../lifecycle/PilotSyncLifecycle';
import type { MeaningfulLocalSettingsSync } from '../../infrastructure/sync/MeaningfulLocalSettingsSync';

interface CreateLifeOsSyncApplicationInput {
  readonly database: LifeOsIndexedDb;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly mutationRecorder?: IndexedDbPilotMutationRecorder;
  readonly meaningfulSettingsSync?: MeaningfulLocalSettingsSync;
  readonly environment?: SupabasePublicEnvironment;
}

export function createLifeOsSyncApplication({
  database,
  clock,
  idGenerator,
  mutationRecorder = new IndexedDbPilotMutationRecorder(),
  meaningfulSettingsSync,
  environment = {},
}: CreateLifeOsSyncApplicationInput): SyncApplication {
  let config;
  try {
    config = readSupabasePublicConfig(environment);
  } catch {
    return new UnavailableSyncApplication('Публичная конфигурация синхронизации недопустима.');
  }
  if (config === null) {
    return new UnavailableSyncApplication('Синхронизация ещё не настроена в этой сборке LifeOS.');
  }
  if (!isTauri()) {
    return new UnavailableSyncApplication('Синхронизация доступна только в приложении LifeOS.');
  }
  const authStorage = new TauriSupabaseAuthStorage(invoke);
  const client = createLifeOsSupabaseClient(config, { authStorage });
  const crypto = new TauriSyncCryptoService(invoke);
  const snapshotService = new IndexedDbSnapshotService(
    database,
    clock,
    idGenerator,
    undefined,
    undefined,
    crypto,
  );
  const pilotStore = new IndexedDbPilotSyncStore(
    database,
    () => globalThis.crypto.randomUUID(),
    () => clock.now(),
    () => Math.random(),
    meaningfulSettingsSync ?? null,
  );
  const pilotTransport = new SupabasePilotSyncTransport(client);
  const blobTransport = new SupabaseEncryptedBlobTransport(client);
  const attachments = new AttachmentTransferService(database, crypto, blobTransport, () =>
    clock.now(),
  );
  const recoveryStore = new IndexedDbRecoveryStore(
    database,
    mutationRecorder,
    meaningfulSettingsSync ?? null,
    () => clock.now(),
  );
  const recovery = new SyncRecoveryService(
    recoveryStore,
    crypto,
    blobTransport,
    {
      retry: async (id) => {
        const { spaceId } = await recoveryStore.context();
        await attachments.retry(id);
        void attachments.run(spaceId).catch(() => undefined);
      },
    },
    () => clock.now(),
  );
  const bootstrap = new PilotBootstrapService(
    database,
    snapshotService,
    mutationRecorder,
    meaningfulSettingsSync ?? null,
  );
  const pilotCoordinator = new PilotSyncCoordinator({
    isOnline: () => navigator.onLine,
    bootstrap: {
      run: async () => {
        const result = await bootstrap.run();
        await bootstrapAttachments(database, mutationRecorder);
        return result;
      },
    },
    afterStructured: () => {
      void recoveryStore
        .context()
        .then(({ spaceId }) => attachments.run(spaceId))
        .catch(() => undefined);
      void recovery.runMaintenance().catch(() => undefined);
    },
    push: new PilotPushEngine(pilotStore, crypto, pilotTransport),
    pull: new PilotPullEngine(pilotStore, crypto, pilotTransport),
    metrics: pilotStore,
    hints: {
      ensure: async (onHint) => {
        const installation = await pilotStore.installation();
        if (
          installation?.setupState !== 'configured' ||
          installation.membershipStatus !== 'active' ||
          installation.spaceId === null ||
          installation.currentKeyEpoch === null
        )
          return;
        await pilotTransport
          .ensureHintSubscription(installation.spaceId, installation.currentKeyEpoch, onHint)
          .catch(() => undefined);
      },
      close: () => pilotTransport.closeHints(),
    },
    now: () => clock.now(),
  });
  const pilotLifecycle = new PilotSyncLifecycle(pilotCoordinator);
  mutationRecorder.setNotify(() => pilotCoordinator.trigger());
  pilotLifecycle.start();
  return new SyncApplicationService({
    statusSource: new IndexedDbSyncStatusSource(database),
    recovery,
    auth: new SupabaseAccountAuth(client),
    crypto,
    installationRepository: new IndexedDbSyncInstallationRepository(database),
    deviceCacheRepository: new IndexedDbSyncDeviceCacheRepository(database),
    snapshotService,
    transport: new SupabaseSyncTrustTransport(client),
    projectRef: new URL(config.url).hostname.split('.')[0] ?? '',
    createId: () => globalThis.crypto.randomUUID(),
    now: () => clock.now(),
    pilotCoordinator,
    pilotLifecycle,
  });
}
