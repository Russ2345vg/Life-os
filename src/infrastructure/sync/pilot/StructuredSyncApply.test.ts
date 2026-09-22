import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { parsePilotSyncPayload, type PilotSyncPayload } from '../../../application/sync/pilot';
import type { SyncOutboxRecord, SyncSettingsRecord } from '../../persistence/records';
import { LifeOsIndexedDb, LIFE_OS_SYNC_STORE } from '../../persistence/indexed-db/LifeOsIndexedDb';
import { IndexedDbPilotSyncStore } from './IndexedDbPilotSyncStore';
import { normalizePilotRecord, PILOT_RUNTIME_REGISTRY } from './PilotSyncRegistryAdapters';
import { structuredSyncFixtures } from './StructuredSyncFixtures';
import { IndexedDbPilotMutationRecorder } from './IndexedDbPilotMutationRecorder';
import { LIFE_OS_SYNC_REGISTRY } from '../LifeOsSyncRegistry';
import { canonicalSyncRecord, IDENTITY_READ_STORES } from './StructuredSyncIdentity';

const fixtures = structuredSyncFixtures();
const incoming = (
  type: PilotSyncPayload['entityType'],
  record = fixtures[type],
): PilotSyncPayload => ({
  protocolVersion: 1,
  schemaVersion: 1,
  entityType: type,
  operation: 'upsert',
  objectId: String(record.id),
  eventId: `remote-${type}`,
  originDeviceId: 'android',
  keyEpoch: 1,
  baseRevision: 0,
  revision: 1,
  hlc: { wallTime: 100, logical: 0 },
  record: normalizePilotRecord(type, record),
});

