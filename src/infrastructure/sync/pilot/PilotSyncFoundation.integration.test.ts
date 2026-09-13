import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { DomainError } from '../../../shared/errors/DomainError';
import {
  PilotPullEngine,
  PilotPushEngine,
  serializePilotSyncPayload,
  type PilotSyncPayload,
} from '../../../application/sync/pilot';
import type { PilotCryptoEnvelope } from '../../../application/sync/ports/SyncCryptoService';
import {
  LIFE_OS_STORE,
  LIFE_OS_SYNC_STORE,
  LifeOsIndexedDb,
} from '../../persistence/indexed-db/LifeOsIndexedDb';
import type {
  SyncObjectMetaRecord,
  SyncOutboxRecord,
  SyncSettingsRecord,
} from '../../persistence/records/SyncStoreRecords';
import { IndexedDbPilotSyncStore } from './IndexedDbPilotSyncStore';

describe('SYNC-03.1 composed IndexedDB foundation paths', () => {
  it('restarts, retries an immutable old envelope, then sends the same event under the current epoch', async () => {
    const factory = new IDBFactory();
    const firstIndexedDb = new LifeOsIndexedDb(factory);
    const database = await firstIndexedDb.open();
    const oldPayload = payload('goal', 'goal-1', 'event-1', 1, {
      ...goalRecord(),
      title: 'Preserved user content',
    });
    const seed = database.transaction(
      [
        LIFE_OS_STORE.goals,
        LIFE_OS_SYNC_STORE.settings,
        LIFE_OS_SYNC_STORE.objectMeta,
        LIFE_OS_SYNC_STORE.outbox,
      ],
      'readwrite',
    );
    seed.objectStore(LIFE_OS_STORE.goals).put({
      ...goalRecord(),
      title: 'Preserved user content',
      coverImage: null,
    });
    seed.objectStore(LIFE_OS_SYNC_STORE.settings).put(settings(2));
    seed.objectStore(LIFE_OS_SYNC_STORE.objectMeta).put(meta());
    seed.objectStore(LIFE_OS_SYNC_STORE.outbox).put(outbox(oldPayload));
    await done(seed);
    firstIndexedDb.close();

    const restartedIndexedDb = new LifeOsIndexedDb(factory);
    const store = new IndexedDbPilotSyncStore(
      restartedIndexedDb,
      () => 'unused',
      () => new Date('2026-09-06T12:00:00.000Z'),
    );
    const pushed: PilotCryptoEnvelope[] = [];
    const transport = {
      push: vi.fn(async (envelope: PilotCryptoEnvelope) => {
        pushed.push(envelope);
        if (pushed.length === 1) {
          throw new DomainError('sync.pilot_event_rejected', 'old epoch is not current');
        }
        return { sequence: 42, isCurrentWinner: true };
      }),
    };
    const crypto = {
      encryptPilotPayload: vi.fn(
        async ({ metadata }: { metadata: PilotCryptoEnvelope['metadata'] }) => ({
          metadata,
          ciphertext: 'current-cipher',
          nonce: 'current-nonce',
        }),
      ),
    };

    await expect(
      new PilotPushEngine(store, crypto as never, transport as never).run(),
    ).resolves.toEqual({ sent: 1, failed: 0 });

    expect(pushed).toHaveLength(2);
    expect(pushed[0]).toMatchObject({
      metadata: { eventId: 'event-1', originDeviceId: 'old-device', keyEpoch: 1 },
      ciphertext: 'old-cipher',
      nonce: 'old-nonce',
    });
    expect(pushed[1]).toMatchObject({
      metadata: { eventId: 'event-1', originDeviceId: 'current-device', keyEpoch: 2 },
      ciphertext: 'current-cipher',
      nonce: 'current-nonce',
    });
    const restartedDatabase = await restartedIndexedDb.open();
    expect(await getAll(restartedDatabase, LIFE_OS_SYNC_STORE.outbox)).toEqual([]);
    expect(await get(restartedDatabase, LIFE_OS_STORE.goals, 'goal-1')).toMatchObject({
      title: 'Preserved user content',
      coverImage: null,
    });
    expect(await get(restartedDatabase, LIFE_OS_SYNC_STORE.appliedEvents, 'event-1')).toMatchObject(
      {
        sequence: 42,
        revision: 1,
      },
    );
  });

  it('persists a missing-parent child across restart and automatically applies it after the parent', async () => {
    const factory = new IDBFactory();
    const child = payload('goal', 'goal-1', 'child-event', 3, goalRecord());
    const parent = payload('direction', 'direction-1', 'parent-event', 3, directionRecord());
    const childRemote = remote(10, child, 'transport-goal');
    const parentRemote = remote(11, parent, 'transport-direction');
    const firstIndexedDb = new LifeOsIndexedDb(factory);
    const firstDatabase = await firstIndexedDb.open();
    const seed = firstDatabase.transaction(LIFE_OS_SYNC_STORE.settings, 'readwrite');
    seed.objectStore(LIFE_OS_SYNC_STORE.settings).put(settings(3));
    await done(seed);
    const firstStore = new IndexedDbPilotSyncStore(firstIndexedDb);
    const firstTransport = {
      pull: vi.fn(async () => [childRemote]),
      acknowledge: vi.fn(async () => undefined),
    };
    const decrypt = vi.fn(async (event: typeof childRemote | typeof parentRemote) =>
      serializePilotSyncPayload(event.metadata.eventId === 'child-event' ? child : parent),
    );

    await expect(
      new PilotPullEngine(
        firstStore,
        { decryptPilotPayload: decrypt } as never,
        firstTransport as never,
      ).run(1, 1),
    ).resolves.toEqual({ applied: 0, quarantined: 0 });
    expect(firstTransport.acknowledge).toHaveBeenCalledWith(10);
    expect(await firstStore.deferredRemoteEvents('space')).toEqual([childRemote]);
    firstIndexedDb.close();

    const restartedIndexedDb = new LifeOsIndexedDb(factory);
    const restartedStore = new IndexedDbPilotSyncStore(restartedIndexedDb);
    const secondTransport = {
      pull: vi.fn(async () => [parentRemote]),
      acknowledge: vi.fn(async () => undefined),
    };
    await expect(
      new PilotPullEngine(
        restartedStore,
        { decryptPilotPayload: decrypt } as never,
        secondTransport as never,
      ).run(1, 1),
    ).resolves.toEqual({ applied: 2, quarantined: 0 });

    const restartedDatabase = await restartedIndexedDb.open();
    expect(await get(restartedDatabase, LIFE_OS_STORE.directions, 'direction-1')).toMatchObject({
      name: 'Remote direction',
    });
    expect(await get(restartedDatabase, LIFE_OS_STORE.goals, 'goal-1')).toMatchObject({
      directionId: 'direction-1',
      title: 'Remote goal',
      coverImage: null,
    });
    expect(await restartedStore.hasApplied('parent-event')).toBe(true);
    expect(await restartedStore.hasApplied('child-event')).toBe(true);
    expect(await restartedStore.cursor('space')).toBe(11);
    expect(await restartedStore.deferredRemoteEvents('space')).toEqual([]);
    expect(await restartedStore.counts()).toMatchObject({ quarantined: 0 });
    expect(secondTransport.acknowledge).toHaveBeenCalledWith(11);
  });

  it.each([
    { incomingName: 'Same direction', expectedConflicts: 0, expectedName: 'Same direction' },
    {
      incomingName: 'Actually different',
      expectedConflicts: 1,
      expectedName: 'Actually different',
    },
  ])(
    'runs normalized same-ID comparison through PullEngine and real store for "$incomingName"',
    async ({ incomingName, expectedConflicts, expectedName }) => {
      const indexedDb = new LifeOsIndexedDb(new IDBFactory());
      const database = await indexedDb.open();
      const local = {
        ...directionRecord(),
        name: 'Same direction',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        version: 7,
      };
      const localMeta = {
        ...meta(),
        objectId: 'direction-1',
        transportObjectId: 'bbbbbbbb-0000-4000-8000-000000000001',
        eventId: 'local-event',
        entityType: 'direction',
        revision: 1,
        baseRevision: 0,
        modifiedByDevice: 'windows',
        keyEpoch: 3,
        hlcWallTime: 5,
      } satisfies SyncObjectMetaRecord;
      const incoming: PilotSyncPayload = {
        ...payload('direction', 'direction-1', 'remote-event', 3, directionRecord()),
        originDeviceId: 'android',
        hlc: { wallTime: 10, logical: 0 },
        record: {
          ...directionRecord(),
          name: incomingName,
          createdAt: '2026-09-02T00:00:00.000Z',
          updatedAt: '2026-09-03T00:00:00.000Z',
          version: 99,
        },
      };
      const seed = database.transaction(
        [LIFE_OS_STORE.directions, LIFE_OS_SYNC_STORE.settings, LIFE_OS_SYNC_STORE.objectMeta],
        'readwrite',
      );
      seed.objectStore(LIFE_OS_STORE.directions).put(local);
      seed.objectStore(LIFE_OS_SYNC_STORE.settings).put(settings(3));
      seed.objectStore(LIFE_OS_SYNC_STORE.objectMeta).put(localMeta);
      await done(seed);
      const store = new IndexedDbPilotSyncStore(indexedDb, () => 'conflict-id');
      await runPull(store, incoming, 'aaaaaaaa-0000-4000-8000-000000000001');

      expect(await getAll(database, LIFE_OS_STORE.directions)).toHaveLength(1);
      expect(await getAll(database, LIFE_OS_SYNC_STORE.conflicts)).toHaveLength(expectedConflicts);
      expect(await get(database, LIFE_OS_STORE.directions, 'direction-1')).toMatchObject({
        name: expectedName,
        version: expectedConflicts === 0 ? 7 : 8,
      });
      if (expectedConflicts === 0) {
        expect(await get(database, LIFE_OS_SYNC_STORE.objectMeta, 'direction-1')).toMatchObject({
          transportObjectId: 'aaaaaaaa-0000-4000-8000-000000000001',
          eventId: 'local-event',
          revision: 1,
        });
      }
    },
  );

  it('keeps a revision-8 tombstone deleted when an offline base-7 upsert arrives with a later HLC', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();
    const seed = database.transaction(
      [LIFE_OS_SYNC_STORE.settings, LIFE_OS_SYNC_STORE.objectMeta],
      'readwrite',
    );
    seed.objectStore(LIFE_OS_SYNC_STORE.settings).put(settings(3));
    seed.objectStore(LIFE_OS_SYNC_STORE.objectMeta).put({
      ...meta(),
      objectId: 'direction-1',
      transportObjectId: 'local-transport',
      eventId: 'delete-event',
      entityType: 'direction',
      revision: 8,
      baseRevision: 7,
      deleted: true,
      hlcWallTime: 20,
    } satisfies SyncObjectMetaRecord);
    await done(seed);
    const incoming: PilotSyncPayload = {
      ...payload('direction', 'direction-1', 'offline-upsert', 3, directionRecord()),
      baseRevision: 7,
      revision: 8,
      hlc: { wallTime: 999, logical: 0 },
    };
    const store = new IndexedDbPilotSyncStore(indexedDb);

    await runPull(store, incoming, 'remote-transport');

    expect(await get(database, LIFE_OS_STORE.directions, 'direction-1')).toBeUndefined();
    expect(await get(database, LIFE_OS_SYNC_STORE.objectMeta, 'direction-1')).toMatchObject({
      eventId: 'delete-event',
      revision: 8,
      deleted: true,
    });
    expect(await getAll(database, LIFE_OS_SYNC_STORE.conflicts)).toEqual([]);
  });

  it('does not let a remote base-5/revision-6 payload overwrite local revision 7', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();
    const local = { ...directionRecord(), name: 'Local revision seven', version: 7 };
    const seed = database.transaction(
      [LIFE_OS_STORE.directions, LIFE_OS_SYNC_STORE.settings, LIFE_OS_SYNC_STORE.objectMeta],
      'readwrite',
    );
    seed.objectStore(LIFE_OS_STORE.directions).put(local);
    seed.objectStore(LIFE_OS_SYNC_STORE.settings).put(settings(3));
    seed.objectStore(LIFE_OS_SYNC_STORE.objectMeta).put({
      ...meta(),
      objectId: 'direction-1',
      transportObjectId: 'local-transport',
      eventId: 'local-event-7',
      entityType: 'direction',
      revision: 7,
      baseRevision: 6,
      hlcWallTime: 20,
    } satisfies SyncObjectMetaRecord);
    await done(seed);
    const incoming: PilotSyncPayload = {
      ...payload('direction', 'direction-1', 'stale-event-6', 3, directionRecord()),
      baseRevision: 5,
      revision: 6,
      hlc: { wallTime: 999, logical: 0 },
      record: { ...directionRecord(), name: 'Stale remote write', version: 2 },
    };
    const store = new IndexedDbPilotSyncStore(indexedDb);

    await runPull(store, incoming, 'remote-transport');

    expect(await get(database, LIFE_OS_STORE.directions, 'direction-1')).toMatchObject({
      name: 'Local revision seven',
      version: 7,
    });
    expect(await get(database, LIFE_OS_SYNC_STORE.objectMeta, 'direction-1')).toMatchObject({
      eventId: 'local-event-7',
      revision: 7,
    });
    expect(await getAll(database, LIFE_OS_SYNC_STORE.conflicts)).toEqual([]);
  });
});

