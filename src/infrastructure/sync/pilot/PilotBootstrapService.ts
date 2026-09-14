import type { SnapshotService } from '../../../application/sync/SnapshotService';
import type { PilotEntityType } from '../../../application/sync/pilot';
import type { LifeOsIndexedDb } from '../../persistence/indexed-db/LifeOsIndexedDb';
import { LIFE_OS_SYNC_STORE } from '../../persistence/indexed-db/LifeOsIndexedDb';
import type {
  SyncPilotBootstrapRecord,
  SyncSettingsRecord,
  SyncStructuredBootstrapRecord,
  SyncStructuredBootstrapTypeRecord,
} from '../../persistence/records/SyncStoreRecords';
import {
  IndexedDbPilotMutationRecorder,
  PILOT_MUTATION_STORES,
} from './IndexedDbPilotMutationRecorder';
import { PILOT_RUNTIME_REGISTRY, shouldSyncPilotRecord } from './PilotSyncRegistryAdapters';

const LEGACY_PILOT_TYPES: readonly PilotEntityType[] = ['direction', 'project', 'goal'];

export interface PilotBootstrapResult {
  readonly snapshotId: string | null;
  readonly queued: number;
}

interface MeaningfulSettingsBootstrap {
  reconcile(): Promise<boolean>;
}

export class PilotBootstrapService {
  public constructor(
    private readonly database: LifeOsIndexedDb,
    private readonly snapshots: SnapshotService,
    private readonly recorder: IndexedDbPilotMutationRecorder,
    private readonly settingsSync: MeaningfulSettingsBootstrap | null = null,
  ) {}

  public async run(): Promise<PilotBootstrapResult> {
    const database = await this.database.open();
    const installation = await readInstallation(database);
    if (
      installation?.setupState !== 'configured' ||
      installation.membershipStatus !== 'active' ||
      installation.spaceId === null ||
      installation.currentKeyEpoch === null
    ) {
      return { snapshotId: null, queued: 0 };
    }

    let stage = await readStructuredBootstrap(database);
    const expansionReady = (
      await Promise.all(
        [
          'planning_period',
          'period_membership',
          'period_decision',
          'contribution_link',
          'progress_contribution',
          'recurrence_rule',
          'direction_indicator',
          'balance_monthly_snapshot',
        ].map((type) =>
          hasTypeCheckpoint(
            database,
            type as import('../../../application/sync/pilot').PilotEntityType,
          ),
        ),
      )
    ).every(Boolean);
    if (stage?.status === 'complete' && expansionReady) {
      const settingsQueued = (await this.settingsSync?.reconcile()) === true ? 1 : 0;
      return { snapshotId: stage.snapshotId, queued: settingsQueued };
    }
    if (stage === null || (stage.status === 'complete' && !expansionReady)) {
      const snapshot = await this.snapshots.createPreSyncSnapshot();
      const verification = await this.snapshots.verifySnapshot(snapshot.snapshotId);
      if (!verification.valid) throw new Error('Verified pre-sync snapshot is required.');
      stage = {
        id: 'structured-bootstrap',
        snapshotId: snapshot.snapshotId,
        status: 'in_progress',
        completedAt: null,
        updatedAt: new Date().toISOString(),
      };
      await putSetting(database, stage);
    }

    const legacyPilot = await readLegacyPilotBootstrap(database);
    let queued = 0;
    for (const runtime of PILOT_RUNTIME_REGISTRY) {
      const { registration } = runtime;
      if (registration.storageKind !== 'indexed_db' || registration.entityType === 'project')
        continue;
      if (await hasTypeCheckpoint(database, registration.entityType)) continue;

      if (!(legacyPilot !== null && LEGACY_PILOT_TYPES.includes(registration.entityType))) {
        let afterId: string | undefined;
        for (;;) {
          const ids = await readBatchIds(database, registration.storeName, afterId);
          if (ids.length === 0) break;
          for (const objectId of ids) {
            const transaction = database.transaction(
              [registration.storeName, ...PILOT_MUTATION_STORES],
              'readwrite',
            );
            const completion = done(transaction);
            void completion.catch(() => undefined);
            let recorded = false;
            try {
              // Snapshot scanning is not authoritative after a concurrent local save/delete.
              const [current, meta] = await Promise.all([
                request<object | undefined>(
                  transaction.objectStore(registration.storeName).get(objectId),
                ),
                request<IDBValidKey | undefined>(
                  transaction.objectStore(LIFE_OS_SYNC_STORE.objectMeta).getKey(objectId),
                ),
              ]);
              if (
                current !== undefined &&
                meta === undefined &&
                shouldSyncPilotRecord(registration.entityType, current)
              ) {
                recorded = await this.recorder.recordUpsert(
                  transaction,
                  registration.entityType,
                  current,
                );
              }
              await completion;
            } catch (error) {
              try {
                transaction.abort();
              } catch {
                /* Already aborted. */
              }
              await completion.catch(() => undefined);
              throw error;
            }
            this.recorder.notifyCommitted(recorded);
            if (recorded) queued += 1;
          }
          afterId = ids.at(-1);
        }
      }
      await putTypeCheckpoint(database, registration.entityType, stage.snapshotId);
    }

    if (this.settingsSync !== null) {
      if (await this.settingsSync.reconcile()) queued += 1;
      await putTypeCheckpoint(database, 'user_settings', stage.snapshotId);
    }

    const completedAt = new Date().toISOString();
    await putSetting(database, {
      ...stage,
      status: 'complete',
      completedAt,
      updatedAt: completedAt,
    });
    return { snapshotId: stage.snapshotId, queued };
  }
}

