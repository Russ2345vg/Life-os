import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DayDate, EntityId } from '../../domain';
import type { PilotEntityType } from '../../application/sync/pilot';
import { parsePilotSyncPayload } from '../../application/sync/pilot';
import { IndexedDbGoalRepository } from './IndexedDbGoalRepository';
import { IndexedDbLifeActionRepository } from './IndexedDbLifeActionRepository';
import { IndexedDbPlanningRepository } from './IndexedDbPlanningRepository';
import { IndexedDbTrashRepository } from './IndexedDbTrashRepository';
import { GoalRecordMapper } from './mappers/GoalRecordMapper';
import { LifeActionRecordMapper } from './mappers/LifeActionRecordMapper';
import { RecurrenceRuleRecordMapper } from './PlanningRecordMappers';
import { LIFE_OS_STORE, LIFE_OS_SYNC_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import type { LifeActionRecord, SyncOutboxRecord, SyncSettingsRecord } from './records';
import { IndexedDbPilotMutationRecorder } from '../sync/pilot/IndexedDbPilotMutationRecorder';
import { LIFE_OS_SYNC_REGISTRY } from '../sync/LifeOsSyncRegistry';
import { structuredSyncFixtures } from '../sync/pilot/StructuredSyncFixtures';

const fixtures = structuredSyncFixtures();
const deletedAt = '2026-09-25T08:00:00.000Z';
const restoredAt = '2026-09-25T09:00:00.000Z';
const id = EntityId.create;

describe('IndexedDB trash persistence', () => {
  it('reads raw entities by ID and lists only recoverable deleted records from existing stores', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    await seed(indexedDb, LIFE_OS_STORE.goals, [
      { ...fixtures.goal, id: 'active' },
      { ...fixtures.goal, id: 'deleted', deletedAt },
    ]);
    await seed(indexedDb, LIFE_OS_STORE.lifeActions, [
      { ...fixtures.life_action, id: 'active' },
      { ...fixtures.life_action, id: 'deleted', deletedAt },
    ]);
    await seed(indexedDb, LIFE_OS_STORE.recurrenceRules, [
      { ...fixtures.recurrence_rule, id: 'active' },
      { ...fixtures.recurrence_rule, id: 'removed', paused: true, removedAt: deletedAt },
      {
        ...fixtures.recurrence_rule,
        id: 'purged',
        paused: true,
        removedAt: deletedAt,
        purgedAt: restoredAt,
      },
    ]);
    const trash = new IndexedDbTrashRepository(indexedDb);
    expect((await trash.findGoalIncludingDeleted(id('deleted')))?.isDeleted()).toBe(true);
    expect((await trash.findActionIncludingDeleted(id('deleted')))?.isDeleted()).toBe(true);
    expect((await trash.findGoalIncludingDeleted(id('active')))?.isDeleted()).toBe(false);
    expect((await trash.findActionIncludingDeleted(id('active')))?.isDeleted()).toBe(false);
    expect(await trash.findSeriesIncludingRemoved('active')).toMatchObject({ removedAt: null });
    expect(await trash.findSeriesIncludingRemoved('purged')).toMatchObject({
      purgedAt: restoredAt,
    });
    expect(await trash.findGoalIncludingDeleted(id('missing'))).toBeNull();
    expect(await trash.findActionIncludingDeleted(id('missing'))).toBeNull();
    expect(await trash.findSeriesIncludingRemoved('missing')).toBeNull();
    expect((await trash.listDeletedGoals()).map((g) => g.id.toString())).toEqual(['deleted']);
    expect((await trash.listDeletedActions()).map((a) => a.id.toString())).toEqual(['deleted']);
    expect((await trash.listRemovedSeries()).map((r) => r.id)).toEqual(['removed']);
    const rawPlanning = await new IndexedDbPlanningRepository(indexedDb).read();
    expect(rawPlanning.goals).toHaveLength(2);
    expect(rawPlanning.actions).toHaveLength(2);
    expect(rawPlanning.rules).toHaveLength(3);
    indexedDb.close();
  });
  it('excludes deleted goals from every active reader while retaining archived goals', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    await seed(indexedDb, LIFE_OS_STORE.goals, [
      { ...fixtures.goal, id: 'deleted', deletedAt },
      { ...fixtures.goal, id: 'active' },
      { ...fixtures.goal, id: 'archived', status: 'archived', archivedAt: deletedAt },
    ]);
    const goals = new IndexedDbGoalRepository(indexedDb);
    expect(await goals.findById(id('deleted'))).toBeNull();
    expect((await goals.findAll()).map((g) => g.id.toString())).toEqual(['active', 'archived']);
    expect(
      (await goals.findByDirectionId(id(String(fixtures.goal.directionId)))).map((g) =>
        g.id.toString(),
      ),
    ).toEqual(['active', 'archived']);
    indexedDb.close();
  });

  it('excludes deleted actions from ID, all, date and decision readers', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    await seed(
      indexedDb,
      LIFE_OS_STORE.lifeActions,
      ['active', 'deleted'].map((key) => ({
        ...fixtures.life_action,
        id: key,
        plannedDate: '2026-09-25',
        decisionId: 'decision',
        deletedAt: key === 'deleted' ? deletedAt : null,
      })),
    );
    const actions = new IndexedDbLifeActionRepository(indexedDb);
    expect(await actions.findById(id('deleted'))).toBeNull();
    for (const result of await Promise.all([
      actions.findAll(),
      actions.findByDate(DayDate.create('2026-09-25')),
      actions.findByDecisionId(id('decision')),
      actions.findByDecisionIds([id('decision')]),
    ]))
      expect(result.map((a) => a.id.toString())).toEqual(['active']);
    indexedDb.close();
  });

  it.each(['goal', 'life_action', 'recurrence_rule'] as const)(
    'atomically captures %s move and restore across database reopen',
    async (type) => {
      const factory = new IDBFactory();
      const indexedDb = new LifeOsIndexedDb(factory);
      const recorder = new FailingRecorder();
      await seed(indexedDb, storeFor(type), [fixtures[type]]);
      await configure(indexedDb, recorder);
      await mutate(indexedDb, recorder, type, 'move');
      await mutate(indexedDb, recorder, type, 'restore');
      const entries = (await outbox(indexedDb))
        .filter((entry) => entry.entityType === type)
        .sort((a, b) => a.proposedRevision - b.proposedRevision);
      expect(entries).toHaveLength(2);
      const moved = parsePilotSyncPayload(entries[0]!.serializedPayload);
      const restored = parsePilotSyncPayload(entries[1]!.serializedPayload);
      expect(moved.operation).toBe('upsert');
      expect(moved.record).toMatchObject(
        type === 'recurrence_rule' ? { removedAt: deletedAt } : { deletedAt },
      );
      expect(restored.record).toMatchObject(
        type === 'recurrence_rule'
          ? {
              removedAt: null,
              lastRemovedAt: deletedAt,
              restoredFromTrashAt: restoredAt,
              restorationGeneration: 1,
              effectiveFrom: '2026-09-25',
            }
          : { deletedAt: null, lastDeletedAt: deletedAt, restoredFromTrashAt: restoredAt },
      );
      indexedDb.close();
      const reopened = new LifeOsIndexedDb(factory);
      expect(await read(reopened, storeFor(type), String(fixtures[type].id))).toMatchObject(
        restored.record!,
      );
      expect((await outbox(reopened)).filter((entry) => entry.entityType === type)).toHaveLength(2);
      reopened.close();
    },
  );

  it.each(['goal', 'life_action', 'recurrence_rule'] as const)(
    'rolls back %s move and restore when recording fails after the entity put',
    async (type) => {
      const indexedDb = new LifeOsIndexedDb(new IDBFactory());
      const recorder = new FailingRecorder();
      await seed(indexedDb, storeFor(type), [fixtures[type]]);
      await configure(indexedDb, recorder);
      for (const transition of ['move', 'restore'] as const) {
        const before = await read(indexedDb, storeFor(type), String(fixtures[type].id));
        const beforeOutbox = await outbox(indexedDb);
        recorder.failType = type;
        await expect(mutate(indexedDb, recorder, type, transition)).rejects.toBeDefined();
        expect(recorder.observedRecord).toMatchObject(
          type === 'recurrence_rule'
            ? { removedAt: transition === 'move' ? deletedAt : null }
            : { deletedAt: transition === 'move' ? deletedAt : null },
        );
        expect(await read(indexedDb, storeFor(type), String(fixtures[type].id))).toEqual(before);
        expect(await outbox(indexedDb)).toEqual(beforeOutbox);
        recorder.failType = null;
        if (transition === 'move') await mutate(indexedDb, recorder, type, transition);
      }
      indexedDb.close();
    },
  );
});

