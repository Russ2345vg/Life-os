import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  parsePilotSyncPayload,
  type PilotEntityType,
  type PilotSyncPayload,
} from '../../../application/sync/pilot';
import { LifeOsIndexedDb, LIFE_OS_SYNC_STORE } from '../../persistence/indexed-db/LifeOsIndexedDb';
import type { SyncOutboxRecord } from '../../persistence/records';
import { IndexedDbPilotMutationRecorder } from './IndexedDbPilotMutationRecorder';
import { IndexedDbPilotSyncStore } from './IndexedDbPilotSyncStore';
import { LIFE_OS_SYNC_REGISTRY } from '../LifeOsSyncRegistry';
import { structuredSyncFixtures } from './StructuredSyncFixtures';
import { normalizePilotRecord } from './PilotSyncRegistryAdapters';

const singletonTypes = [
  'day',
  'evening_cycle',
  'morning_cycle',
  'tomorrow_plan',
  'preparation_plan',
] as const;

async function device(prefix: string, summary?: string) {
  const factory = new IDBFactory();
  const db = new LifeOsIndexedDb(factory);
  const connection = await db.open();
  const settings = connection.transaction(LIFE_OS_SYNC_STORE.settings, 'readwrite');
  settings.objectStore(LIFE_OS_SYNC_STORE.settings).put({
    id: 'sync',
    setupState: 'configured',
    membershipStatus: 'active',
    spaceId: 'space',
    currentKeyEpoch: 1,
    deviceId: prefix,
  });
  await done(settings);
  db.configureSyncMutationCapture(
    new IndexedDbPilotMutationRecorder({ now: () => new Date(1000) }),
    LIFE_OS_SYNC_REGISTRY,
  );
  const fixtures = JSON.parse(
    JSON.stringify(structuredSyncFixtures()).replaceAll('sync04-', `${prefix}-`),
  ) as ReturnType<typeof structuredSyncFixtures>;
  const stores = LIFE_OS_SYNC_REGISTRY.filter((r) => r.storageKind === 'indexed_db');
  const tx = connection.transaction(
    stores.map((r) => r.storeName),
    'readwrite',
  );
  tx.objectStore('days').put({ ...fixtures.day, id: `${prefix}-target-day`, date: '2026-09-08' });
  for (const r of stores)
    tx.objectStore(r.storeName).put(
      r.entityType === 'day' && summary !== undefined
        ? {
            ...fixtures.day,
            status: 'completed',
            openedAt: fixtures.day.createdAt,
            completedAt: fixtures.day.createdAt,
            summary,
          }
        : fixtures[r.entityType],
    );
  await done(tx);
  const read = connection.transaction(LIFE_OS_SYNC_STORE.outbox);
  const events = await request<SyncOutboxRecord[]>(
    read.objectStore(LIFE_OS_SYNC_STORE.outbox).getAll(),
  );
  await done(read);
  const store = new IndexedDbPilotSyncStore(db);
  return {
    db,
    factory,
    connection,
    fixtures,
    store,
    payload: (type: PilotEntityType) =>
      parsePilotSyncPayload(
        events.find((e) => e.objectId === fixtures[type].id)!.serializedPayload,
      ),
  };
}

async function apply(store: IndexedDbPilotSyncStore, payload: PilotSyncPayload, sequence = 1) {
  // apply must resolve against current transactional state, including different physical IDs.
  await store.applyPulled('space', sequence, payload, `opaque-${payload.eventId}`, {
    kind: 'fast_forward',
    winner: 'incoming',
  });
}

