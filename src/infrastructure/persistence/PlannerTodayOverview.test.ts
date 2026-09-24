import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DayDate } from '../../domain';
import { IndexedDbLifeActionRepository } from './IndexedDbLifeActionRepository';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import {
  archiveLifeAction,
  cancelLifeAction,
  completeLifeAction,
  createLifeActionDraft,
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import { GetPlannerToday } from '../../application/queries/GetPlannerToday';
import { SetLifeActionPlan } from '../../application/commands/SetLifeActionPlan';
import { RecurringActions } from '../../application/planner/RecurringActions';
import { IndexedDbPlanningRepository } from './IndexedDbPlanningRepository';
import { IndexedDbJournalUnitOfWork } from './IndexedDbJournalUnitOfWork';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';

describe('GetPlannerToday unfinished previous days', () => {
  let database: LifeOsIndexedDb;
  let repository: IndexedDbLifeActionRepository;
  beforeEach(() => {
    database = new LifeOsIndexedDb(new IDBFactory());
    repository = new IndexedDbLifeActionRepository(database);
  });
  afterEach(() => database.close());

  it('separates past open actions from today, future, undated and closed actions', async () => {
    const past = DayDate.create('2026-09-23');
    const today = DayDate.create('2026-09-24');
    const draft = createLifeActionDraft('past-draft');
    draft.setPlan(past, true);
    const main = createLifeActionDraft('today-main');
    main.setPlan(today, true);
    const ordinary = createLifeActionDraft('today-ordinary');
    ordinary.setPlan(today, false);
    const older = createLifeActionDraft('older');
    older.setPlan(DayDate.create('2026-09-20'), false);
    const values = [
      draft,
      main,
      ordinary,
      older,
      createReadyLifeAction('past-ready', past),
      markLifeActionInProgress(createReadyLifeAction('past-running', past)),
      createReadyLifeAction('future', DayDate.create('2026-09-25')),
      createLifeActionDraft('undated'),
      archiveLifeAction(completeLifeAction(createReadyLifeAction('archived', past))),
      cancelLifeAction(createReadyLifeAction('cancelled', past)),
      completeLifeAction(createReadyLifeAction('completed', past)),
    ];
    for (const action of values) await repository.save(action);

    const overview = await new GetPlannerToday(repository).execute(today);
    expect(overview.overdue?.map((a) => a.id.toString())).toEqual([
      'older',
      'past-draft',
      'past-ready',
      'past-running',
    ]);
    expect(overview.main?.id.toString()).toBe('today-main');
    expect(overview.actions.map((a) => a.id.toString())).toEqual(['today-ordinary']);
    expect(overview.unscheduled.map((a) => a.id.toString())).toEqual(['undated']);
    expect(overview.completed).toEqual([]);
    expect((await repository.findById(draft.id))?.plannedDate?.toString()).toBe('2026-09-23');
  });

  it('uses the requested local calendar day across month boundaries', async () => {
    const action = createLifeActionDraft('last-day');
    action.setPlan(DayDate.create('2026-09-30'), false);
    await repository.save(action);
    const query = new GetPlannerToday(repository);
    expect((await query.execute(DayDate.create('2026-09-30'))).overdue).toEqual([]);
    expect(
      (await query.execute(DayDate.create('2026-10-01'))).overdue?.map((a) => a.id.toString()),
    ).toEqual(['last-day']);
  });

  it('moves only the selected overdue occurrence and retains its manual date on refresh', async () => {
    const clock = new FakeClock(new Date('2026-09-23T12:00:00Z'));
    const ids = new FakeIdGenerator('overdue');
    const planning = new IndexedDbPlanningRepository(database);
    const recurrence = new RecurringActions(planning, clock, ids);
    const rule = await recurrence.save({
      title: 'Повторение',
      goalId: null,
      priority: null,
      startDate: '2026-09-23',
      endDate: null,
      maxCompletions: null,
      paused: false,
      pauseUntil: null,
      schedule: { kind: 'daily' },
    });
    await recurrence.materialize('2026-09-23', '2026-09-25');
    clock.setTime(new Date('2026-09-24T12:00:00Z'));
    const query = new GetPlannerToday(repository);
    const today = DayDate.create('2026-09-24');
    const past = (await query.execute(today)).overdue[0]!;
    const identity = past.occurrence;
    const command = new SetLifeActionPlan(
      repository,
      new IndexedDbJournalUnitOfWork(database),
      clock,
      ids,
    );
    const result = await command.execute({
      lifeActionId: past.id,
      plannedDate: DayDate.create('2026-09-27'),
      isNext: false,
    });
    expect(result.ok).toBe(true);
    await recurrence.materialize('2026-09-24', '2026-09-25');
    expect((await query.execute(today)).overdue).toEqual([]);
    const restored = await repository.findById(past.id);
    expect(restored?.plannedDate?.toString()).toBe('2026-09-27');
    expect(restored?.occurrence).toEqual({ ...identity, manualDate: true });
    expect((await planning.read()).rules.find((r) => r.id === rule.id)?.schedule).toEqual({
      kind: 'daily',
    });
    expect((await query.execute(today)).actions).toHaveLength(1);
  });
});
