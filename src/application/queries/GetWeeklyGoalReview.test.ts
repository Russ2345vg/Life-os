import { describe, expect, it } from 'vitest';
import { ActionActualResult, DayDate, EntityId, Goal } from '../../domain';
import { createReadyLifeAction } from '../../test/helpers/LifeActionTestFactory';
import type { PlanningState } from '../ports/PlanningRepository';
import type { ProgressContribution } from '../../domain/planner/ProgressContribution';
import { buildWeeklyGoalReview, selectReviewWeek } from './GetWeeklyGoalReview';

const id = EntityId.create;
const goal = Goal.create({
  id: id('g'),
  title: 'Книги',
  status: 'active',
  now: new Date('2026-09-01T12:00Z'),
});
const empty = (): PlanningState => ({
  goals: [goal],
  actions: [],
  periods: [],
  memberships: [],
  decisions: [],
  links: [],
  contributions: [],
  rules: [],
  legacyFocus: [],
  journal: [],
});
const contribution = (
  key: string,
  amount: number | null,
  date = '2026-09-15',
): ProgressContribution => ({
  id: key,
  version: 1,
  schemaVersion: 1,
  updatedAt: '2026-09-27T12:00Z',
  goalId: 'g',
  actionId: null,
  completionKey: null,
  linkId: null,
  source: 'manual',
  amount,
  effectiveDate: date,
  occurredAt: '2026-09-27T12:00Z',
  voided: false,
  reason: 'Запись',
});

describe('weekly goal review', () => {
  it('offers current open steps beyond the reviewed week and respects the explicit goal choice', () => {
    const selected = createReadyLifeAction('selected', DayDate.create('2026-10-01'));
    selected.setGoal(goal.id);
    const other = createReadyLifeAction('other', DayDate.create('2026-09-28'));
    other.setGoal(goal.id);
    const archived = createReadyLifeAction('archived', DayDate.create('2026-09-28'));
    archived.setGoal(goal.id);
    archived.softDelete(new Date());
    const foreign = createReadyLifeAction('foreign', DayDate.create('2026-09-28'));
    const state = empty();
    state.goals = [goal.selectNextAction(selected.id, new Date())];
    state.actions = [other, selected, archived, foreign];
    const row = buildWeeklyGoalReview(state, '2026-09-27').goals[0];
    expect(row?.openActions).toEqual([other, selected]);
    expect(row?.nextAction).toBe(selected);
    selected.softDelete(new Date());
    expect(buildWeeklyGoalReview(state, '2026-09-27').goals[0]?.nextAction).toBeNull();
  });
  it('keeps incomplete or pending goals out of the no-record count and reads current recurring cycle', () => {
    const measured = Goal.create({
      id: id('g'),
      title: 'Тренировки',
      status: 'active',
      now: new Date(),
      measurement: {
        mode: 'recurring',
        target: 3,
        unit: 'раз',
        start: null,
        direction: 'at_least',
        cycle: 'week',
      },
    });
    const state = empty();
    state.goals = [measured];
    expect(buildWeeklyGoalReview(state, '2026-09-27').withoutRecords).toBe(0);
    state.contributions = [
      { ...contribution('initial:g', 0, '2026-09-01'), source: 'initial' },
      contribution('pending', null),
    ];
    const row = buildWeeklyGoalReview(state, '2026-09-27').goals[0];
    expect(row?.progress?.complete).toBe(true);
    expect(row?.pending).toBe(1);
    expect(row?.progress?.cycle?.startDate).toBe('2026-09-21');
    expect(buildWeeklyGoalReview(state, '2026-09-27').withoutRecords).toBe(0);
  });
  it('excludes future/deleted goals and archived/deleted/reopened completions', () => {
    const future = Goal.create({ id: id('future'), title: 'Позже', now: new Date() });
    const deleted = Goal.create({
      id: id('deleted'),
      title: 'Удалена',
      status: 'active',
      now: new Date(),
    });
    const done = (key: string) => {
      const action = createReadyLifeAction(key, DayDate.create('2026-09-14'));
      action.markInProgress(new Date(2026, 8, 14, 9), id(`${key}-start`));
      action.complete(null, new Date(2026, 8, 14, 10), id(`${key}-complete`));
      return action;
    };
    const archived = done('archived');
    archived.archive(new Date(), id('archive'));
    const removed = done('removed');
    removed.softDelete(new Date());
    const reopened = done('reopened');
    reopened.reopen(new Date());
    const state = empty();
    state.goals.push(future, deleted.softDelete(new Date()));
    state.actions = [archived, removed, reopened];
    const review = buildWeeklyGoalReview(state, '2026-09-27');
    expect(review.goals.map((row) => row.goal.id.toString())).toEqual(['g']);
    expect(review.completed).toHaveLength(0);
  });
  it('defaults to last complete Monday–Sunday, normalizes and clamps future/invalid weeks', () => {
    expect(selectReviewWeek('2026-01-01')).toMatchObject({
      startDate: '2025-12-22',
      endDate: '2025-12-28',
    });
    expect(selectReviewWeek('2026-09-27', '2026-09-16').startDate).toBe('2026-09-14');
    expect(selectReviewWeek('2026-09-27', '2026-12-01').startDate).toBe('2026-09-21');
    expect(selectReviewWeek('2026-09-27', 'bad').startDate).toBe('2026-09-14');
  });
  it('separates zero records, pending and voided/initial/out-of-week contributions', () => {
    const state = empty();
    state.contributions = [
      contribution('zero', 0),
      contribution('pending', null),
      { ...contribution('void', 10), voided: true },
      { ...contribution('initial:g', 99), source: 'initial' },
      contribution('outside', 3, '2026-09-21'),
    ];
    const review = buildWeeklyGoalReview(state, '2026-09-27');
    expect(review.goals[0]).toMatchObject({ recordCount: 1, pending: 1, weeklyAmount: 0 });
    expect(review.withRecords).toBe(1);
    expect(review.withoutRecords).toBe(0);
  });
  it('counts actual completions, omits stale completion contributions, and selects only unfinished planned week actions', () => {
    const done = createReadyLifeAction('done', DayDate.create('2026-09-15'));
    done.markInProgress(new Date(2026, 8, 15, 10), id('started'));
    done.complete(ActionActualResult.create('Готово'), new Date(2026, 8, 15, 12), id('finished'));
    const unfinished = createReadyLifeAction('todo', DayDate.create('2026-09-16'));
    const future = createReadyLifeAction('future', DayDate.create('2026-09-28'));
    const state = empty();
    state.actions = [done, unfinished, future];
    state.contributions = [
      { ...contribution('old', 4), actionId: 'todo', completionKey: 'stale', source: 'completion' },
    ];
    const review = buildWeeklyGoalReview(state, '2026-09-27');
    expect(review.completed).toEqual([done]);
    expect(review.unfinished).toEqual([unfinished]);
    expect(review.goals[0]?.recordCount).toBe(0);
  });
  it('does not include future contributions even in the current week', () => {
    const state = empty();
    state.contributions = [
      contribution('today', 2, '2026-09-23'),
      contribution('future', 9, '2026-09-27'),
    ];
    expect(buildWeeklyGoalReview(state, '2026-09-23', '2026-09-21').goals[0]?.weeklyAmount).toBe(2);
  });
});
