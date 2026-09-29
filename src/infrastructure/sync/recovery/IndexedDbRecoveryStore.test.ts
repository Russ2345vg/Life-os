import { IDBFactory } from 'fake-indexeddb';
import { DayDate } from '../../../domain';
import { IndexedDbBalanceRepository } from '../../persistence/IndexedDbBalanceRepository';
import { describe, expect, it } from 'vitest';
import { LifeOsIndexedDb, LIFE_OS_SYNC_STORE } from '../../persistence/indexed-db/LifeOsIndexedDb';
import {
  IndexedDbPilotMutationRecorder,
  PILOT_MUTATION_STORES,
} from '../pilot/IndexedDbPilotMutationRecorder';
import { IndexedDbPilotDeleteRepository } from '../pilot/IndexedDbPilotDeleteRepository';
import { IndexedDbPilotSyncStore } from '../pilot/IndexedDbPilotSyncStore';
import { structuredSyncFixtures } from '../pilot/StructuredSyncFixtures';
import { IndexedDbRecoveryStore } from './IndexedDbRecoveryStore';
import { done, request } from '../attachments/AttachmentRegistration';
import type {
  SyncObjectMetaRecord,
  SyncConflictRecord,
  SyncOutboxRecord,
} from '../../persistence/records/SyncStoreRecords';
import { parsePilotSyncPayload } from '../../../application/sync/pilot';
import { PILOT_RUNTIME_REGISTRY } from '../pilot/PilotSyncRegistryAdapters';
import { WalkRecordMapper } from '../../persistence/mappers/WalkRecordMapper';
import { LifeActionRecordMapper } from '../../persistence/mappers/LifeActionRecordMapper';
import type { LifeActionRecord } from '../../persistence/records/LifeActionRecord';
import { LIFE_OS_SYNC_REGISTRY } from '../LifeOsSyncRegistry';
import { IndexedDbTimeCapacityRepository } from '../../persistence/IndexedDbTimeCapacityRepository';
import { IndexedDbActionSessionRepository } from '../../persistence/IndexedDbActionSessionRepository';
import { IndexedDbLifeActionRepository } from '../../persistence/IndexedDbLifeActionRepository';
import { IndexedDbJournalUnitOfWork } from '../../persistence/IndexedDbJournalUnitOfWork';
import { WorkSessions } from '../../../application/time/WorkSessions';
import { FakeClock, FakeIdGenerator } from '../../../test/helpers/Fakes';