async function runPull(
  store: IndexedDbPilotSyncStore,
  value: PilotSyncPayload,
  transportObjectId: string,
): Promise<void> {
  const event = remote(1, value, transportObjectId);
  const transport = {
    pull: vi.fn(async () => [event]),
    acknowledge: vi.fn(async () => undefined),
  };
  const crypto = {
    decryptPilotPayload: vi.fn(async () => serializePilotSyncPayload(value)),
  };
  await expect(
    new PilotPullEngine(store, crypto as never, transport as never).run(),
  ).resolves.toEqual({
    applied: 1,
    quarantined: 0,
  });
}

function payload(
  entityType: 'direction' | 'goal',
  objectId: string,
  eventId: string,
  keyEpoch: number,
  record: Readonly<Record<string, unknown>>,
): PilotSyncPayload {
  return {
    protocolVersion: 1,
    schemaVersion: 1,
    entityType,
    operation: 'upsert',
    objectId,
    eventId,
    originDeviceId: keyEpoch === 1 ? 'old-device' : 'remote-device',
    keyEpoch,
    baseRevision: 0,
    revision: 1,
    hlc: { wallTime: entityType === 'direction' ? 11 : 10, logical: 0 },
    record,
  };
}

function remote(sequence: number, value: PilotSyncPayload, objectId: string) {
  return {
    sequence,
    metadata: {
      protocolVersion: 1 as const,
      purpose: 'pilot_event' as const,
      spaceId: 'space',
      eventId: value.eventId,
      objectId,
      originDeviceId: value.originDeviceId,
      keyEpoch: value.keyEpoch,
      operation: value.operation,
      baseRevision: value.baseRevision,
      revision: value.revision,
      hlcWallTime: value.hlc.wallTime,
      hlcLogical: value.hlc.logical,
    },
    ciphertext: `${value.eventId}-cipher`,
    nonce: `${value.eventId}-nonce`,
  };
}

