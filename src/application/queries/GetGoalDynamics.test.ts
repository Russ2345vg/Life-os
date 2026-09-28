import { describe, expect, it } from 'vitest';
import { DayDate, EntityId, Goal } from '../../domain';
import type { ProgressContribution } from '../../domain/planner/ProgressContribution';
import { createReadyLifeAction } from '../../test/helpers/LifeActionTestFactory';
import { buildGoalDynamics } from './GetGoalDynamics';

const now = new Date('2026-09-27T12:00:00Z');
const goal = Goal.create({
  id: EntityId.create('g'),
  title: 'Вес',
  status: 'active',
  now,
  measurement: {
    mode: 'numeric',
    unit: 'кг',
    start: 80,
    target: 75,
    direction: 'at_most',
    cycle: null,
  },
});
const fact = (id: string, amount: number | null, date = '2026-09-25'): ProgressContribution => ({
  id,
  goalId: 'g',
  actionId: null,
  completionKey: null,
  linkId: null,
  source: 'manual',
  amount,
  effectiveDate: date,
  occurredAt: now.toISOString(),
  updatedAt: now.toISOString(),
  voided: false,
  reason: 'Запись',
  version: 1,
  schemaVersion: 1,
});
const initial = { ...fact('initial:g', 80, '2026-08-01'), source: 'initial' as const };
describe('goal recorded dynamics', () => {
  it('uses exactly 30 inclusive days; excludes initial, future, voided and foreign records without inventing gaps', () => {
    const model = buildGoalDynamics(
      {
        goals: [goal],
        actions: [],
        contributions: [
          initial,
          fact('boundary', -2, '2026-08-29'),
          fact('old', 99, '2026-08-28'),
          fact('zero', 0),
          fact('future', 99, '2026-09-28'),
          { ...fact('void', 99), voided: true },
          { ...fact('foreign', 99), goalId: 'other' },
        ],
      },
      'g',
      '2026-09-27',
    );
    expect(model?.startDate).toBe('2026-08-29');
    expect(model?.days.map((day) => ({ date: day.date, amount: day.amount }))).toEqual([
      { date: '2026-08-29', amount: -2 },
      { date: '2026-09-25', amount: 0 },
    ]);
    expect(model?.knownAmount).toBe(-2);
    expect(model?.incomplete).toBe(false);
  });
  it('keeps pending separate from zero, showing only known changes on a partial day', () => {
    const model = buildGoalDynamics(
      {
        goals: [goal],
        actions: [],
        contributions: [initial, fact('known', 2), fact('pending', null)],
      },
      'g',
      '2026-09-27',
    );
    expect(model?.days[0]).toMatchObject({ knownAmount: 2, amount: null, pending: 1 });
    expect(model?.pending).toBe(1);
    expect(model?.knownAmount).toBe(2);
  });
  it('uses canonical completion identity even when archived, excludes stale/reopened facts and uses completedOn for qualitative steps', () => {
    const action = createReadyLifeAction('a', DayDate.create('2026-09-25'));
    action.setGoal(goal.id);
    action.markInProgress(new Date('2026-09-25T10:00Z'), EntityId.create('start'));
    action.complete(null, new Date('2026-09-25T11:00Z'), EntityId.create('done'));
    action.archive(now, EntityId.create('archive'));
    const completion = {
      ...fact('completion', 3, action.completedOn!),
      source: 'completion' as const,
      actionId: 'a',
      completionKey: action.completionKey,
    };
    const state = {
      goals: [goal],
      actions: [action],
      contributions: [
        initial,
        completion,
        { ...completion, id: 'stale', amount: 99, completionKey: 'old' },
      ],
    };
    expect(buildGoalDynamics(state, 'g', '2026-09-27')?.knownAmount).toBe(3);
    const reopened = createReadyLifeAction('a', DayDate.create('2026-09-25'));
    reopened.setGoal(goal.id);
    reopened.markInProgress(now, EntityId.create('reopened-start'));
    reopened.complete(null, now, EntityId.create('reopened-completion'));
    reopened.reopen(now);
    state.actions = [reopened];
    expect(buildGoalDynamics(state, 'g', '2026-09-27')?.days).toEqual([]);
    const qualitative = Goal.create({ id: goal.id, title: 'Портфолио', status: 'active', now });
    const done = createReadyLifeAction('q', DayDate.create('2026-09-27'));
    done.setGoal(goal.id);
    done.markInProgress(now, EntityId.create('q-start'));
    done.complete(null, now, EntityId.create('q-done'));
    const model = buildGoalDynamics(
      { goals: [qualitative], actions: [done], contributions: [] },
      'g',
      '2026-09-27',
    );
    expect(model?.measured).toBe(false);
    expect(model?.days[0]?.completed).toEqual([done]);
    expect(model?.days[0]?.amount).toBeNull();
  });
  it('does not call missing delivery zero or interpret a recurring cycle reset as a negative result', () => {
    const recurring = goal.update(
      {
        title: goal.title,
        measurement: {
          mode: 'recurring',
          unit: 'раз',
          start: null,
          target: 3,
          direction: 'at_least',
          cycle: 'week',
        },
      },
      now,
    );
    const model = buildGoalDynamics(
      {
        goals: [recurring],
        actions: [],
        contributions: [fact('prior-cycle', 1, '2026-09-20'), fact('this-cycle', 1, '2026-09-25')],
      },
      'g',
      '2026-09-27',
    );
    expect(model?.incomplete).toBe(true);
    expect(model?.days.map((day) => day.amount)).toEqual([1, 1]);
    expect(
      buildGoalDynamics({ goals: [], actions: [], contributions: [] }, 'missing', '2026-09-27'),
    ).toBeNull();
  });
});