class FailingRecorder extends IndexedDbPilotMutationRecorder {
  failType: PilotEntityType | null = null;
  observedRecord: unknown;
  override async recordUpsert<TRecord extends object>(
    transaction: IDBTransaction,
    type: PilotEntityType,
    record: Readonly<TRecord>,
  ): Promise<boolean> {
    if (type === this.failType) {
      const key = 'id' in record ? String(record.id) : '';
      this.observedRecord = await request(transaction.objectStore(storeFor(type)).get(key));
      throw new Error('Injected failure before outbox add');
    }
    return super.recordUpsert(transaction, type, record);
  }
}

function storeFor(type: PilotEntityType): string {
  if (type === 'goal') return LIFE_OS_STORE.goals;
  if (type === 'life_action') return LIFE_OS_STORE.lifeActions;
  return LIFE_OS_STORE.recurrenceRules;
}

async function mutate(
  indexedDb: LifeOsIndexedDb,
  recorder: IndexedDbPilotMutationRecorder,
  type: 'goal' | 'life_action' | 'recurrence_rule',
  transition: 'move' | 'restore',
): Promise<void> {
  if (type === 'recurrence_rule') {
    await new IndexedDbPlanningRepository(indexedDb, recorder).change((state) => {
      const rule = state.rules[0]!;
      state.rules[0] = RecurrenceRuleRecordMapper.fromRecord({
        ...rule,
        removedAt: transition === 'move' ? deletedAt : null,
        paused: transition === 'move',
        lastRemovedAt: transition === 'restore' ? deletedAt : null,
        restoredFromTrashAt: transition === 'restore' ? restoredAt : null,
        restorationGeneration: transition === 'restore' ? 1 : 0,
        effectiveFrom: transition === 'restore' ? '2026-09-25' : rule.effectiveFrom,
        version: rule.version + 1,
        revision: rule.revision + 1,
      });
    });
    return;
  }
  const record = await read(indexedDb, storeFor(type), String(fixtures[type].id));
  if (type === 'goal') {
    let goal = GoalRecordMapper.fromRecord(record);
    const version = goal.version;
    if (transition === 'move') goal = goal.softDelete(new Date(deletedAt));
    else goal = goal.restoreFromTrash(new Date(restoredAt));
    expect(
      await new IndexedDbGoalRepository(indexedDb, recorder).updateIfVersionMatches(goal, version),
    ).toBe(true);
  } else {
    const action = LifeActionRecordMapper.fromRecord(record as LifeActionRecord);
    if (transition === 'move') action.softDelete(new Date(deletedAt));
    else action.restoreFromTrash(new Date(restoredAt));
    await new IndexedDbLifeActionRepository(indexedDb).save(action);
  }
}

