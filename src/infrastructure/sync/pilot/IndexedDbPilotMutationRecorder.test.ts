import { IDBDatabase as FakeIdbDatabase, IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import {
  LIFE_OS_STORE,
  LIFE_OS_SYNC_STORE,
  LifeOsIndexedDb,
} from '../../persistence/indexed-db/LifeOsIndexedDb';
import type { SyncSettingsRecord } from '../../persistence/records/SyncStoreRecords';
import {
  IndexedDbPilotMutationRecorder,
  PILOT_MUTATION_STORES,
} from './IndexedDbPilotMutationRecorder';
import { IndexedDbPilotSyncStore } from './IndexedDbPilotSyncStore';
import { parsePilotSyncPayload } from '../../../application/sync/pilot';
import { LIFE_OS_SYNC_REGISTRY } from '../LifeOsSyncRegistry';
import { normalizePilotRecord } from './PilotSyncRegistryAdapters';

describe('IndexedDbPilotMutationRecorder', () => {
  it.each(['sign_in_required', 'device_recovery_required'] as const)(
    'queues local edits during %s and rebases them after recovery',
    async (state) => {
      const indexedDb = new LifeOsIndexedDb(new IDBFactory());
      const database = await indexedDb.open();
      await putSettings(database, {
        ...activeSettings(),
        accountSetupState: state,
        accountUserId: '30000000-0000-4000-8000-000000000001',
        accountSessionId: '40000000-0000-4000-8000-000000000001',
        accountEmail: 'person@example.com',
        accountMigrationSnapshotId: null,
      });
      const recorder = new IndexedDbPilotMutationRecorder({
        createId: (() => {
          const ids = ['transport-local', 'event-local'];
          return () => ids.shift() ?? 'unexpected';
        })(),
      });
      const transaction = database.transaction(
        [LIFE_OS_STORE.goals, ...PILOT_MUTATION_STORES],
        'readwrite',
      );
      const record = goalRecord();
      transaction.objectStore(LIFE_OS_STORE.goals).put(record);
      expect(await recorder.recordUpsert(transaction, 'goal', record)).toBe(true);
      await done(transaction);
      const syncStore = new IndexedDbPilotSyncStore(
        indexedDb,
        () => 'unused',
        () => new Date('2026-09-29T12:00:00Z'),
      );
      await syncStore.prepareOutboxForInstallation({
        deviceId: '10000000-0000-4000-8000-000000000009',
        keyEpoch: 4,
      });
      const read = database.transaction(LIFE_OS_SYNC_STORE.outbox, 'readonly');
      const outbox = await get<{ serializedPayload: string }>(
        read.objectStore(LIFE_OS_SYNC_STORE.outbox),
        'event-local',
      );
      expect(parsePilotSyncPayload(outbox?.serializedPayload ?? '')).toMatchObject({
        eventId: 'event-local',
        originDeviceId: '10000000-0000-4000-8000-000000000009',
        keyEpoch: 4,
        revision: 1,
      });
      indexedDb.close();
    },
  );
  it('commits domain record, metadata, HLC and immutable outbox payload in one transaction', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();
    await putSettings(database, activeSettings());
    const notify = vi.fn();
    const recorder = new IndexedDbPilotMutationRecorder({
      createId: (() => {
        const ids = ['transport-object-1', 'event-1'];
        return () => ids.shift() ?? 'unexpected';
      })(),
      now: () => new Date('2026-09-04T12:00:00.000Z'),
      notify,
    });
    const transaction = database.transaction(
      [LIFE_OS_STORE.goals, ...PILOT_MUTATION_STORES],
      'readwrite',
    );
    const record = goalRecord();
    transaction.objectStore(LIFE_OS_STORE.goals).put(record);
    const recorded = await recorder.recordUpsert(transaction, 'goal', record);
    await done(transaction);
    recorder.notifyCommitted(recorded);

    const read = database.transaction(
      [
        LIFE_OS_STORE.goals,
        LIFE_OS_SYNC_STORE.objectMeta,
        LIFE_OS_SYNC_STORE.outbox,
        LIFE_OS_SYNC_STORE.settings,
      ],
      'readonly',
    );
    expect(await get(read.objectStore(LIFE_OS_STORE.goals), 'legacy-goal')).toEqual(record);
    expect(await get(read.objectStore(LIFE_OS_SYNC_STORE.objectMeta), 'legacy-goal')).toMatchObject(
      { revision: 1, syncStatus: 'pending', hlcLogical: 0 },
    );
    const outbox = await get<Record<string, unknown>>(
      read.objectStore(LIFE_OS_SYNC_STORE.outbox),
      'event-1',
    );
    expect(outbox).toMatchObject({
      objectId: 'legacy-goal',
      transportObjectId: 'transport-object-1',
      state: 'pending',
      keyEpoch: 3,
    });
    expect(String(outbox?.serializedPayload)).not.toContain('dataUrl');
    expect(await get(read.objectStore(LIFE_OS_SYNC_STORE.settings), 'pilot-clock')).toMatchObject({
      wallTime: 1788523200000,
      logical: 0,
    });
    expect(notify).toHaveBeenCalledOnce();
  });

  it('does not create sync metadata when Sync is not active', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();
    const recorder = new IndexedDbPilotMutationRecorder({ createId: () => 'unused' });
    const transaction = database.transaction(
      [LIFE_OS_STORE.directions, ...PILOT_MUTATION_STORES],
      'readwrite',
    );
    transaction.objectStore(LIFE_OS_STORE.directions).put({ id: 'direction-1' });
    expect(await recorder.recordUpsert(transaction, 'direction', { id: 'direction-1' })).toBe(
      false,
    );
    await done(transaction);
    const read = database.transaction(LIFE_OS_SYNC_STORE.outbox, 'readonly');
    expect(await all(read.objectStore(LIFE_OS_SYNC_STORE.outbox))).toEqual([]);
  });

  it('records a new structured entity through the same outbox and omits receiver-local version', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();
    await putSettings(database, activeSettings());
    const recorder = new IndexedDbPilotMutationRecorder({
      createId: (() => {
        const ids = ['transport-decision-1', 'event-decision-1'];
        return () => ids.shift() ?? 'unexpected';
      })(),
      now: () => new Date('2026-09-07T00:00:00.000Z'),
    });
    const record = decisionRecord();
    const transaction = database.transaction(
      [LIFE_OS_STORE.decisions, ...PILOT_MUTATION_STORES],
      'readwrite',
    );
    transaction.objectStore(LIFE_OS_STORE.decisions).put(record);
    expect(await recorder.recordUpsert(transaction, 'decision', record)).toBe(true);
    await done(transaction);

    const read = database.transaction(LIFE_OS_SYNC_STORE.outbox, 'readonly');
    const outbox = await get<Record<string, unknown>>(
      read.objectStore(LIFE_OS_SYNC_STORE.outbox),
      'event-decision-1',
    );
    const payload = parsePilotSyncPayload(String(outbox?.serializedPayload));
    expect(payload).toMatchObject({ entityType: 'decision', objectId: 'decision-1' });
    expect(payload.record).toMatchObject({ id: 'decision-1', title: 'Synthetic decision' });
    expect(payload.record).not.toHaveProperty('version');
  });

  it('captures non-pilot repository writes centrally in the same IndexedDB transaction', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const notify = vi.fn();
    const recorder = new IndexedDbPilotMutationRecorder({
      createId: (() => {
        const ids = ['transport-decision-2', 'event-decision-2'];
        return () => ids.shift() ?? 'unexpected';
      })(),
      now: () => new Date('2026-09-07T00:00:00.000Z'),
      notify,
    });
    indexedDb.configureSyncMutationCapture(recorder, LIFE_OS_SYNC_REGISTRY, [
      'direction',
      'project',
      'goal',
    ]);
    const database = await indexedDb.open();
    await putSettings(database, activeSettings());
    const transaction = database.transaction(LIFE_OS_STORE.decisions, 'readwrite');
    transaction.objectStore(LIFE_OS_STORE.decisions).put({
      ...decisionRecord(),
      id: 'decision-2',
    });
    await done(transaction);

    const read = database.transaction(
      [LIFE_OS_STORE.decisions, LIFE_OS_SYNC_STORE.outbox],
      'readonly',
    );
    expect(await get(read.objectStore(LIFE_OS_STORE.decisions), 'decision-2')).toBeDefined();
    expect(
      await get(read.objectStore(LIFE_OS_SYNC_STORE.outbox), 'event-decision-2'),
    ).toMatchObject({
      entityType: 'decision',
      objectId: 'decision-2',
    });
    expect(notify).toHaveBeenCalledOnce();
  });

  it('forwards transaction event-handler setters to the native IndexedDB receiver', async () => {
    const nativeTransactions = new WeakSet<object>();
    const databasePrototype = FakeIdbDatabase.prototype;
    const originalTransaction = databasePrototype.transaction;

    databasePrototype.transaction = function (...args): IDBTransaction {
      const transaction = Reflect.apply(originalTransaction, this, args) as IDBTransaction;
      nativeTransactions.add(transaction);
      let oncomplete = transaction.oncomplete;
      Object.defineProperty(transaction, 'oncomplete', {
        configurable: true,
        enumerable: true,
        get() {
          if (!nativeTransactions.has(this)) throw new TypeError('Illegal invocation');
          return oncomplete;
        },
        set(value: ((this: IDBTransaction, ev: Event) => unknown) | null) {
          if (!nativeTransactions.has(this)) throw new TypeError('Illegal invocation');
          oncomplete = value;
        },
      });
      return transaction;
    };

    try {
      const indexedDb = new LifeOsIndexedDb(new IDBFactory());
      indexedDb.configureSyncMutationCapture(
        new IndexedDbPilotMutationRecorder(),
        LIFE_OS_SYNC_REGISTRY,
        ['direction', 'project', 'goal'],
      );
      const database = await indexedDb.open();
      const transaction = database.transaction(LIFE_OS_STORE.spheres, 'readwrite');
      transaction.objectStore(LIFE_OS_STORE.spheres).put({
        schemaVersion: 1,
        id: 'sphere-setter-receiver',
        name: 'Setter receiver',
        normalizedName: 'setter receiver',
        description: null,
        icon: '○',
        color: '#557f9e',
        status: 'active',
        createdAt: '2026-09-07T00:00:00.000Z',
        updatedAt: '2026-09-07T00:00:00.000Z',
        version: 1,
      });

      await expect(done(transaction)).resolves.toBeUndefined();
    } finally {
      databasePrototype.transaction = originalTransaction;
    }
  });

  it('captures a physical delete as a tombstone while state-only transitions remain upserts', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const recorder = new IndexedDbPilotMutationRecorder({
      createId: (() => {
        const ids = [
          'transport-walk-1',
          'event-walk-upsert',
          'event-walk-delete',
          'transport-decision-3',
          'event-decision-complete',
        ];
        return () => ids.shift() ?? 'unexpected';
      })(),
      now: () => new Date('2026-09-07T00:00:00.000Z'),
    });
    indexedDb.configureSyncMutationCapture(recorder, LIFE_OS_SYNC_REGISTRY, [
      'direction',
      'project',
      'goal',
    ]);
    const database = await indexedDb.open();
    await putSettings(database, activeSettings());
    const walk = {
      schemaVersion: 1,
      id: 'walk-1',
      date: '2026-09-07',
      type: 'mindful',
      sphereId: null,
      intent: null,
      reflectionTemplate: null,
      reflectionStage: null,
      beforeState: null,
      afterState: null,
      impact: null,
      linkedEntity: null,
      returnContext: null,
      reentry: null,
      status: 'planned',
      mode: null,
      startedAt: null,
      pausedAt: null,
      pauseIntervals: [],
      endedAt: null,
      timerTargetMinutes: null,
      reflectionQuestion: null,
      result: null,
      photo: null,
      createdAt: '2026-09-07T00:00:00.000Z',
      updatedAt: '2026-09-07T00:00:00.000Z',
      version: 1,
    };
    expect(normalizePilotRecord('walk', walk)).not.toHaveProperty('photo');
    let transaction = database.transaction(LIFE_OS_STORE.walks, 'readwrite');
    transaction.objectStore(LIFE_OS_STORE.walks).put(walk);
    await expect(done(transaction)).resolves.toBeUndefined();
    transaction = database.transaction(LIFE_OS_STORE.walks, 'readwrite');
    transaction.objectStore(LIFE_OS_STORE.walks).delete('walk-1');
    await expect(done(transaction)).resolves.toBeUndefined();
    transaction = database.transaction(LIFE_OS_STORE.decisions, 'readwrite');
    transaction.objectStore(LIFE_OS_STORE.decisions).put({
      ...decisionRecord(),
      id: 'decision-3',
      deletedAt: '2026-09-07T00:00:00.000Z',
      lastDeletedAt: '2026-09-07T00:00:00.000Z',
    });
    await expect(done(transaction)).resolves.toBeUndefined();

    const events = (await all(
      database.transaction(LIFE_OS_SYNC_STORE.outbox).objectStore(LIFE_OS_SYNC_STORE.outbox),
    )) as ReadonlyArray<{ readonly entityType: string; readonly operation: string }>;
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: 'walk', operation: 'tombstone' }),
        expect.objectContaining({ entityType: 'decision', operation: 'upsert' }),
      ]),
    );
    expect(events.filter(({ entityType }) => entityType === 'decision')).toHaveLength(1);
  });

  it('suppresses mutation capture for remote apply transactions', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const recorder = new IndexedDbPilotMutationRecorder({ createId: () => 'unexpected' });
    indexedDb.configureSyncMutationCapture(recorder, LIFE_OS_SYNC_REGISTRY, [
      'direction',
      'project',
      'goal',
    ]);
    const database = await indexedDb.open();
    await putSettings(database, activeSettings());
    await indexedDb.withMutationCaptureSuppressed(async () => {
      const transaction = database.transaction(LIFE_OS_STORE.decisions, 'readwrite');
      transaction.objectStore(LIFE_OS_STORE.decisions).put(decisionRecord());
      await done(transaction);
    });
    const read = database.transaction(LIFE_OS_SYNC_STORE.outbox, 'readonly');
    expect(await all(read.objectStore(LIFE_OS_SYNC_STORE.outbox))).toEqual([]);
  });

  it('keeps a rotation-pending mutation in the durable outbox across restart', async () => {
    const factory = new IDBFactory();
    const firstIndexedDb = new LifeOsIndexedDb(factory);
    const firstDatabase = await firstIndexedDb.open();
    await putSettings(firstDatabase, {
      ...activeSettings(),
      setupState: 'rotation_pending',
      pendingRevokedDeviceId: '10000000-0000-4000-8000-000000000002',
    });
    const recorder = new IndexedDbPilotMutationRecorder({
      createId: (() => {
        const ids = ['transport-direction-1', 'event-during-rotation'];
        return () => ids.shift() ?? 'unexpected';
      })(),
      now: () => new Date('2026-09-04T12:00:00.000Z'),
    });
    const transaction = firstDatabase.transaction(
      [LIFE_OS_STORE.directions, ...PILOT_MUTATION_STORES],
      'readwrite',
    );
    const record = directionRecord('direction-during-rotation');
    transaction.objectStore(LIFE_OS_STORE.directions).put(record);

    expect(await recorder.recordUpsert(transaction, 'direction', record)).toBe(true);
    await done(transaction);
    firstIndexedDb.close();

    const restartedIndexedDb = new LifeOsIndexedDb(factory);
    const restartedDatabase = await restartedIndexedDb.open();
    const read = restartedDatabase.transaction(
      [LIFE_OS_STORE.directions, LIFE_OS_SYNC_STORE.objectMeta, LIFE_OS_SYNC_STORE.outbox],
      'readonly',
    );
    expect(
      await get(read.objectStore(LIFE_OS_STORE.directions), 'direction-during-rotation'),
    ).toEqual(record);
    expect(
      await get(read.objectStore(LIFE_OS_SYNC_STORE.objectMeta), 'direction-during-rotation'),
    ).toMatchObject({ revision: 1, syncStatus: 'pending', keyEpoch: 3 });
    expect(
      await get(read.objectStore(LIFE_OS_SYNC_STORE.outbox), 'event-during-rotation'),
    ).toMatchObject({
      objectId: 'direction-during-rotation',
      state: 'pending',
      keyEpoch: 3,
      encryptedPayload: null,
    });

    await putSettings(restartedDatabase, {
      ...activeSettings(),
      deviceId: '10000000-0000-4000-8000-000000000009',
      currentKeyEpoch: 4,
    });
    const syncStore = new IndexedDbPilotSyncStore(restartedIndexedDb);
    await syncStore.prepareOutboxForInstallation({
      deviceId: '10000000-0000-4000-8000-000000000009',
      keyEpoch: 4,
    });
    const [leased] = await syncStore.lease();
    expect(leased).toMatchObject({ eventId: 'event-during-rotation', keyEpoch: 4 });
    expect(parsePilotSyncPayload(leased?.serializedPayload ?? '')).toMatchObject({
      eventId: 'event-during-rotation',
      originDeviceId: '10000000-0000-4000-8000-000000000009',
      keyEpoch: 4,
    });
  });
});