async function fixture() {
  const factory = new IDBFactory();
  const db = new LifeOsIndexedDb(factory);
  const connection = await db.open();
  const tx = connection.transaction(['goals', ...PILOT_MUTATION_STORES], 'readwrite');
  const completion = done(tx);
  tx.objectStore(LIFE_OS_SYNC_STORE.settings).put({
    id: 'sync',
    setupState: 'configured',
    membershipStatus: 'active',
    spaceId: '11111111-1111-4111-8111-111111111111',
    deviceId: 'device',
    currentKeyEpoch: 1,
  });
  const recorder = new IndexedDbPilotMutationRecorder();
  const goal: Readonly<Record<string, unknown>> = {
    ...structuredSyncFixtures().goal,
    directionId: null,
  };
  tx.objectStore('goals').put(goal);
  await recorder.recordUpsert(tx, 'goal', goal);
  await completion;
  return { db, connection, recorder, goal, store: new IndexedDbRecoveryStore(db, recorder) };
}
describe('IndexedDB recovery transactions', () => {
  it('restores work history even when the original action is no longer present', async () => {
    const f = await fixture();
    try {
      const original = await f.store.readState();
      const session: Record<string, unknown> = {
        ...structuredSyncFixtures().action_session,
        goalIdAtStart: null,
      };
      await f.store.apply(
        { schemaVersion: 1, items: [{ entityType: 'action_session', record: session }] },
        JSON.stringify(original),
        true,
      );
      expect(
        (await f.store.readState()).items.find((item) => item.entityType === 'action_session')
          ?.record.lifeActionId,
      ).toBe(session.lifeActionId);
    } finally {
      f.db.close();
    }
  });
  it('captures capacity and work sessions and exactly restores old and modern snapshots', async () => {
    const f = await fixture();
    try {
      f.db.configureSyncMutationCapture(f.recorder, LIFE_OS_SYNC_REGISTRY);
      const action: Record<string, unknown> = {
        ...structuredSyncFixtures().life_action,
        decisionId: null,
        goalId: f.goal.id,
      };
      const seed = (await f.db.open()).transaction('lifeActions', 'readwrite');
      seed.objectStore('lifeActions').put(action);
      await done(seed);
      const work = new WorkSessions(
        new IndexedDbActionSessionRepository(f.db),
        new IndexedDbLifeActionRepository(f.db),
        new IndexedDbJournalUnitOfWork(f.db, f.recorder),
        new FakeClock(new Date('2026-09-28T08:00:00Z')),
        new FakeIdGenerator('snapshot-work'),
      );
      const session = await work.start(String(action.id));
      await new IndexedDbTimeCapacityRepository(f.db).save(
        [360, null, null, null, null, null, null],
        null,
      );
      const modern = await f.store.readState();
      const queued = await request<SyncOutboxRecord[]>(
        f.connection
          .transaction(LIFE_OS_SYNC_STORE.outbox)
          .objectStore(LIFE_OS_SYNC_STORE.outbox)
          .getAll(),
      );
      expect(queued.map((row) => parsePilotSyncPayload(row.serializedPayload).entityType)).toEqual(
        expect.arrayContaining(['action_session', 'time_capacity']),
      );
      const old = {
        schemaVersion: 1 as const,
        items: modern.items
          .filter((item) => item.entityType !== 'time_capacity')
          .map((item) => {
            if (item.entityType !== 'action_session') return item;
            const record = { ...item.record };
            delete record.goalIdAtStart;
            return { ...item, record };
          }),
      };
      await f.store.apply(old, JSON.stringify(modern), true);
      expect(await new IndexedDbTimeCapacityRepository(f.db).get()).toBeNull();
      expect(
        (await new IndexedDbActionSessionRepository(f.db).findById(session.id))?.goalIdAtStart,
      ).toBeNull();
      await f.store.apply(modern, JSON.stringify(await f.store.readState()), true);
      expect((await new IndexedDbTimeCapacityRepository(f.db).get())?.weekdays[0]).toBe(360);
      expect(
        (
          await new IndexedDbActionSessionRepository(f.db).findById(session.id)
        )?.goalIdAtStart?.toString(),
      ).toBe(f.goal.id);
    } finally {
      f.db.close();
    }
  });
  it('exactly restores an old action snapshot without keeping later time fields', async () => {
    const f = await fixture();
    try {
      const timed = {
        ...structuredSyncFixtures().life_action,
        decisionId: null,
        goalId: null,
        directionId: null,
        sphereId: null,
        plannedDate: '2026-09-28',
        estimateMinutes: 90,
        scheduledStartMinute: 600,
        scheduledDurationMinutes: 60,
      };
      const seed = f.connection.transaction('lifeActions', 'readwrite');
      seed.objectStore('lifeActions').put(timed);
      await done(seed);
      const current = await f.store.readState();
      const oldItems = current.items.map((item) => {
        if (item.entityType !== 'life_action') return item;
        const record = { ...item.record } as Record<string, unknown>;
        delete record.estimateMinutes;
        delete record.scheduledStartMinute;
        delete record.scheduledDurationMinutes;
        return { ...item, record };
      });
      await f.store.apply({ schemaVersion: 1, items: oldItems }, JSON.stringify(current), true);
      const stored = await request<LifeActionRecord>(
        f.connection
          .transaction('lifeActions')
          .objectStore('lifeActions')
          .get(String((timed as Record<string, unknown>).id)),
      );
      expect(stored.estimateMinutes).toBeNull();
      expect(stored.scheduledStartMinute).toBeNull();
      expect(stored.scheduledDurationMinutes).toBeNull();
    } finally {
      f.db.close();
    }
  });

  it('restores an indicator together with current snapshots and queues the new history', async () => {
    const f = await fixture(),
      records = structuredSyncFixtures(),
      now = new Date('2026-09-14T12:00:00Z');
    const balance = new IndexedDbBalanceRepository(
      f.db,
      { now: () => now },
      { getCurrentDate: () => DayDate.create('2026-09-14') },
    );
    try {
      const seed = f.connection.transaction(
        ['spheres', 'directions', 'directionIndicators'],
        'readwrite',
      );
      seed.objectStore('spheres').put(records.sphere);
      seed.objectStore('directions').put(records.direction);
      seed.objectStore('directionIndicators').put(records.direction_indicator);
      await done(seed);
      await balance.refreshSnapshots();
      const current = await f.store.readState();
      await f.store.apply(
        {
          schemaVersion: 1,
          items: [
            {
              entityType: 'direction_indicator',
              record: { ...records.direction_indicator, value: 9 },
            },
          ],
        },
        JSON.stringify(current),
        false,
      );
      expect((await balance.read()).snapshots.filter((s) => s.effectiveScore === 9)).toHaveLength(
        2,
      );
      const queued = await request<SyncOutboxRecord[]>(
        f.connection
          .transaction(LIFE_OS_SYNC_STORE.outbox)
          .objectStore(LIFE_OS_SYNC_STORE.outbox)
          .getAll(),
      );
      expect(
        queued
          .map((r) => parsePilotSyncPayload(r.serializedPayload))
          .filter(
            (p) => p.entityType === 'balance_monthly_snapshot' && p.record?.effectiveScore === 9,
          ),
      ).toHaveLength(2);
    } finally {
      f.db.close();
    }
  });
  it('rejects restoring a second active walk without changing state', async () => {
    const f = await fixture();
    const walk = {
      ...WalkRecordMapper.toRecord(
        WalkRecordMapper.fromRecord(structuredSyncFixtures().walk).start({
          mode: 'stopwatch',
          startedAt: new Date('2026-09-07T00:00:00.000Z'),
          reflectionQuestion: 'Synthetic question',
        }),
      ),
    };
    const tx = f.connection.transaction('walks', 'readwrite');
    tx.objectStore('walks').put(walk);
    await done(tx);
    const current = await f.store.readState();
    await expect(
      f.store.apply(
        {
          schemaVersion: 1,
          items: [{ entityType: 'walk', record: { ...walk, id: 'other-walk' } }],
        },
        JSON.stringify(current),
        false,
      ),
    ).rejects.toThrow('активной прогулки');
    expect(await f.store.readState()).toEqual(current);
  });
  it('restores retained deletion through a new HLC revision and rejects a stale event', async () => {
    const f = await fixture();
    const original = await request<SyncOutboxRecord[]>(
      f.connection
        .transaction(LIFE_OS_SYNC_STORE.outbox)
        .objectStore(LIFE_OS_SYNC_STORE.outbox)
        .getAll(),
    );
    await new IndexedDbPilotDeleteRepository(f.db, f.recorder).delete('goal', String(f.goal.id));
    expect(await f.store.history('deleted')).toMatchObject([{ recoverable: true }]);
    const item = await f.store.inspect('deleted', String(f.goal.id));
    const current = await f.store.readState();
    await f.store.apply({ schemaVersion: 1, items: [item] }, JSON.stringify(current), false);
    const meta = await request<SyncObjectMetaRecord>(
      f.connection
        .transaction(LIFE_OS_SYNC_STORE.objectMeta)
        .objectStore(LIFE_OS_SYNC_STORE.objectMeta)
        .get(String(f.goal.id)),
    );
    expect(meta.revision).toBe(3);
    expect(meta.deleted).toBe(false);
    expect(meta.hlcWallTime).toBeGreaterThanOrEqual(original[0]!.hlcWallTime);
    // A decision calculated before restore must be rechecked under the applying transaction.
    await new IndexedDbPilotSyncStore(f.db).applyPulled(
      '11111111-1111-4111-8111-111111111111',
      1,
      {
        ...parsePilotSyncPayload(original[0]!.serializedPayload),
        record: { ...item.record, title: 'STALE' },
      },
      original[0]!.transportObjectId,
      { kind: 'fast_forward', winner: 'incoming' },
    );
    const goal = await request<Record<string, unknown>>(
      f.connection.transaction('goals').objectStore('goals').get(String(f.goal.id)),
    );
    expect(goal.title).toBe(f.goal.title);
    const historyTx = f.connection.transaction(LIFE_OS_SYNC_STORE.conflicts, 'readwrite');
    historyTx.objectStore(LIFE_OS_SYNC_STORE.conflicts).put({
      conflictId: 'controlled-conflict',
      spaceId: '11111111-1111-4111-8111-111111111111',
      entityType: 'goal',
      objectId: String(f.goal.id),
      winningRevision: meta.revision,
      losingRevision: 1,
      winningEventId: meta.eventId,
      winningDeviceId: 'device',
      losingDeviceId: 'other',
      losingPayload: { ...item.record, title: 'STALE' },
      payloadIdentity: 'logical',
      resolutionStatus: 'unresolved',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    } satisfies SyncConflictRecord);
    await done(historyTx);
    const conflicts = await f.store.history('conflicts');
    expect(conflicts).toHaveLength(1);
    const losing = await f.store.inspect('conflicts', conflicts[0]!.id);
    expect(losing.record.title).toBe('STALE');
    await f.store.apply(
      { schemaVersion: 1, items: [losing] },
      JSON.stringify(await f.store.readState()),
      false,
      { kind: 'conflicts', id: conflicts[0]!.id },
    );
    expect(await f.store.history('conflicts')).toHaveLength(1);
    const restoredEvents = await request<SyncOutboxRecord[]>(
      f.connection
        .transaction(LIFE_OS_SYNC_STORE.outbox)
        .objectStore(LIFE_OS_SYNC_STORE.outbox)
        .getAll(),
    );
    const latest = restoredEvents.sort(
      (a, b) =>
        parsePilotSyncPayload(b.serializedPayload).revision -
        parsePilotSyncPayload(a.serializedPayload).revision,
    )[0]!;
    expect(parsePilotSyncPayload(latest.serializedPayload).revision).toBeGreaterThan(meta.revision);
    const secondDb = new LifeOsIndexedDb(new IDBFactory());
    await new IndexedDbPilotSyncStore(secondDb).applyPulled(
      '11111111-1111-4111-8111-111111111111',
      2,
      parsePilotSyncPayload(latest.serializedPayload),
      latest.transportObjectId,
      { kind: 'fast_forward', winner: 'incoming' },
    );
    const second = await secondDb.open();
    expect(
      (
        await request<Record<string, unknown>>(
          second.transaction('goals').objectStore('goals').get(String(f.goal.id)),
        )
      ).title,
    ).toBe('STALE');
  });
  it('rejects changed preview atomically and leaves outbox intact', async () => {
    const f = await fixture();
    const current = await f.store.readState();
    await expect(
      f.store.apply({ schemaVersion: 1, items: [] }, 'obsolete', true),
    ).rejects.toThrow();
    expect(await f.store.readState()).toEqual(current);
  });
  it('captures and reapplies the synthetic goal snapshot', async () => {
    const f = await fixture();
    const state = await f.store.readState();
    await f.store.apply(state, JSON.stringify(state), true);
    expect(
      (await f.store.readState()).items.find((i) => i.entityType === 'goal')?.record.title,
    ).toBe(f.goal.title);
  });
  it.each([{ goalId: 'sync04-goal', isNext: true }, { goalId: null, isNext: false }, {}])(
    'roundtrips structured families and bridge action fields through recovery %j',
    async (fields) => {
      const f = await fixture();
      const fixtures = structuredSyncFixtures();
      const action = { ...fixtures.life_action };
      delete action.goalId;
      delete action.isNext;
      const actionRecord: Record<string, unknown> = { ...action, ...fields };
      const expectedFields = { goalId: fields.goalId ?? null, isNext: fields.isNext ?? false };
      const registrations = PILOT_RUNTIME_REGISTRY.filter(
        ({ registration }) => registration.storageKind === 'indexed_db',
      );
      const tx = f.connection.transaction(
        registrations.map(({ registration }) => registration.storeName),
        'readwrite',
      );
      const completion = done(tx);
      tx.objectStore('days').put({ ...fixtures.day, id: 'sync04-target-day', date: '2026-09-08' });
      for (const { registration } of registrations)
        tx.objectStore(registration.storeName).put(
          registration.entityType === 'life_action'
            ? actionRecord
            : fixtures[registration.entityType],
        );
      await completion;
      const state = await f.store.readState();
      expect(new Set(state.items.map((item) => item.entityType)).size).toBe(34);
      expect(state.items.find((item) => item.entityType === 'life_action')?.record).toMatchObject(
        expectedFields,
      );
      const exported: unknown = JSON.parse(JSON.stringify(state));
      const recoveryStore: IndexedDbRecoveryStore = f.store;
      recoveryStore.validate(exported);
      await f.store.apply(exported, JSON.stringify(state), true);
      const restored = await f.store.readState();
      const storedAction = await request<LifeActionRecord>(
        f.connection
          .transaction('lifeActions')
          .objectStore('lifeActions')
          .get(String(actionRecord.id)),
      );
      const restoredAction = LifeActionRecordMapper.fromRecord(storedAction);
      expect(restoredAction.goalId?.toString() ?? null).toBe(expectedFields.goalId);
      expect(restoredAction.isNext).toBe(expectedFields.isNext);
      expect(restored.items.find((item) => item.entityType === 'life_action')?.record).toEqual(
        state.items.find((item) => item.entityType === 'life_action')?.record,
      );
      expect(restored.items.find((item) => item.entityType === 'diary_entry')?.record).toEqual(
        state.items.find((item) => item.entityType === 'diary_entry')?.record,
      );
      expect(restored.items.map((i) => [i.entityType, i.record.id])).toEqual(
        state.items.map((i) => [i.entityType, i.record.id]),
      );
      const plan = await request<Record<string, unknown>>(
        f.connection
          .transaction('tomorrowPlans')
          .objectStore('tomorrowPlans')
          .get('sync04-tomorrow_plan'),
      );
      expect(
        restored.items.find((i) => i.entityType === 'preparation_plan')?.record.sourceVersion,
      ).toBe(plan.version);
    },
  );
  it('restores history with no image and keeps a pending image durable across snapshot restore', async () => {
    const f = await fixture();
    const original = await f.store.readState();
    const image = {
      dataUrl: 'data:image/png;base64,aGVsbG8=',
      mimeType: 'image/png',
      sizeBytes: 5,
    };
    const tx = f.connection.transaction(['goals', ...PILOT_MUTATION_STORES], 'readwrite');
    const completion = done(tx);
    const record = { ...f.goal, coverImage: image };
    tx.objectStore('goals').put(record);
    await f.recorder.recordUpsert(tx, 'goal', record);
    await completion;
    const withImage = await f.store.readState();
    await f.store.apply(withImage, JSON.stringify(withImage), true);
    expect((await f.store.attachments())[0]?.state).toBe('pending-upload');
    expect(
      (await f.store.readState()).items.find((i) => i.entityType === 'goal')?.record
        .syncSnapshotImage,
    ).toEqual(image);
    await f.store.apply(original, JSON.stringify(await f.store.readState()), true);
    expect(
      (
        await request<Record<string, unknown>>(
          f.connection.transaction('goals').objectStore('goals').get(String(f.goal.id)),
        )
      ).coverImage,
    ).toBeNull();
  });
});
