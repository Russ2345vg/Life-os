import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ActionActualResult, DayDate, EntityId, Goal } from '../../domain';
import { CompleteLifeAction } from '../../application/commands/CompleteLifeAction';
import { GoalContributions } from '../../application/planner/GoalContributions';
import { RecurringActions } from '../../application/planner/RecurringActions';
import { buildTimeScheduleDay } from '../../application/queries/GetTimeSchedule';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import {
  createLifeActionDraft,
  createReadyLifeAction,
} from '../../test/helpers/LifeActionTestFactory';
import { IndexedDbLifeActionRepository } from './IndexedDbLifeActionRepository';
import { IndexedDbPlanningRepository } from './IndexedDbPlanningRepository';
import { IndexedDbJournalUnitOfWork } from './IndexedDbJournalUnitOfWork';
import { IndexedDbTrashRepository } from './IndexedDbTrashRepository';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';

describe('restoring a reserved time window', () => {
  let db: LifeOsIndexedDb;
  let actions: IndexedDbLifeActionRepository;
  const date = DayDate.create('2026-09-28');
  const now = new Date('2026-09-28T08:00:00Z');
  beforeEach(() => {
    db = new LifeOsIndexedDb(new IDBFactory());
    actions = new IndexedDbLifeActionRepository(db);
  });
  afterEach(() => db.close());

  function timed(id: string) {
    const action = createLifeActionDraft(id);
    action.setPlan(date, false);
    action.setTimePlanning({
      estimateMinutes: 90,
      scheduledStartMinute: 600,
      scheduledDurationMinutes: 60,
    });
    return action;
  }

  function completed(id: string) {
    const action = timed(id);
    action.complete(
      ActionActualResult.create('Действие выполнено'),
      now,
      new FakeIdGenerator(id).generate(),
    );
    return action;
  }

  async function records(storeName: string): Promise<unknown[]> {
    const database = await db.open();
    return new Promise((resolve, reject) => {
      const request = database.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  it('rejects reopening an occupied window without changing completion, contributions or journal', async () => {
    const original = timed('original');
    await actions.save(original);
    const planning = new IndexedDbPlanningRepository(db);
    const clock = new FakeClock(now);
    const ids = new FakeIdGenerator('restoration');
    const service = new GoalContributions(planning, clock, ids);
    await planning.change((state) => {
      state.goals.push(
        Goal.create({ id: EntityId.create('goal'), title: 'Цель', status: 'active', now }),
      );
    });
    await service.configure('goal', {
      mode: 'count',
      target: 10,
      unit: 'раз',
      start: 0,
      direction: 'at_least',
      cycle: null,
    });
    await service.setLink('action', 'original', 'goal', 'fixed', 1);
    const complete = new CompleteLifeAction(
      actions,
      clock,
      ids,
      new IndexedDbJournalUnitOfWork(db),
    );
    expect(
      (
        await complete.execute({
          lifeActionId: original.id,
          actualResult: ActionActualResult.create('Действие выполнено'),
        })
      ).ok,
    ).toBe(true);
    await actions.save(timed('replacement'));
    const before = await records(LIFE_OS_STORE.lifeActions);
    const contributions = await records(LIFE_OS_STORE.progressContributions);
    const journal = await records(LIFE_OS_STORE.journal);
    expect(contributions.length).toBeGreaterThan(1);
    await expect(service.reopen('original')).rejects.toMatchObject({
      code: 'life_action.time_conflict',
    });
    expect(await records(LIFE_OS_STORE.lifeActions)).toEqual(before);
    expect(await records(LIFE_OS_STORE.progressContributions)).toEqual(contributions);
    expect(await records(LIFE_OS_STORE.journal)).toEqual(journal);
    expect((await actions.findById(original.id))?.actualResult?.toString()).toBe(
      'Действие выполнено',
    );
  });

  it('keeps a deleted action in the trash when its time window is now occupied', async () => {
    const original = timed('deleted');
    original.softDelete(now);
    await actions.save(original);
    await actions.save(timed('replacement'));
    const before = await records(LIFE_OS_STORE.lifeActions);
    original.restoreFromTrash(now);
    await expect(actions.save(original)).rejects.toMatchObject({
      code: 'life_action.time_conflict',
    });
    expect(await records(LIFE_OS_STORE.lifeActions)).toEqual(before);
    expect(
      (await new IndexedDbTrashRepository(db).findActionIncludingDeleted(original.id))?.isDeleted(),
    ).toBe(true);
  });

  it('reopens a prepared timed action as readable ready without losing its preparation', async () => {
    const original = createReadyLifeAction('prepared', date);
    original.setTimePlanning({
      estimateMinutes: 90,
      scheduledStartMinute: 600,
      scheduledDurationMinutes: 60,
    });
    const preparation = original.readyAt;
    const expectedResult = original.expectedResult?.toString();
    original.complete(
      ActionActualResult.create('Итог'),
      now,
      new FakeIdGenerator('completed-prepared').generate(),
    );
    await actions.save(original);
    const service = new GoalContributions(
      new IndexedDbPlanningRepository(db),
      new FakeClock(now),
      new FakeIdGenerator('reopen-prepared'),
    );
    await service.reopen(original.id.toString());
    const restored = await actions.findById(original.id);
    expect(restored?.status).toBe('ready');
    expect(restored?.expectedResult?.toString()).toBe(expectedResult);
    expect(restored?.readyAt).toEqual(preparation);
    expect(restored?.plannedDate?.toString()).toBe(date.toString());
    expect(restored?.estimateMinutes).toBe(90);
    expect(restored?.scheduledStartMinute).toBe(600);
    expect(restored?.actualResult).toBeNull();
    expect(restored?.completedAt).toBeNull();
    await expect(new IndexedDbPlanningRepository(db).read()).resolves.toMatchObject({
      actions: [expect.objectContaining({ status: 'ready' })],
    });
  });

  it('permits restoring after the window is freed without losing the estimate or block', async () => {
    const original = completed('original');
    await actions.save(original);
    const replacement = timed('replacement');
    await actions.save(replacement);
    replacement.setTimePlanning({
      estimateMinutes: 30,
      scheduledStartMinute: null,
      scheduledDurationMinutes: null,
    });
    await actions.save(replacement);
    const service = new GoalContributions(
      new IndexedDbPlanningRepository(db),
      new FakeClock(now),
      new FakeIdGenerator(),
    );
    await service.reopen('original');
    const restored = await actions.findById(original.id);
    expect(restored?.status).toBe('draft');
    expect(restored?.estimateMinutes).toBe(90);
    expect(restored?.scheduledStartMinute).toBe(600);
  });

  it.each(['resume', 'expiry'] as const)(
    'keeps the calendar readable after recurring pause %s with an occupied window',
    async (mode) => {
      const planning = new IndexedDbPlanningRepository(db);
      const clock = new FakeClock(now);
      const recurring = new RecurringActions(planning, clock, new FakeIdGenerator('series'));
      const rule = await recurring.save({
        title: 'Повторение',
        goalId: null,
        priority: null,
        startDate: date.toString(),
        endDate: null,
        maxCompletions: null,
        paused: false,
        pauseUntil: null,
        schedule: { kind: 'daily' },
      });
      await recurring.materialize(date.toString(), date.toString());
      const occurrence = (await planning.read()).actions[0]!;
      occurrence.setTimePlanning({
        estimateMinutes: 60,
        scheduledStartMinute: 600,
        scheduledDurationMinutes: 60,
      });
      await actions.save(occurrence);
      await recurring.pause(rule.id, mode === 'expiry' ? '2026-09-29' : null);
      await actions.save(timed('replacement'));
      if (mode === 'resume') await recurring.resume(rule.id);
      else clock.setTime(new Date('2026-09-29T08:00:00Z'));
      const materializeDate = mode === 'expiry' ? '2026-09-29' : date.toString();
      await expect(recurring.materialize(materializeDate, materializeDate)).resolves.toBe(
        mode === 'expiry' ? 1 : 0,
      );
      const state = await planning.read();
      const schedule = buildTimeScheduleDay(date.toString(), state.actions, null);
      expect(schedule.conflictIds).toEqual(new Set([occurrence.id.toString(), 'replacement']));
      expect(
        state.actions.find((action) => action.id.equals(occurrence.id))?.scheduledStartMinute,
      ).toBe(600);
    },
  );
});