async function readInstallation(database: IDBDatabase): Promise<SyncSettingsRecord | null> {
  return (await readSetting<SyncSettingsRecord>(database, 'sync')) ?? null;
}

async function readLegacyPilotBootstrap(
  database: IDBDatabase,
): Promise<SyncPilotBootstrapRecord | null> {
  const record = await readSetting<SyncPilotBootstrapRecord>(database, 'pilot-bootstrap');
  return record?.status === 'complete' ? record : null;
}

async function readStructuredBootstrap(
  database: IDBDatabase,
): Promise<SyncStructuredBootstrapRecord | null> {
  return (
    (await readSetting<SyncStructuredBootstrapRecord>(database, 'structured-bootstrap')) ?? null
  );
}

async function hasTypeCheckpoint(
  database: IDBDatabase,
  entityType: PilotEntityType,
): Promise<boolean> {
  const record = await readSetting<SyncStructuredBootstrapTypeRecord>(
    database,
    `structured-bootstrap:${entityType}`,
  );
  return record?.status === 'complete';
}

async function putTypeCheckpoint(
  database: IDBDatabase,
  entityType: PilotEntityType,
  snapshotId: string,
): Promise<void> {
  const completedAt = new Date().toISOString();
  await putSetting(database, {
    id: `structured-bootstrap:${entityType}`,
    entityType,
    snapshotId,
    status: 'complete',
    completedAt,
  } satisfies SyncStructuredBootstrapTypeRecord);
}

async function readSetting<T>(database: IDBDatabase, id: string): Promise<T | undefined> {
  const transaction = database.transaction(LIFE_OS_SYNC_STORE.settings, 'readonly');
  const record = await request<T | undefined>(
    transaction.objectStore(LIFE_OS_SYNC_STORE.settings).get(id),
  );
  await done(transaction);
  return record;
}

async function putSetting(database: IDBDatabase, value: object): Promise<void> {
  const transaction = database.transaction(LIFE_OS_SYNC_STORE.settings, 'readwrite');
  transaction.objectStore(LIFE_OS_SYNC_STORE.settings).put(value);
  await done(transaction);
}

async function readBatchIds(
  database: IDBDatabase,
  storeName: string,
  afterId?: string,
): Promise<readonly string[]> {
  const transaction = database.transaction(storeName, 'readonly');
  const completion = done(transaction);
  void completion.catch(() => undefined);
  try {
    const ids = await new Promise<string[]>((resolve, reject) => {
      const ids: string[] = [];
      const cursorRequest = transaction.objectStore(storeName).openKeyCursor();
      cursorRequest.onerror = () => reject(cursorRequest.error);
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor === null) {
          resolve(ids);
          return;
        }
        if (typeof cursor.key !== 'string' || cursor.key.length === 0) {
          reject(new Error('Structured record has no stable ID.'));
          return;
        }
        if (afterId !== undefined && cursor.key < afterId) {
          cursor.continue(afterId);
          return;
        }
        if (cursor.key !== afterId) ids.push(cursor.key);
        if (ids.length === 100) {
          resolve(ids);
          return;
        }
        cursor.continue();
      };
    });
    await completion;
    return ids;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      /* Already aborted. */
    }
    await completion.catch(() => undefined);
    throw error;
  }
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
