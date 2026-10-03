import { invoke, isTauri } from '@tauri-apps/api/core';
import { AiAssistantService, type AiAssistant } from '../../application/ai/AiAssistant';
import { SupabaseAiGateway } from '../../infrastructure/ai/SupabaseAiGateway';
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
  AccountSyncService,
  type AccountSync,
} from '../../application/sync/account/AccountSyncService';
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
import {
  UnavailableAccountSync,
  UnavailableSyncApplication,
} from '../../infrastructure/sync/UnavailableSyncApplication';
import { IndexedDbAccountLocalData } from '../../infrastructure/sync/IndexedDbAccountLocalData';
import { TauriSyncCryptoService } from '../../infrastructure/sync/crypto/TauriSyncCryptoService';
import {
  readSupabasePublicConfig,
  type SupabasePublicEnvironment,
} from '../../infrastructure/sync/supabase/SupabaseConfig';
import { SupabaseSyncTrustTransport } from '../../infrastructure/sync/supabase/SupabaseSyncTrustTransport';
import { SupabasePilotSyncTransport } from '../../infrastructure/sync/supabase/SupabasePilotSyncTransport';
import { SupabaseAccountAuth } from '../../infrastructure/sync/supabase/SupabaseAccountAuth';
import { TauriSupabaseAuthStorage } from '../../infrastructure/sync/supabase/TauriSupabaseAuthStorage';
import {
  createLifeOsSupabaseClient,
  createPasswordRecoveryClient,
} from '../../infrastructure/sync/supabase/createLifeOsSupabaseClient';
import type { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { PilotSyncLifecycle } from '../lifecycle/PilotSyncLifecycle';
import { SyncTransferGate } from '../../application/sync/account/SyncTransferGate';
import type { MeaningfulLocalSettingsSync } from '../../infrastructure/sync/MeaningfulLocalSettingsSync';
import { saveConfirmedWalkDataFormat } from '../../infrastructure/sync/WalkDataFormat';

interface CreateLifeOsSyncApplicationInput {
  readonly database: LifeOsIndexedDb;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly mutationRecorder?: IndexedDbPilotMutationRecorder;
  readonly meaningfulSettingsSync?: MeaningfulLocalSettingsSync;
  readonly environment?: SupabasePublicEnvironment;
}

export interface LifeOsSyncApplications {
  readonly aiAssistant: AiAssistant;
  readonly sync: SyncApplication;
  readonly accountSync: AccountSync;
}

export function createLifeOsSyncApplication({
  database,
  clock,
  idGenerator,
  mutationRecorder = new IndexedDbPilotMutationRecorder(),
  meaningfulSettingsSync,
  environment = {},
}: CreateLifeOsSyncApplicationInput): LifeOsSyncApplications {
  let config;
  try {
    config = readSupabasePublicConfig(environment);
  } catch {
    return unavailableApplications('Публичная конфигурация синхронизации недопустима.');
  }
  if (config === null) {
    return unavailableApplications('Синхронизация ещё не настроена в этой сборке LifeOS.');
  }
  if (!isTauri()) {
    return unavailableApplications('Синхронизация доступна только в приложении LifeOS.');
  }
  const authStorage = new TauriSupabaseAuthStorage(invoke);
  const client = createLifeOsSupabaseClient(config, { authStorage });
  const auth = new SupabaseAccountAuth(client, {
    url: config.url,
    createClient: () => createPasswordRecoveryClient(config),
  });
  const crypto = new TauriSyncCryptoService(invoke);
  const installationRepository = new IndexedDbSyncInstallationRepository(database);
  const statusSource = new IndexedDbSyncStatusSource(database);
  const trustTransport = new SupabaseSyncTrustTransport(client);
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
  const transferGate = new SyncTransferGate(
    async () => {
      const installation = await installationRepository.find();
      if (
        installation === null ||
        installation.setupState !== 'configured' ||
        installation.membershipStatus !== 'active'
      )
        return false;
      if (
        [
          'sign_in_required',
          'device_recovery_required',
          'email_verification_pending',
          'account_migration_pending',
        ].includes(installation.accountSetupState)
      )
        return false;
      const session = await auth.current();
      if (session === null) return false;
      if (installation.accountSetupState === 'local_anonymous') return session.isAnonymous;
      return (
        !session.isAnonymous &&
        session.emailVerified &&
        session.userId === installation.accountUserId &&
        session.sessionId === installation.accountSessionId &&
        session.email === installation.accountEmail
      );
    },
    () => pilotTransport.closeHints(),
  );
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
        void transferGate.run(() => attachments.run(spaceId)).catch(() => undefined);
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
    transferGate,
    prepareDataFormat: async () => {
      pilotTransport.setDataFormat(1);
      const installation = await installationRepository.find();
      if (installation?.spaceId === null || installation === null) return;
      const format = await trustTransport.negotiateDataFormat(installation.deviceId);
      await saveConfirmedWalkDataFormat(
        database,
        installation.spaceId,
        installation.deviceId,
        format,
      );
      pilotTransport.setDataFormat(format);
    },
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
        .then(({ spaceId }) => transferGate.run(() => attachments.run(spaceId)))
        .catch(() => undefined);
      void transferGate.run(() => recovery.runMaintenance()).catch(() => undefined);
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
  const sync = new SyncApplicationService({
    transferGate,
    statusSource,
    recovery,
    auth,
    crypto,
    installationRepository,
    deviceCacheRepository: new IndexedDbSyncDeviceCacheRepository(database),
    snapshotService,
    transport: trustTransport,
    projectRef: new URL(config.url).hostname.split('.')[0] ?? '',
    createId: () => globalThis.crypto.randomUUID(),
    now: () => clock.now(),
    pilotCoordinator,
    pilotLifecycle,
  });
  const accountSync = config.accountSyncEnabled
    ? new AccountSyncService({
        auth,
        installations: installationRepository,
        snapshots: snapshotService,
        sync,
        transport: trustTransport,
        crypto,
        recovery,
        localData: new IndexedDbAccountLocalData(database),
        transferGate,
        now: () => clock.now(),
      })
    : new UnavailableAccountSync('Аккаунт и синхронизация отключены в этой сборке LifeOS.');
  const aiAssistant =
    config.accountSyncEnabled && environment.VITE_LIFEOS_OPENAI_ENABLED === 'true'
      ? new AiAssistantService(new SupabaseAiGateway(client), auth)
      : new AiAssistantService();
  return { sync, accountSync, aiAssistant };
}

function unavailableApplications(message: string): LifeOsSyncApplications {
  return {
    aiAssistant: new AiAssistantService(),
    sync: new UnavailableSyncApplication(message),
    accountSync: new UnavailableAccountSync(message),
  };
}
