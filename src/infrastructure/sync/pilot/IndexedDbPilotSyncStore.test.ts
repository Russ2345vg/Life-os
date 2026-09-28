import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_EVENING_RITUAL_SETTINGS } from '../../../application/evening-settings';
import {
  LIFE_OS_STORE,
  LIFE_OS_SYNC_STORE,
  LifeOsIndexedDb,
} from '../../persistence/indexed-db/LifeOsIndexedDb';
import type { SyncOutboxRecord } from '../../persistence/records/SyncStoreRecords';
import { parsePilotSyncPayload, serializePilotSyncPayload } from '../../../application/sync/pilot';
import { IndexedDbPilotSyncStore } from './IndexedDbPilotSyncStore';
import { IndexedDbPilotMutationRecorder } from './IndexedDbPilotMutationRecorder';
import { LIFE_OS_SYNC_REGISTRY } from '../LifeOsSyncRegistry';

describe('IndexedDbPilotSyncStore', () => {
  it('recovers an expired sending lease and retains immutable ciphertext across retry', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();
    const transaction = database.transaction(LIFE_OS_SYNC_STORE.outbox, 'readwrite');
    transaction.objectStore(LIFE_OS_SYNC_STORE.outbox).put(outbox());
    await done(transaction);
    const store = new IndexedDbPilotSyncStore(
      indexedDb,
      () => 'id',
      () => new Date('2026-09-04T12:00:00.000Z'),
    );
    const leased = await store.lease();
    expect(leased).toHaveLength(1);
    const encrypted = await store.saveEncrypted('event-1', {
      metadata: metadata(),
      ciphertext: 'cipher',
      nonce: 'nonce',
    });
    expect(encrypted.encryptedPayload).toBe('cipher');
    await store.retry('event-1', 'offline');
    expect((await allOutbox(database))[0]).toMatchObject({
      state: 'pending',
      encryptedPayload: 'cipher',
      retryCount: 1,
    });
    await store.quarantineOutbox('event-1', 'sync.pilot_event_rejected');
    expect((await allOutbox(database))[0]).toMatchObject({
      state: 'quarantined',
      encryptedPayload: 'cipher',
      lastErrorCode: 'sync.pilot_event_rejected',
    });
    await expect(store.counts()).resolves.toMatchObject({ pending: 0, quarantined: 1 });
  });

  it.each(['sync.pilot_event_rejected', 'sync.pilot_transport_denied', 'crypto'])(
    'revives a stale %s envelope for exact replay and can rematerialize it without semantic drift',
    async (lastErrorCode) => {
      const factory = new IDBFactory();
      const firstIndexedDb = new LifeOsIndexedDb(factory);
      const database = await firstIndexedDb.open();
      const semanticRecord = { id: 'goal-1', title: 'Preserved user content' };
      const oldPayload = serializePilotSyncPayload({
        protocolVersion: 1,
        schemaVersion: 1,
        entityType: 'goal',
        operation: 'upsert',
        objectId: 'goal-1',
        eventId: 'event-1',
        originDeviceId: 'old-device',
        keyEpoch: 1,
        baseRevision: 4,
        revision: 5,
        hlc: { wallTime: 10, logical: 2 },
        record: semanticRecord,
      });
      const seed = database.transaction(LIFE_OS_SYNC_STORE.outbox, 'readwrite');
      seed.objectStore(LIFE_OS_SYNC_STORE.outbox).put({
        ...outbox(),
        keyEpoch: 1,
        baseRevision: 4,
        proposedRevision: 5,
        hlcWallTime: 10,
        hlcLogical: 2,
        serializedPayload: oldPayload,
        encryptedPayload: 'old-cipher',
        encryptedNonce: 'old-nonce',
        state: 'quarantined',
        lastErrorCode,
      } satisfies SyncOutboxRecord);
      await done(seed);
      firstIndexedDb.close();

      const restartedIndexedDb = new LifeOsIndexedDb(factory);
      const store = new IndexedDbPilotSyncStore(
        restartedIndexedDb,
        () => 'unused',
        () => new Date('2026-09-04T12:00:00.000Z'),
      );
      await store.prepareOutboxForInstallation({ deviceId: 'new-device', keyEpoch: 2 });

      const restartedDatabase = await restartedIndexedDb.open();
      const replayable = (await allOutbox(restartedDatabase))[0];
      expect(replayable).toMatchObject({
        keyEpoch: 1,
        encryptedPayload: 'old-cipher',
        encryptedNonce: 'old-nonce',
        state: 'pending',
        retryCount: 0,
        lastErrorCode: null,
      });
      await expect(store.lease()).resolves.toHaveLength(1);

      const rematerialized = await store.rematerializeOutboxEvent('event-1', {
        deviceId: 'new-device',
        keyEpoch: 2,
      });
      expect(rematerialized).toMatchObject({
        eventId: 'event-1',
        objectId: 'goal-1',
        transportObjectId: 'transport-1',
        operation: 'upsert',
        baseRevision: 4,
        proposedRevision: 5,
        hlcWallTime: 10,
        hlcLogical: 2,
        keyEpoch: 2,
        encryptedPayload: null,
        encryptedNonce: null,
        state: 'pending',
        retryCount: 0,
        lastErrorCode: null,
      });
      expect(parsePilotSyncPayload(rematerialized?.serializedPayload ?? '')).toMatchObject({
        eventId: 'event-1',
        originDeviceId: 'new-device',
        keyEpoch: 2,
        baseRevision: 4,
        revision: 5,
        record: semanticRecord,
      });
    },
  );

  it('quarantines a malformed current-epoch payload before it can be leased', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();
    const seed = database.transaction(LIFE_OS_SYNC_STORE.outbox, 'readwrite');
    seed.objectStore(LIFE_OS_SYNC_STORE.outbox).put({
      ...outbox(),
      keyEpoch: 3,
      state: 'pending',
      leaseUntil: null,
    } satisfies SyncOutboxRecord);
    await done(seed);
    const store = new IndexedDbPilotSyncStore(
      indexedDb,
      () => 'unused',
      () => new Date('2026-09-04T12:00:00.000Z'),
    );

    await store.prepareOutboxForInstallation({ deviceId: 'device', keyEpoch: 3 });

    expect((await allOutbox(database))[0]).toMatchObject({
      state: 'quarantined',
      leaseUntil: null,
      lastErrorCode: 'sync.pilot_payload_invalid',
    });
    await expect(store.lease()).resolves.toEqual([]);
  });

  it('applies a remote child atomically without Outbox echo and retains cursor/ledger across restart', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();
    const seed = database.transaction(
      [LIFE_OS_STORE.directions, LIFE_OS_SYNC_STORE.settings],
      'readwrite',
    );
    seed.objectStore(LIFE_OS_STORE.directions).put({ id: 'direction-1' });
    seed.objectStore(LIFE_OS_SYNC_STORE.settings).put(settings());
    await done(seed);
    indexedDb.configureSyncMutationCapture(
      new IndexedDbPilotMutationRecorder({ createId: () => 'unexpected-echo' }),
      LIFE_OS_SYNC_REGISTRY,
      ['direction', 'project', 'goal'],
    );
    const store = new IndexedDbPilotSyncStore(
      indexedDb,
      () => 'conflict-id',
      () => new Date(0),
    );
    const payload = goalPayload();

    await store.applyPulled('space', 7, payload, 'transport-goal-1', {
      kind: 'fast_forward',
      winner: 'incoming',
    });

    expect(await read(database, LIFE_OS_STORE.goals, 'goal-1')).toMatchObject({
      title: 'Remote goal',
      coverImage: null,
    });
    expect(await allOutbox(database)).toEqual([]);
    expect(await new IndexedDbPilotSyncStore(indexedDb).hasApplied('remote-event-1')).toBe(true);
    expect(await new IndexedDbPilotSyncStore(indexedDb).cursor('space')).toBe(7);
    expect(await read(database, LIFE_OS_SYNC_STORE.settings, 'pilot-clock')).toMatchObject({
      wallTime: 500,
      logical: 1,
    });
  });

  it('applies remote meaningful settings through localStorage bridge without syncing UI preferences', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();
    const seed = database.transaction(LIFE_OS_SYNC_STORE.settings, 'readwrite');
    seed.objectStore(LIFE_OS_SYNC_STORE.settings).put(settings());
    await done(seed);
    const settingsSync = {
      stageRemote: vi.fn(() => true),
      materializeRemote: vi.fn(async () => true),
    };
    const store = new IndexedDbPilotSyncStore(
      indexedDb,
      () => 'conflict-id',
      () => new Date(0),
      () => 0.5,
      settingsSync,
    );
    const payload = userSettingsPayload();

    await store.applyPulled('space', 8, payload, 'transport-settings', {
      kind: 'fast_forward',
      winner: 'incoming',
    });

    expect(settingsSync.stageRemote).toHaveBeenCalledWith(expect.anything(), payload.record);
    expect(settingsSync.materializeRemote).toHaveBeenCalledOnce();
    expect(await read(database, LIFE_OS_SYNC_STORE.settings, 'lifeos-user-settings')).toEqual(
      payload.record,
    );
    expect(await allOutbox(database)).toEqual([]);
    expect(await store.cursor('space')).toBe(8);
  });

  it('applies a deterministic new-type conflict and retains the losing structured version', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();
    const local = decisionRecord('decision-1', 'Local decision');
    const seed = database.transaction(
      [LIFE_OS_STORE.decisions, LIFE_OS_SYNC_STORE.objectMeta, LIFE_OS_SYNC_STORE.settings],
      'readwrite',
    );
    seed.objectStore(LIFE_OS_STORE.decisions).put(local);
    seed.objectStore(LIFE_OS_SYNC_STORE.objectMeta).put({
      objectId: 'decision-1',
      transportObjectId: 'transport-local',
      eventId: 'local-event',
      entityType: 'decision',
      schemaVersion: 1,
      revision: 1,
      baseRevision: 0,
      lastSyncedRevision: 0,
      modifiedAt: '2026-09-07T00:00:00.000Z',
      modifiedByDevice: 'windows',
      keyEpoch: 3,
      deleted: false,
      hlcWallTime: 500,
      hlcLogical: 0,
      syncStatus: 'pending',
    });
    seed.objectStore(LIFE_OS_SYNC_STORE.settings).put(settings());
    await done(seed);
    const store = new IndexedDbPilotSyncStore(indexedDb, () => 'conflict-decision');
    const payload = decisionPayload('Remote decision');

    await store.applyPulled('space', 9, payload, 'transport-remote', {
      kind: 'conflict',
      winner: 'incoming',
    });

    expect(await read(database, LIFE_OS_STORE.decisions, 'decision-1')).toMatchObject({
      title: 'Remote decision',
      version: 2,
    });
    expect(await read(database, LIFE_OS_SYNC_STORE.conflicts, 'conflict-decision')).toMatchObject({
      entityType: 'decision',
      objectId: 'decision-1',
      winningEventId: 'remote-decision-event',
      losingPayload: expect.objectContaining({ title: 'Local decision' }),
      resolutionStatus: 'unresolved',
    });
  });

  it('signals a typed missing dependency so the pull engine can own deferral', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();
    const seed = database.transaction(LIFE_OS_SYNC_STORE.settings, 'readwrite');
    seed.objectStore(LIFE_OS_SYNC_STORE.settings).put(settings());
    await done(seed);
    const store = new IndexedDbPilotSyncStore(indexedDb);

    await expect(
      store.applyPulled('space', 7, goalPayload(), 'transport-goal-1', {
        kind: 'fast_forward',
        winner: 'incoming',
      }),
    ).rejects.toThrow('parent has not arrived');
    expect(await store.cursor('space')).toBe(0);
    expect(await store.hasApplied('remote-event-1')).toBe(false);
  });

  it('preserves a work session arriving before its missing action', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();
    const seed = database.transaction(LIFE_OS_SYNC_STORE.settings, 'readwrite');
    seed.objectStore(LIFE_OS_SYNC_STORE.settings).put(settings());
    await done(seed);
    const store = new IndexedDbPilotSyncStore(indexedDb);

    await expect(
      store.applyPulled('space', 8, actionSessionPayload(), 'transport-session-1', {
        kind: 'fast_forward',
        winner: 'incoming',
      }),
    ).resolves.toBeUndefined();
    expect(await store.cursor('space')).toBe(8);
    expect(await read(database, LIFE_OS_STORE.actionSessions, 'session-1')).toMatchObject({
      lifeActionId: 'missing-action',
      status: 'running',
    });
    indexedDb.close();
  });

  it('persists a complete deferred child across restart and keeps cursor monotonic during replay', async () => {
    const factory = new IDBFactory();
    const firstIndexedDb = new LifeOsIndexedDb(factory);
    const firstDatabase = await firstIndexedDb.open();
    const seed = firstDatabase.transaction(LIFE_OS_SYNC_STORE.settings, 'readwrite');
    seed.objectStore(LIFE_OS_SYNC_STORE.settings).put(settings());
    await done(seed);
    const childEvent = {
      sequence: 10,
      metadata: {
        ...metadata(),
        eventId: 'remote-event-1',
        objectId: 'transport-goal-1',
        originDeviceId: 'remote-device',
        hlcWallTime: 500,
      },
      ciphertext: 'child-cipher',
      nonce: 'child-nonce',
    };
    const firstStore = new IndexedDbPilotSyncStore(firstIndexedDb);
    await firstStore.deferRemoteEvent('space', childEvent);
    expect(await firstStore.cursor('space')).toBe(10);
    firstIndexedDb.close();

    const restartedIndexedDb = new LifeOsIndexedDb(factory);
    const restartedStore = new IndexedDbPilotSyncStore(restartedIndexedDb);
    await expect(restartedStore.deferredRemoteEvents('space')).resolves.toEqual([childEvent]);
    const parentPayload = directionPayload();
    await restartedStore.applyPulled('space', 11, parentPayload, 'transport-direction-1', {
      kind: 'fast_forward',
      winner: 'incoming',
    });
    await restartedStore.applyPulled('space', 10, goalPayload(), 'transport-goal-1', {
      kind: 'fast_forward',
      winner: 'incoming',
    });
    await restartedStore.removeDeferredRemoteEvent('space', 10);

    const restartedDatabase = await restartedIndexedDb.open();
    expect(await read(restartedDatabase, LIFE_OS_STORE.goals, 'goal-1')).toMatchObject({
      directionId: 'direction-1',
    });
    expect(await restartedStore.hasApplied('parent-event')).toBe(true);
    expect(await restartedStore.hasApplied('remote-event-1')).toBe(true);
    expect(await restartedStore.cursor('space')).toBe(11);
    await expect(restartedStore.deferredRemoteEvents('space')).resolves.toEqual([]);
  });

  it('merges equivalent bootstrap content into one object with no conflict record', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();
    const incoming = directionPayload();
    const localRecord = {
      ...incoming.record,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      version: 7,
    };
    const seed = database.transaction(
      [LIFE_OS_STORE.directions, LIFE_OS_SYNC_STORE.objectMeta, LIFE_OS_SYNC_STORE.settings],
      'readwrite',
    );
    seed.objectStore(LIFE_OS_STORE.directions).put(localRecord);
    seed.objectStore(LIFE_OS_SYNC_STORE.objectMeta).put({
      objectId: 'direction-1',
      transportObjectId: 'bbbbbbbb-0000-4000-8000-000000000001',
      eventId: 'local-bootstrap',
      entityType: 'direction',
      schemaVersion: 1,
      revision: 7,
      baseRevision: 6,
      lastSyncedRevision: 0,
      modifiedAt: '2026-09-01T00:00:00.000Z',
      modifiedByDevice: 'windows',
      keyEpoch: 3,
      deleted: false,
      hlcWallTime: 400,
      hlcLogical: 0,
      syncStatus: 'pending',
    });
    seed.objectStore(LIFE_OS_SYNC_STORE.settings).put(settings());
    await done(seed);
    const store = new IndexedDbPilotSyncStore(indexedDb);

    await store.applyPulled('space', 12, incoming, 'aaaaaaaa-0000-4000-8000-000000000001', {
      kind: 'equivalent',
    });

    const readAll = database.transaction(
      [LIFE_OS_STORE.directions, LIFE_OS_SYNC_STORE.conflicts, LIFE_OS_SYNC_STORE.objectMeta],
      'readonly',
    );
    expect(await request(readAll.objectStore(LIFE_OS_STORE.directions).getAll())).toHaveLength(1);
    expect(await request(readAll.objectStore(LIFE_OS_SYNC_STORE.conflicts).getAll())).toEqual([]);
    expect(
      await request<Record<string, unknown>>(
        readAll.objectStore(LIFE_OS_SYNC_STORE.objectMeta).get('direction-1'),
      ),
    ).toMatchObject({
      transportObjectId: 'aaaaaaaa-0000-4000-8000-000000000001',
      eventId: 'local-bootstrap',
      revision: 7,
    });
    expect(
      await request<Record<string, unknown>>(
        readAll.objectStore(LIFE_OS_STORE.directions).get('direction-1'),
      ),
    ).toMatchObject({ name: 'Remote direction', version: 7 });
  });
});