function settings(keyEpoch: number): SyncSettingsRecord {
  return {
    id: 'sync',
    enabled: false,
    deviceId: 'current-device',
    deviceName: 'Device',
    platform: 'windows',
    publicKey: 'public',
    createdAt: '2026-09-06T00:00:00.000Z',
    spaceId: 'space',
    membershipStatus: 'active',
    currentKeyEpoch: keyEpoch,
    recoveryConfirmedAt: '2026-09-06T00:00:00.000Z',
    snapshotId: 'snapshot',
    setupState: 'configured',
    pendingRevokedDeviceId: null,
    updatedAt: '2026-09-06T00:00:00.000Z',
  };
}

function outbox(value: PilotSyncPayload): SyncOutboxRecord {
  return {
    eventId: value.eventId,
    entityType: value.entityType,
    objectId: value.objectId,
    transportObjectId: '75000000-0000-4000-8000-000000000001',
    baseRevision: value.baseRevision,
    proposedRevision: value.revision,
    operation: value.operation,
    keyEpoch: value.keyEpoch,
    hlcWallTime: value.hlc.wallTime,
    hlcLogical: value.hlc.logical,
    serializedPayload: serializePilotSyncPayload(value),
    encryptedPayload: 'old-cipher',
    encryptedNonce: 'old-nonce',
    state: 'pending',
    retryCount: 0,
    nextAttemptAt: '2026-09-05T00:00:00.000Z',
    leaseUntil: null,
    lastErrorCode: null,
    createdAt: '2026-09-05T00:00:00.000Z',
    updatedAt: '2026-09-05T00:00:00.000Z',
  };
}