async function configure(
  indexedDb: LifeOsIndexedDb,
  recorder: IndexedDbPilotMutationRecorder,
): Promise<void> {
  await seed(indexedDb, LIFE_OS_SYNC_STORE.settings, [
    {
      id: 'sync',
      enabled: false,
      deviceId: 'windows',
      deviceName: 'Test',
      platform: 'windows',
      publicKey: 'synthetic',
      createdAt: deletedAt,
      spaceId: 'space',
      membershipStatus: 'active',
      currentKeyEpoch: 1,
      recoveryConfirmedAt: deletedAt,
      snapshotId: 'snapshot',
      setupState: 'configured',
      pendingRevokedDeviceId: null,
      updatedAt: deletedAt,
    } satisfies SyncSettingsRecord,
  ]);
  indexedDb.configureSyncMutationCapture(recorder, LIFE_OS_SYNC_REGISTRY, ['goal']);
}

async function seed(
  indexedDb: LifeOsIndexedDb,
  store: string,
  records: readonly object[],
): Promise<void> {
  const db = await indexedDb.open();
  const tx = db.transaction(store, 'readwrite');
  for (const record of records) tx.objectStore(store).put(record);
  await done(tx);
}
async function read(indexedDb: LifeOsIndexedDb, store: string, key: string): Promise<unknown> {
  const db = await indexedDb.open();
  return request(db.transaction(store).objectStore(store).get(key));
}
async function outbox(indexedDb: LifeOsIndexedDb): Promise<SyncOutboxRecord[]> {
  const db = await indexedDb.open();
  return request(
    db.transaction(LIFE_OS_SYNC_STORE.outbox).objectStore(LIFE_OS_SYNC_STORE.outbox).getAll(),
  );
}
function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.addEventListener('success', () => resolve(value.result));
    value.addEventListener('error', () => reject(value.error));
  });
}
function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.addEventListener('complete', () => resolve());
    tx.addEventListener('abort', () => reject(tx.error ?? new Error('Transaction aborted')));
  });
}