describe('SYNC-04 singleton logical identity', () => {
  it.each([
    ['preparation_plan', { targetDayId: 'lifeos:singleton:day:2026-09-07' }],
    ['tomorrow_plan', { sourceDayId: 'lifeos:singleton:day:2026-09-08' }],
    ['preparation_plan', { tomorrowPlanId: 42 }],
  ] as const)('rejects inconsistent %s parent identity atomically', async (type, fields) => {
    const a = await device('a');
    const b = await device('b');
    const payload = b.payload(type);
    await expect(
      apply(a.store, { ...payload, record: { ...payload.record, ...fields } }),
    ).rejects.toMatchObject({ code: 'sync.pilot_payload_invalid' });
    expect(await a.store.cursor('space')).toBe(0);
    expect((await a.store.localState(type, payload.objectId)).record?.id).toBe(a.fixtures[type].id);
    a.db.close();
    b.db.close();
  });
  it('retains the local evening ID in nested reflection signals after an incoming winner', async () => {
    const a = await device('a');
    const b = await device('b');
    const payload = b.payload('evening_cycle');
    const record = normalizePilotRecord('evening_cycle', {
      ...payload.record,
      reflectionSignals: [
        {
          type: 'ENERGY_LOW',
          sourceEntityId: 'shared-action',
          cycleId: payload.objectId,
          createdAt: '2026-09-07T00:00:00.000Z',
        },
      ],
    });
    await apply(a.store, { ...payload, record });
    const saved = (await a.store.localState('evening_cycle', payload.objectId)).record!;
    expect(saved.reflectionSignals).toMatchObject([{ cycleId: 'a-evening_cycle' }]);
    expect(() => normalizePilotRecord('evening_cycle', saved)).not.toThrow();
    a.db.close();
    b.db.close();
  });
  it.each(['morning_cycle', 'evening_cycle', 'tomorrow_plan'] as const)(
    'rejects %s when its date and parent singleton date disagree',
    async (type) => {
      const a = await device('a');
      const b = await device('b');
      const payload = b.payload(type);
      const record = {
        ...payload.record,
        [type === 'tomorrow_plan' ? 'targetDayId' : 'dayId']:
          type === 'tomorrow_plan'
            ? 'lifeos:singleton:day:2026-09-07'
            : 'lifeos:singleton:day:2026-09-08',
      };
      await expect(apply(a.store, { ...payload, record })).rejects.toMatchObject({
        code: 'sync.pilot_payload_invalid',
      });
      expect(await a.store.cursor('space')).toBe(0);
      a.db.close();
      b.db.close();
    },
  );

  it('classifies a missing direct date as invalid rather than a missing dependency', async () => {
    const a = await device('a');
    const payload = a.payload('day');
    await expect(
      apply(a.store, { ...payload, record: { ...payload.record, date: undefined } }),
    ).rejects.toMatchObject({ code: 'sync.pilot_payload_invalid' });
    a.db.close();
  });
  it('localizes the planning chain and embedded preparation self references before mapper validation', async () => {
    const a = await device('a');
    const b = await device('b');
    const tomorrow = b.payload('tomorrow_plan');
    await apply(a.store, { ...tomorrow, record: { ...tomorrow.record, vector: 'Remote vector' } });
    expect((await a.store.localState('tomorrow_plan', tomorrow.objectId)).record).toMatchObject({
      id: 'a-tomorrow_plan',
      cycleId: 'a-evening_cycle',
      sourceDayId: 'a-day',
      targetDayId: 'a-target-day',
      vector: 'Remote vector',
    });
    const prep = b.payload('preparation_plan');
    const item = {
      id: 'remote-item',
      planId: prep.objectId,
      key: 'synthetic-key',
      category: 'PHYSICAL',
      title: 'Synthetic preparation',
      sourceType: 'REFLECTION',
      sourceId: null,
      required: false,
      status: 'PENDING',
      active: true,
      completedAt: null,
      skippedAt: null,
      skipReason: null,
    };
    const record = normalizePilotRecord('preparation_plan', {
      ...prep.record,
      items: [item],
      sourceVersion: 99,
      generationSignature: 'environment:r4|tomorrow:99|rules:|corrections:|ritual:legacy',
    });
    await apply(a.store, { ...prep, record }, 2);
    const saved = (await a.store.localState('preparation_plan', prep.objectId)).record!;
    expect(saved).toMatchObject({
      id: 'a-preparation_plan',
      cycleId: 'a-evening_cycle',
      tomorrowPlanId: 'a-tomorrow_plan',
      targetDayId: 'a-target-day',
      sourceVersion: 2,
    });
    expect(saved.items).toMatchObject([{ planId: 'a-preparation_plan', title: item.title }]);
    expect(saved.generationSignature).toContain('|tomorrow:2|');
    expect(() => normalizePilotRecord('preparation_plan', saved)).not.toThrow();
    a.db.close();
    b.db.close();
  });

  it('rejects a physical ID rebound to another date without modifying data or advancing the cursor', async () => {
    const a = await device('a');
    const original = a.payload('day');
    await expect(
      apply(a.store, {
        ...original,
        objectId: 'a-day',
        eventId: 'invalid-date',
        record: { ...original.record, id: 'a-day', date: '2026-09-09' },
      }),
    ).rejects.toMatchObject({ code: 'sync.pilot_payload_invalid' });
    expect((await a.store.localState('day', 'a-day')).record?.date).toBe('2026-09-07');
    expect(await a.store.cursor('space')).toBe(0);
    a.db.close();
  });
  it('resolves divergent same-date records with the existing HLC tie-breaker and retains each losing version', async () => {
    const a = await device('a', 'Windows summary');
    const b = await device('b', 'Android summary');
    const left = a.payload('day');
    const right = b.payload('day');
    await apply(a.store, right);
    await apply(b.store, left);
    for (const d of [a, b]) {
      expect((await d.store.localState('day', left.objectId)).record).toMatchObject({
        id: d.fixtures.day.id,
        summary: 'Android summary',
      });
      const tx = d.connection.transaction(LIFE_OS_SYNC_STORE.conflicts);
      const conflicts = await request<{ losingPayload: { summary: string } }[]>(
        tx.objectStore(LIFE_OS_SYNC_STORE.conflicts).getAll(),
      );
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]?.losingPayload.summary).toBe('Windows summary');
      d.db.close();
    }
  });

  it('accepts legacy physical IDs, persists aliases across restart, and resolves legacy tombstones', async () => {
    const a = await device('a');
    const b = await device('b');
    const original = b.payload('morning_cycle');
    const legacy = {
      ...original,
      objectId: 'legacy-morning',
      record: { ...original.record, id: 'legacy-morning' },
    };
    await apply(a.store, legacy);
    expect((await a.store.localState('morning_cycle', 'legacy-morning')).record?.id).toBe(
      'a-morning_cycle',
    );
    a.db.close();
    const restarted = new LifeOsIndexedDb(a.factory);
    const store = new IndexedDbPilotSyncStore(restarted);
    await apply(
      store,
      {
        ...legacy,
        operation: 'tombstone',
        record: null,
        eventId: 'deleted',
        revision: 2,
        baseRevision: 1,
        hlc: { wallTime: 2000, logical: 0 },
      },
      2,
    );
    expect((await store.localState('morning_cycle', 'a-morning_cycle')).record).toBeNull();
    expect((await store.localState('morning_cycle', original.objectId)).meta?.deleted).toBe(true);
    await expect(
      apply(
        store,
        {
          ...legacy,
          eventId: 'rebound-after-delete',
          record: {
            ...legacy.record,
            dateKey: '2026-09-08',
            dayId: 'lifeos:singleton:day:2026-09-08',
          },
        },
        3,
      ),
    ).rejects.toMatchObject({ code: 'sync.pilot_payload_invalid' });
    expect(await store.cursor('space')).toBe(2);
    restarted.close();
    b.db.close();
  });

  it('ignores receiver-local preparation regeneration metadata during equivalent-content comparison', async () => {
    const a = await device('a');
    const b = await device('b');
    const payload = b.payload('preparation_plan');
    await apply(a.store, {
      ...payload,
      record: {
        ...payload.record,
        sourceVersion: 42,
        generationSignature: 'environment:r4|tomorrow:42|rules:',
      },
    });
    expect((await a.store.counts()).conflicts).toBe(0);
    expect(
      (await a.store.localState('preparation_plan', payload.objectId)).record?.sourceVersion,
    ).toBe(1);
    a.db.close();
    b.db.close();
  });
  it.each(singletonTypes)(
    '%s converges by domain date, retains physical IDs and creates no same-content conflict',
    async (type) => {
      const a = await device('a');
      const b = await device('b');
      // Non-singleton references deliberately remain shared stable IDs in this fixture.
      const left = a.payload(type);
      const right = b.payload(type);
      expect(left.objectId).toBe(right.objectId);
      expect(left.objectId).toContain(type);
      await apply(a.store, right);
      await apply(b.store, left);
      expect((await a.store.localState(type, left.objectId)).record?.id).toBe(a.fixtures[type].id);
      expect((await b.store.localState(type, right.objectId)).record?.id).toBe(b.fixtures[type].id);
      expect((await a.store.counts()).conflicts).toBe(0);
      expect((await b.store.counts()).conflicts).toBe(0);
      a.db.close();
      b.db.close();
    },
  );

  it('keeps different dates distinct and does not merge multiple walks on a date', async () => {
    const a = await device('a');
    const day = a.payload('day');
    const next: PilotSyncPayload = {
      ...day,
      objectId: 'remote-other-date',
      eventId: 'other-date',
      record: { ...day.record, id: 'remote-other-date', date: '2026-09-09' },
    };
    await apply(a.store, next);
    expect((await a.store.localState('day', day.objectId)).record?.id).toBe('a-day');
    expect((await a.store.localState('day', next.objectId)).record?.date).toBe('2026-09-09');
    const walk = a.payload('walk');
    expect(walk.objectId).toBe('a-walk');
    await apply(
      a.store,
      {
        ...walk,
        objectId: 'second-walk',
        eventId: 'second-walk-event',
        record: { ...walk.record, id: 'second-walk' },
      },
      2,
    );
    expect((await a.store.localState('walk', 'a-walk')).record).not.toBeNull();
    expect((await a.store.localState('walk', 'second-walk')).record).not.toBeNull();
    a.db.close();
  });
});

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}
function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
}
