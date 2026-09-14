import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import {
  LIFE_OS_STORE,
  LIFE_OS_SYNC_STORE,
  LifeOsIndexedDb,
} from '../../persistence/indexed-db/LifeOsIndexedDb';
import type { SyncSettingsRecord } from '../../persistence/records/SyncStoreRecords';
import { IndexedDbPilotMutationRecorder } from './IndexedDbPilotMutationRecorder';
import { PilotBootstrapService } from './PilotBootstrapService';

describe('PilotBootstrapService', () => {
  it('expands a completed old bootstrap once, preserving the existing checkpoints', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory()),
      db = await indexedDb.open(),
      seed = db.transaction(LIFE_OS_SYNC_STORE.settings, 'readwrite');
    seed.objectStore(LIFE_OS_SYNC_STORE.settings).put(settings());
    seed
      .objectStore(LIFE_OS_SYNC_STORE.settings)
      .put({ id: 'structured-bootstrap', snapshotId: 'old', status: 'complete' });
    seed
      .objectStore(LIFE_OS_SYNC_STORE.settings)
      .put({ id: 'structured-bootstrap:goal', status: 'complete', snapshotId: 'old' });
    await done(seed);
    const snapshots = {
      createPreSyncSnapshot: vi.fn(async () => ({ snapshotId: 'expanded' })),
      verifySnapshot: vi.fn(async () => ({ valid: true })),
    };
    const service = new PilotBootstrapService(
      indexedDb,
      snapshots as never,
      new IndexedDbPilotMutationRecorder(),
    );
    expect((await service.run()).snapshotId).toBe('expanded');
    await service.run();
    expect(snapshots.createPreSyncSnapshot).toHaveBeenCalledOnce();
    const checkpoint = await request<{ snapshotId: string }>(
      db
        .transaction(LIFE_OS_SYNC_STORE.settings)
        .objectStore(LIFE_OS_SYNC_STORE.settings)
        .get('structured-bootstrap:goal'),
    );
    expect(checkpoint.snapshotId).toBe('old');
    indexedDb.close();
  });

  it('bootstraps multiple bounded pages without skipping or repeating stable IDs', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();
    const seed = database.transaction(
      [LIFE_OS_STORE.decisions, LIFE_OS_SYNC_STORE.settings],
      'readwrite',
    );
    for (let index = 0; index < 205; index += 1)
      seed.objectStore(LIFE_OS_STORE.decisions).put(decision(`batch-${index}`));
    seed.objectStore(LIFE_OS_SYNC_STORE.settings).put(settings());
    await done(seed);
    const snapshots = {
      createPreSyncSnapshot: vi.fn(async () => ({
        snapshotId: 'snapshot',
        createdAt: '',
        databaseName: 'lifeos',
        databaseVersion: 21,
        recordCount: 205,
        sha256: 'synthetic',
      })),
      verifySnapshot: vi.fn(async () => ({ valid: true, reason: 'ok' as const, snapshot: null })),
    };
    const service = new PilotBootstrapService(
      indexedDb,
      snapshots,
      new IndexedDbPilotMutationRecorder(),
    );
    expect((await service.run()).queued).toBe(205);
    expect((await service.run()).queued).toBe(0);
    const read = database.transaction(LIFE_OS_SYNC_STORE.outbox);
    expect(await request(read.objectStore(LIFE_OS_SYNC_STORE.outbox).count())).toBe(205);
  });

  it.each(['save', 'delete'] as const)(
    'never publishes a stale bootstrap record after a concurrent %s',
    async (operation) => {
      const indexedDb = new LifeOsIndexedDb(new IDBFactory());
      const database = await indexedDb.open();
      const seed = database.transaction(
        [LIFE_OS_STORE.decisions, LIFE_OS_SYNC_STORE.settings],
        'readwrite',
      );
      seed.objectStore(LIFE_OS_STORE.decisions).put(decision('racing-decision'));
      seed.objectStore(LIFE_OS_SYNC_STORE.settings).put(settings());
      await done(seed);
      const recorder = new IndexedDbPilotMutationRecorder();
      let raced = false;
      let localMutation: Promise<boolean> = Promise.resolve(false);
      const proxy = new Proxy(database, {
        get(target, property) {
          if (property === 'transaction')
            return (stores: string | string[], mode?: IDBTransactionMode) => {
              if (
                !raced &&
                mode === 'readwrite' &&
                Array.isArray(stores) &&
                stores.includes(LIFE_OS_STORE.decisions)
              ) {
                raced = true;
                const local = target.transaction(stores, 'readwrite');
                if (operation === 'save') {
                  const current = {
                    ...decision('racing-decision'),
                    title: 'Concurrent new content',
                    version: 2,
                  };
                  local.objectStore(LIFE_OS_STORE.decisions).put(current);
                  localMutation = recorder.recordUpsert(local, 'decision', current);
                } else {
                  local.objectStore(LIFE_OS_STORE.decisions).delete('racing-decision');
                  localMutation = recorder.recordTombstone(local, 'decision', 'racing-decision');
                }
              }
              return target.transaction(stores, mode);
            };
          const value: unknown = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      vi.spyOn(indexedDb, 'open').mockResolvedValue(proxy);
      const snapshots = {
        createPreSyncSnapshot: vi.fn(async () => ({
          snapshotId: 'snapshot',
          createdAt: '',
          databaseName: 'lifeos',
          databaseVersion: 21,
          recordCount: 1,
          sha256: 'synthetic',
        })),
        verifySnapshot: vi.fn(async () => ({ valid: true, reason: 'ok' as const, snapshot: null })),
      };
      const result = await new PilotBootstrapService(indexedDb, snapshots, recorder).run();
      await localMutation;
      expect(raced).toBe(true);
      expect(result.queued).toBe(0);
      const read = database.transaction(LIFE_OS_SYNC_STORE.outbox);
      const outbox = await request<{ serializedPayload: string }[]>(
        read.objectStore(LIFE_OS_SYNC_STORE.outbox).getAll(),
      );
      expect(outbox).toHaveLength(1);
      expect(outbox[0]?.serializedPayload).toContain(
        operation === 'save' ? 'Concurrent new content' : 'tombstone',
      );
    },
  );

  it('does not consume the one-time bootstrap gate before an active space exists', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const snapshots = {
      createPreSyncSnapshot: vi.fn(),
      verifySnapshot: vi.fn(),
    };
    const result = await new PilotBootstrapService(
      indexedDb,
      snapshots as never,
      new IndexedDbPilotMutationRecorder(),
    ).run();

    expect(result).toEqual({ snapshotId: null, queued: 0 });
    expect(snapshots.createPreSyncSnapshot).not.toHaveBeenCalled();
  });

  it('requires a verified snapshot, preserves legacy IDs, and queues equal names separately', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();
    const seed = database.transaction(
      [LIFE_OS_STORE.directions, LIFE_OS_SYNC_STORE.settings],
      'readwrite',
    );
    seed.objectStore(LIFE_OS_STORE.directions).put(direction('legacy-one'));
    seed.objectStore(LIFE_OS_STORE.directions).put(direction('legacy-two'));
    seed.objectStore(LIFE_OS_SYNC_STORE.settings).put(settings());
    await done(seed);
    const snapshots = {
      createPreSyncSnapshot: vi.fn(async () => ({
        snapshotId: 'snapshot',
        createdAt: '',
        databaseName: 'lifeos',
        databaseVersion: 21,
        recordCount: 2,
        sha256: 'hash',
      })),
      verifySnapshot: vi.fn(async () => ({ valid: true, reason: 'ok' as const, snapshot: null })),
    };
    const ids = ['transport-1', 'event-1', 'transport-2', 'event-2'];
    const recorder = new IndexedDbPilotMutationRecorder({
      createId: () => ids.shift() ?? 'none',
      now: () => new Date('2026-09-04T00:00:00.000Z'),
    });
    await expect(new PilotBootstrapService(indexedDb, snapshots, recorder).run()).resolves.toEqual({
      snapshotId: 'snapshot',
      queued: 2,
    });
    const outbox = database
      .transaction(LIFE_OS_SYNC_STORE.outbox)
      .objectStore(LIFE_OS_SYNC_STORE.outbox);
    const records = (await request(outbox.getAll())) as ReadonlyArray<{
      objectId: string;
      transportObjectId: string;
    }>;
    expect(records.map(({ objectId }) => objectId).sort()).toEqual(['legacy-one', 'legacy-two']);
    expect(records.map(({ transportObjectId }) => transportObjectId).sort()).toEqual([
      'transport-1',
      'transport-2',
    ]);
  });

  it('honors the completed SYNC-03 pilot gate and checkpoints each newly enabled type', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();
    const seed = database.transaction(
      [LIFE_OS_STORE.directions, LIFE_OS_STORE.decisions, LIFE_OS_SYNC_STORE.settings],
      'readwrite',
    );
    seed.objectStore(LIFE_OS_STORE.directions).put(direction('existing-pilot-direction'));
    seed.objectStore(LIFE_OS_STORE.decisions).put(decision('new-decision'));
    seed.objectStore(LIFE_OS_SYNC_STORE.settings).put(settings());
    seed.objectStore(LIFE_OS_SYNC_STORE.settings).put({
      id: 'pilot-bootstrap',
      snapshotId: 'pilot-snapshot',
      status: 'complete',
      completedAt: '2026-09-06T00:00:00.000Z',
    });
    await done(seed);
    const snapshots = {
      createPreSyncSnapshot: vi.fn(async () => ({
        snapshotId: 'sync-04-snapshot',
        createdAt: '',
        databaseName: 'lifeos',
        databaseVersion: 21,
        recordCount: 2,
        sha256: 'hash',
      })),
      verifySnapshot: vi.fn(async () => ({ valid: true, reason: 'ok' as const, snapshot: null })),
    };
    const ids = ['transport-decision', 'event-decision'];
    const recorder = new IndexedDbPilotMutationRecorder({
      createId: () => ids.shift() ?? 'unexpected',
      now: () => new Date('2026-09-07T00:00:00.000Z'),
    });
    const service = new PilotBootstrapService(indexedDb, snapshots, recorder);

    await expect(service.run()).resolves.toEqual({ snapshotId: 'sync-04-snapshot', queued: 1 });
    await expect(service.run()).resolves.toEqual({ snapshotId: 'sync-04-snapshot', queued: 0 });
    expect(snapshots.createPreSyncSnapshot).toHaveBeenCalledOnce();
    const outbox = (await request(
      database
        .transaction(LIFE_OS_SYNC_STORE.outbox)
        .objectStore(LIFE_OS_SYNC_STORE.outbox)
        .getAll(),
    )) as ReadonlyArray<{ readonly entityType: string; readonly objectId: string }>;
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ entityType: 'decision', objectId: 'new-decision' });
    const checkpoints = (await request(
      database
        .transaction(LIFE_OS_SYNC_STORE.settings)
        .objectStore(LIFE_OS_SYNC_STORE.settings)
        .getAll(),
    )) as ReadonlyArray<{ readonly id: string }>;
    expect(checkpoints.some(({ id }) => id === 'structured-bootstrap:direction')).toBe(true);
    expect(checkpoints.some(({ id }) => id === 'structured-bootstrap:decision')).toBe(true);
  });

  it('reconciles meaningful local settings after the structured bootstrap is already complete', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();
    const seed = database.transaction(LIFE_OS_SYNC_STORE.settings, 'readwrite');
    seed.objectStore(LIFE_OS_SYNC_STORE.settings).put(settings());
    seed.objectStore(LIFE_OS_SYNC_STORE.settings).put({
      id: 'structured-bootstrap',
      snapshotId: 'existing-snapshot',
      status: 'complete',
      completedAt: '2026-09-07T00:00:00.000Z',
      updatedAt: '2026-09-07T00:00:00.000Z',
    });
    await done(seed);
    const expanded = database.transaction(LIFE_OS_SYNC_STORE.settings, 'readwrite');
    for (const type of [
      'planning_period',
      'period_membership',
      'period_decision',
      'contribution_link',
      'progress_contribution',
      'recurrence_rule',
    ])
      expanded
        .objectStore(LIFE_OS_SYNC_STORE.settings)
        .put({ id: `structured-bootstrap:${type}`, status: 'complete' });
    await done(expanded);
    const settingsSync = { reconcile: vi.fn(async () => true) };
    const snapshots = {
      createPreSyncSnapshot: vi.fn(),
      verifySnapshot: vi.fn(),
    };

    await expect(
      new PilotBootstrapService(
        indexedDb,
        snapshots as never,
        new IndexedDbPilotMutationRecorder(),
        settingsSync,
      ).run(),
    ).resolves.toEqual({ snapshotId: 'existing-snapshot', queued: 1 });
    expect(settingsSync.reconcile).toHaveBeenCalledOnce();
    expect(snapshots.createPreSyncSnapshot).not.toHaveBeenCalled();
  });
});