function metadata() {
  return {
    protocolVersion: 1 as const,
    purpose: 'pilot_event' as const,
    spaceId: 'space',
    eventId: 'event-1',
    objectId: 'transport-1',
    originDeviceId: 'device',
    keyEpoch: 3,
    operation: 'upsert' as const,
    baseRevision: 0,
    revision: 1,
    hlcWallTime: 1,
    hlcLogical: 0,
  };
}
function outbox(): SyncOutboxRecord {
  return {
    eventId: 'event-1',
    entityType: 'goal',
    objectId: 'goal-1',
    transportObjectId: 'transport-1',
    baseRevision: 0,
    proposedRevision: 1,
    operation: 'upsert',
    keyEpoch: 3,
    hlcWallTime: 1,
    hlcLogical: 0,
    serializedPayload: '{}',
    encryptedPayload: null,
    encryptedNonce: null,
    state: 'sending',
    retryCount: 0,
    nextAttemptAt: '2026-09-04T00:00:00.000Z',
    leaseUntil: '2026-09-04T01:00:00.000Z',
    lastErrorCode: null,
    createdAt: '2026-09-04T00:00:00.000Z',
    updatedAt: '2026-09-04T00:00:00.000Z',
  };
}
function settings() {
  return {
    id: 'sync' as const,
    enabled: false as const,
    deviceId: 'device',
    deviceName: 'Device',
    platform: 'windows' as const,
    publicKey: 'public',
    createdAt: '',
    spaceId: 'space',
    membershipStatus: 'active' as const,
    currentKeyEpoch: 3,
    recoveryConfirmedAt: '',
    snapshotId: null,
    setupState: 'configured' as const,
    pendingRevokedDeviceId: null,
    updatedAt: '',
  };
}
function goalPayload() {
  return {
    protocolVersion: 1 as const,
    schemaVersion: 1 as const,
    entityType: 'goal' as const,
    operation: 'upsert' as const,
    objectId: 'goal-1',
    eventId: 'remote-event-1',
    originDeviceId: 'remote-device',
    keyEpoch: 3,
    baseRevision: 0,
    revision: 1,
    hlc: { wallTime: 500, logical: 0 },
    record: {
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
      createdAt: '2026-09-04T00:00:00.000Z',
      updatedAt: '2026-09-04T00:00:00.000Z',
      archivedAt: null,
      version: 1,
    },
  };
}
function directionPayload() {
  return {
    protocolVersion: 1 as const,
    schemaVersion: 1 as const,
    entityType: 'direction' as const,
    operation: 'upsert' as const,
    objectId: 'direction-1',
    eventId: 'parent-event',
    originDeviceId: 'remote-device',
    keyEpoch: 3,
    baseRevision: 0,
    revision: 1,
    hlc: { wallTime: 501, logical: 0 },
    record: {
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
      createdAt: '2026-09-04T00:00:00.000Z',
      updatedAt: '2026-09-04T00:00:00.000Z',
      version: 1,
    },
  };
}
function actionSessionPayload() {
  return {
    protocolVersion: 1 as const,
    schemaVersion: 1 as const,
    entityType: 'action_session' as const,
    operation: 'upsert' as const,
    objectId: 'session-1',
    eventId: 'session-event',
    originDeviceId: 'remote-device',
    keyEpoch: 3,
    baseRevision: 0,
    revision: 1,
    hlc: { wallTime: 502, logical: 0 },
    record: {
      schemaVersion: 1,
      id: 'session-1',
      lifeActionId: 'missing-action',
      status: 'running',
      startedAt: '2026-09-07T00:00:00.000Z',
      pausedAt: null,
      completedAt: null,
      completionKind: null,
      resultNote: null,
      pauseIntervals: [],
    },
  };
}
function userSettingsPayload() {
  return {
    protocolVersion: 1 as const,
    schemaVersion: 1 as const,
    entityType: 'user_settings' as const,
    operation: 'upsert' as const,
    objectId: 'lifeos-user-settings',
    eventId: 'settings-event',
    originDeviceId: 'remote-device',
    keyEpoch: 3,
    baseRevision: 0,
    revision: 1,
    hlc: { wallTime: 503, logical: 0 },
    record: {
      id: 'lifeos-user-settings',
      schemaVersion: 1 as const,
      eveningRitual: {
        ...DEFAULT_EVENING_RITUAL_SETTINGS,
        notificationEnabled: true,
      },
    },
  };
}
function decisionPayload(title: string) {
  return {
    protocolVersion: 1 as const,
    schemaVersion: 1 as const,
    entityType: 'decision' as const,
    operation: 'upsert' as const,
    objectId: 'decision-1',
    eventId: 'remote-decision-event',
    originDeviceId: 'android',
    keyEpoch: 3,
    baseRevision: 0,
    revision: 1,
    hlc: { wallTime: 501, logical: 0 },
    record: decisionRecord('decision-1', title),
  };
}
function decisionRecord(id: string, title: string) {
  return {
    schemaVersion: 1 as const,
    id,
    title,
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
async function allOutbox(database: IDBDatabase): Promise<SyncOutboxRecord[]> {
  const tx = database.transaction(LIFE_OS_SYNC_STORE.outbox);
  return request(tx.objectStore(LIFE_OS_SYNC_STORE.outbox).getAll());
}
async function read(
  database: IDBDatabase,
  storeName: string,
  key: IDBValidKey,
): Promise<Record<string, unknown> | undefined> {
  const tx = database.transaction(storeName);
  return request(tx.objectStore(storeName).get(key));
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