describe('SYNC-04 structured database apply', () => {
  it('rejects a canonical goal tombstone while a decision still references it', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();
    const seed = database.transaction(['goals', 'decisions'], 'readwrite');
    seed.objectStore('goals').put(fixtures.goal);
    seed.objectStore('decisions').put(fixtures.decision);
    await done(seed);
    const store = new IndexedDbPilotSyncStore(indexedDb);
    await expect(
      store.applyPulled(
        'space',
        1,
        { ...incoming('goal'), operation: 'tombstone', record: null },
        'transport',
        { kind: 'fast_forward', winner: 'incoming' },
      ),
    ).rejects.toThrow();
    expect((await store.localState('goal', String(fixtures.goal.id))).record).not.toBeNull();
    indexedDb.close();
  });
  it('captures every sync-ready domain store write into the durable outbox across restart', async () => {
    const factory = new IDBFactory();
    const indexedDb = new LifeOsIndexedDb(factory);
    const database = await indexedDb.open();
    const seedTarget = database.transaction('days', 'readwrite');
    seedTarget
      .objectStore('days')
      .put({ ...fixtures.day, id: 'sync04-target-day', date: '2026-09-08' });
    await done(seedTarget);
    await enableCapture(indexedDb);
    const registrations = PILOT_RUNTIME_REGISTRY.filter(
      ({ registration }) => registration.storageKind === 'indexed_db',
    );
    const tx = database.transaction(
      registrations.map(({ registration }) => registration.storeName),
      'readwrite',
    );
    for (const { registration } of registrations)
      tx.objectStore(registration.storeName).put(fixtures[registration.entityType]);
    await done(tx);
    indexedDb.close();
    const restarted = new LifeOsIndexedDb(factory);
    const connection = await restarted.open();
    const read = connection.transaction(LIFE_OS_SYNC_STORE.outbox);
    const records = await request<SyncOutboxRecord[]>(
      read.objectStore(LIFE_OS_SYNC_STORE.outbox).getAll(),
    );
    expect(records).toHaveLength(32);
    for (const record of records) {
      const payload = parsePilotSyncPayload(record.serializedPayload);
      const identityRead = connection.transaction(IDENTITY_READ_STORES);
      if (record.objectId === 'goal-from-project:sync04-project') {
        expect(payload).toMatchObject({
          entityType: 'goal',
          record: { title: 'Synthetic project', legacyProjectId: 'sync04-project' },
        });
        continue;
      }
      expect(payload.record).toEqual(
        await canonicalSyncRecord(identityRead, payload.entityType, fixtures[payload.entityType]),
      );
    }
    restarted.close();
  });

  it.each([
    ['walk', 'walk_capture', 'walks', 'walkCaptures'],
    [
      'routine_block',
      'routine_occurrence_execution',
      'routineBlocks',
      'routineOccurrenceExecutions',
    ],
    ['routine_block', 'routine_occurrence_override', 'routineBlocks', 'routineOccurrenceOverrides'],
  ] as const)(
    'retains orphan-safe %s history when its parent is deleted',
    async (parent, child, parentStore, childStore) => {
      const indexedDb = new LifeOsIndexedDb(new IDBFactory());
      const database = await indexedDb.open();
      const seed = database.transaction([parentStore, childStore], 'readwrite');
      seed.objectStore(parentStore).put(fixtures[parent]);
      seed.objectStore(childStore).put(fixtures[child]);
      await done(seed);
      const store = new IndexedDbPilotSyncStore(indexedDb);
      const tombstone = { ...incoming(parent), operation: 'tombstone' as const, record: null };
      await store.applyPulled('space', 1, tombstone, 'transport', {
        kind: 'fast_forward',
        winner: 'incoming',
      });
      expect((await store.localState(parent, String(fixtures[parent].id))).record).toBeNull();
      expect((await store.localState(child, String(fixtures[child].id))).record).toEqual(
        fixtures[child],
      );
      await store.applyPulled('space', 2, incoming(child), 'child-transport', {
        kind: 'fast_forward',
        winner: 'incoming',
      });
      expect((await store.localState(child, String(fixtures[child].id))).record).not.toBeNull();
      indexedDb.close();
    },
  );

  it('applies all structured types through one store with stable references and no echo', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();
    const seed = database.transaction('days', 'readwrite');
    seed.objectStore('days').put({ ...fixtures.day, id: 'sync04-target-day', date: '2026-09-08' });
    await done(seed);
    await enableCapture(indexedDb);
    const store = new IndexedDbPilotSyncStore(indexedDb, () => 'conflict', undefined, undefined, {
      stageRemote: () => true,
      materializeRemote: async () => true,
    });
    let sequence = 0;
    for (const { registration } of PILOT_RUNTIME_REGISTRY) {
      const payload = incoming(registration.entityType);
      await store.applyPulled('space', ++sequence, payload, `transport-${payload.objectId}`, {
        kind: 'fast_forward',
        winner: 'incoming',
      });
      const state = await store.localState(payload.entityType, payload.objectId);
      expect(normalizePilotRecord(payload.entityType, state.record)).toEqual(payload.record);
      expect(await store.hasApplied(payload.eventId)).toBe(true);
      expect(
        await store.hasSameSemanticContent(payload.entityType, state.record!, payload.record!),
      ).toBe(true);
    }
    expect(await store.counts()).toEqual({ pending: 1, conflicts: 0, quarantined: 0 });
    expect(await store.cursor('space')).toBe(33);
    indexedDb.close();
  });

  it('aborts a failed conflict application without leaving a losing-version record', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const store = new IndexedDbPilotSyncStore(indexedDb, () => 'must-not-commit');
    await expect(
      store.applyPulled('space', 1, incoming('action_session'), 'transport', {
        kind: 'conflict',
        winner: 'incoming',
      }),
    ).rejects.toThrow('parent has not arrived');
    expect(await store.counts()).toEqual({ pending: 0, conflicts: 0, quarantined: 0 });
    expect(await store.hasApplied('remote-action_session')).toBe(false);
    expect(await store.cursor('space')).toBe(0);
    indexedDb.close();
  });

  it('deduplicates legacy same-date IDs without overwriting the existing physical ID', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();
    const seed = database.transaction('days', 'readwrite');
    seed.objectStore('days').put({ ...fixtures.day, id: 'windows-day' });
    await done(seed);
    const store = new IndexedDbPilotSyncStore(indexedDb);
    await store.applyPulled('space', 1, incoming('day'), 'transport', {
      kind: 'fast_forward',
      winner: 'incoming',
    });
    expect((await store.localState('day', 'windows-day')).record).toMatchObject({
      id: 'windows-day',
    });
    expect((await store.localState('day', 'sync04-day')).record?.id).toBe('windows-day');
    expect(await store.hasApplied('remote-day')).toBe(true);
    expect(await store.cursor('space')).toBe(1);
    expect((await store.counts()).conflicts).toBe(0);
    const tx = database.transaction(LIFE_OS_SYNC_STORE.objectMeta);
    expect(await request(tx.objectStore(LIFE_OS_SYNC_STORE.objectMeta).count())).toBe(1);
    indexedDb.close();
  });
});

async function enableCapture(indexedDb: LifeOsIndexedDb): Promise<void> {
  const database = await indexedDb.open();
  const seed = database.transaction(LIFE_OS_SYNC_STORE.settings, 'readwrite');
  seed.objectStore(LIFE_OS_SYNC_STORE.settings).put({
    id: 'sync',
    enabled: false,
    deviceId: 'windows',
    deviceName: 'Synthetic device',
    platform: 'windows',
    publicKey: 'synthetic',
    createdAt: '2026-09-07T00:00:00.000Z',
    spaceId: 'space',
    membershipStatus: 'active',
    currentKeyEpoch: 1,
    recoveryConfirmedAt: '2026-09-07T00:00:00.000Z',
    snapshotId: 'synthetic-snapshot',
    setupState: 'configured',
    pendingRevokedDeviceId: null,
    updatedAt: '2026-09-07T00:00:00.000Z',
  } satisfies SyncSettingsRecord);
  await done(seed);
  indexedDb.configureSyncMutationCapture(
    new IndexedDbPilotMutationRecorder(),
    LIFE_OS_SYNC_REGISTRY,
  );
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
    transaction.onabort = () => reject(transaction.error);
  });
}