function direction(id: string) {
  return {
    schemaVersion: 1,
    id,
    sphereId: null,
    name: 'Same name',
    description: null,
    strategicIntent: null,
    desiredState: null,
    inScope: null,
    outOfScope: null,
    status: 'active',
    isMain: false,
    createdAt: '2026-09-04T00:00:00.000Z',
    updatedAt: '2026-09-04T00:00:00.000Z',
    version: 1,
  };
}
function settings(): SyncSettingsRecord {
  return {
    id: 'sync',
    enabled: false,
    deviceId: 'device',
    deviceName: 'Device',
    platform: 'windows',
    publicKey: 'public',
    createdAt: '',
    spaceId: 'space',
    membershipStatus: 'active',
    currentKeyEpoch: 3,
    recoveryConfirmedAt: '',
    snapshotId: 'old',
    setupState: 'configured',
    pendingRevokedDeviceId: null,
    updatedAt: '',
  };
}

function decision(id: string) {
  return {
    schemaVersion: 1,
    id,
    title: 'New structured decision',
    reason: null,
    sphereId: null,
    price: null,
    sacrifices: null,
    priority: 'normal',
    projectReference: null,
    projectId: null,
    expectedResult: null,
    actualResultSummary: null,
    status: 'draft',
    kind: 'additional',
    plannedDate: null,
    order: null,
    createdAt: '2026-09-07T00:00:00.000Z',
    plannedAt: null,
    startedAt: null,
    confirmedAt: null,
    cancelledAt: null,
    cancelReason: null,
    archivedAt: null,
    deletedAt: null,
    lastDeletedAt: null,
    restoredFromTrashAt: null,
    evidenceIds: [],
    rescheduleCount: 0,
    rescheduleHistory: [],
    version: 1,
  };
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
  });
}