function activeSettings(): SyncSettingsRecord {
  return {
    id: 'sync',
    enabled: false,
    deviceId: '10000000-0000-4000-8000-000000000001',
    deviceName: 'Device',
    platform: 'android',
    publicKey: 'public',
    createdAt: '2026-09-04T00:00:00.000Z',
    spaceId: '20000000-0000-4000-8000-000000000001',
    membershipStatus: 'active',
    currentKeyEpoch: 3,
    recoveryConfirmedAt: '2026-09-04T00:00:00.000Z',
    snapshotId: 'snapshot',
    setupState: 'configured',
    pendingRevokedDeviceId: null,
    updatedAt: '2026-09-04T00:00:00.000Z',
  };
}

function decisionRecord() {
  return {
    schemaVersion: 1 as const,
    id: 'decision-1',
    title: 'Synthetic decision',
    reason: null,
    sphereId: null,
    price: null,
    sacrifices: null,
    priority: 'normal' as const,
    projectReference: null,
    projectId: null,
    expectedResult: null,
    actualResultSummary: null,
    status: 'draft' as const,
    kind: 'additional' as const,
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

function goalRecord() {
  return {
    schemaVersion: 1 as const,
    id: 'legacy-goal',
    directionId: 'direction-1',
    title: 'Synthetic',
    description: null,
    whyImportant: null,
    whyNow: null,
    status: 'active',
    stage: 'active_goal',
    intentionLevel: null,
    horizon: null,
    progressType: null,
    progress: null,
    achievementCriteria: null,
    nextProgress: null,
    coverImage: { dataUrl: 'excluded', mimeType: 'image/png', sizeBytes: 1 },
    createdAt: '2026-09-04T12:00:00.000Z',
    updatedAt: '2026-09-04T12:00:00.000Z',
    archivedAt: null,
    version: 1,
  };
}

function directionRecord(id: string) {
  return {
    schemaVersion: 1 as const,
    id,
    sphereId: null,
    name: 'Synthetic direction',
    description: null,
    strategicIntent: null,
    desiredState: null,
    inScope: null,
    outOfScope: null,
    status: 'active',
    isMain: false,
    createdAt: '2026-09-04T12:00:00.000Z',
    updatedAt: '2026-09-04T12:00:00.000Z',
    version: 1,
  };
}

async function putSettings(database: IDBDatabase, settings: SyncSettingsRecord): Promise<void> {
  const transaction = database.transaction(LIFE_OS_SYNC_STORE.settings, 'readwrite');
  transaction.objectStore(LIFE_OS_SYNC_STORE.settings).put(settings);
  await done(transaction);
}

function get<T = unknown>(store: IDBObjectStore, key: IDBValidKey): Promise<T | undefined> {
  return request(store.get(key)) as Promise<T | undefined>;
}
function all(store: IDBObjectStore): Promise<unknown[]> {
  return request(store.getAll());
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