function meta(): SyncObjectMetaRecord {
  return {
    objectId: 'goal-1',
    transportObjectId: '75000000-0000-4000-8000-000000000001',
    eventId: 'event-1',
    entityType: 'goal',
    schemaVersion: 1,
    revision: 1,
    baseRevision: 0,
    lastSyncedRevision: 0,
    modifiedAt: '2026-09-05T00:00:00.000Z',
    modifiedByDevice: 'old-device',
    keyEpoch: 1,
    deleted: false,
    hlcWallTime: 10,
    hlcLogical: 0,
    syncStatus: 'pending',
  };
}

function goalRecord() {
  return {
    schemaVersion: 1,
    id: 'goal-1',
    directionId: 'direction-1',
    title: 'Remote goal',
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
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
    archivedAt: null,
    version: 1,
  };
}

function directionRecord() {
  return {
    schemaVersion: 1,
    id: 'direction-1',
    sphereId: null,
    name: 'Remote direction',
    description: null,
    strategicIntent: null,
    desiredState: null,
    inScope: null,
    outOfScope: null,
    status: 'active',
    isMain: false,
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
    version: 1,
  };
}

async function getAll(database: IDBDatabase, storeName: string): Promise<unknown[]> {
  const transaction = database.transaction(storeName, 'readonly');
  return request(transaction.objectStore(storeName).getAll());
}

async function get(
  database: IDBDatabase,
  storeName: string,
  key: IDBValidKey,
): Promise<Record<string, unknown> | undefined> {
  const transaction = database.transaction(storeName, 'readonly');
  return request(transaction.objectStore(storeName).get(key));
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
