import { describe, expect, it } from 'vitest';
import { EntityId, Goal } from '../../domain';
import {
  automaticPeriod,
  thirtyDayPeriod,
  type PeriodMembership,
} from '../../domain/planner/PlanningPeriod';
import { filterGoalsByPeriod } from './plannerPeriodFilter';

const today = '2026-09-14';
const goals = ['a', 'b', 'c'].map((id) =>
  Goal.create({ id: EntityId.create(id), title: id, now: new Date('2026-09-14T10:00:00Z') }),
);
const year = automaticPeriod('year', today);
const quarter = automaticPeriod('quarter', today);
const week = automaticPeriod('week', today);
const cycle = thirtyDayPeriod('2026-09-01');
const member = (periodId: string, entityId: string, removed = false): PeriodMembership => ({
  id: `${periodId}:${entityId}`,
  periodId,
  entityType: 'goal',
  entityId,
  focused: false,
  removed,
  version: 1,
  schemaVersion: 1,
  updatedAt: '2026-09-14T10:00:00Z',
});

describe('Goals period filter', () => {
  it('selects the same Goal in multiple current periods without cloning it', () => {
    const memberships = [
      member(year.id, 'a'),
      member(quarter.id, 'a'),
      member(week.id, 'a'),
      member(cycle.id, 'b'),
    ];
    const periods = [year, quarter, week, cycle];
    expect(filterGoalsByPeriod(goals, 'all', today, periods, memberships)).toEqual(goals);
    for (const kind of ['year', 'quarter', 'week'] as const)
      expect(filterGoalsByPeriod(goals, kind, today, periods, memberships)).toEqual([goals[0]]);
    expect(filterGoalsByPeriod(goals, 'thirty_days', today, periods, memberships)).toEqual([
      goals[1],
    ]);
    expect(filterGoalsByPeriod(goals, 'none', today, periods, memberships)).toEqual([goals[2]]);
    expect(
      filterGoalsByPeriod(goals, 'none', today, periods, [
        ...memberships,
        member(year.id, 'c', true),
      ]),
    ).toEqual([goals[2]]);
  });
});
