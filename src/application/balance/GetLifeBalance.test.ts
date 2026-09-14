import { describe, it, expect } from 'vitest';
import { Direction, Sphere, Goal, EntityId } from '../../domain';
import { initialGoalContribution } from '../../domain/planner/InitialGoalContribution';
import {
  automaticPeriod,
  type PeriodDecision,
  type PeriodMembership,
} from '../../domain/planner/PlanningPeriod';
import type { BalanceState } from '../ports/BalanceRepository';
import { balancePeriodContext, projectLifeBalance, sphereForGoal } from './GetLifeBalance';
import { validateIndicator } from '../../domain/balance/DirectionIndicator';
const now = new Date('2026-09-14T12:00:00Z');
const id = EntityId.create;
const record = { version: 1, schemaVersion: 1 as const, updatedAt: now.toISOString() };
function fixture(): BalanceState {
  const sphere = Sphere.create({
    id: id('s'),
    name: 'Здоровье',
    now,
    desiredLevel: 8,
    includeInBalanceWheel: true,
  });
  const direction = Direction.create({ id: id('d'), name: 'Сон', sphereId: sphere.id, now });
  const goal = Goal.create({
    id: id('g'),
    title: 'Режим',
    directionId: direction.id,
    now,
    measurement: {
      mode: 'recurring',
      cycle: 'week',
      start: 0,
      target: 4,
      direction: 'at_least',
      unit: 'раз',
    },
  });
  const indicator = validateIndicator({
    ...record,
    id: 'indicator:d:0',
    directionId: 'd',
    name: 'Режим',
    type: 'rating',
    value: null,
    target: null,
    sourceType: 'quantitativeGoal',
    sourceGoalId: 'g',
    importance: 'normal',
    removed: false,
    createdAt: now.toISOString(),
  });
  return {
    spheres: [sphere],
    directions: [direction],
    goals: [goal],
    actions: [],
    indicators: [indicator],
    snapshots: [],
    periods: [],
    memberships: [],
    decisions: [],
    contributions: [initialGoalContribution(goal)!],
  };
}
const membership = (
  periodId: string,
  entityId = 'g',
  extra: Partial<PeriodMembership> = {},
): PeriodMembership => ({
  ...record,
  id: `${periodId}:${entityId}`,
  periodId,
  entityType: 'goal',
  entityId,
  focused: false,
  removed: false,
  ...extra,
});
describe('balance reads existing goal progress and planning contracts', () => {
  it('uses current recurring cycle, missing source and partial sync without inventing zero', () => {
    const state = fixture(),
      initial = state.contributions[0]!;
    state.contributions.push({ ...initial, id: 'fact', source: 'manual', amount: 2 });
    expect(projectLifeBalance(state, '2026-09-14').directions[0]?.effectiveScore).toBe(5);
    expect(projectLifeBalance(state, '2026-09-21').directions[0]?.effectiveScore).toBe(0);
    const partial = {
      ...state,
      contributions: state.contributions.filter((c) => c.source !== 'initial'),
    };
    expect(projectLifeBalance(partial, '2026-09-14').directions[0]?.effectiveScore).toBeNull();
    const missing = projectLifeBalance({ ...state, goals: [] }, '2026-09-14').directions[0];
    expect(missing?.indicators[0]?.sourceUnavailable).toBe(true);
    expect(missing?.indicators).toHaveLength(1);
    expect(missing?.effectiveScore).toBeNull();
  });
  it('only includes real goal memberships and does not mutate planning when recommending focus', () => {
    const state = fixture(),
      quarter = automaticPeriod('quarter', '2026-09-14');
    const g = state.goals[0]!;
    const achieved = Goal.create({ id: id('q'), title: 'Итог', sphereId: id('s'), now }).update(
      { title: 'Итог', status: 'achieved', stage: 'achieved' },
      now,
    );
    const withGoals = { ...state, goals: [g, achieved] };
    const excluded = {
      ...withGoals,
      memberships: [
        membership(quarter.id, 'q', { removed: true }),
        membership(quarter.id, 'g', { entityType: 'action' }),
        membership('another'),
      ],
    };
    expect(balancePeriodContext(excluded, '2026-09-14', quarter).s?.progress).toBeNull();
    const selected = {
      ...withGoals,
      memberships: [membership(quarter.id), membership(quarter.id, 'q')],
    };
    const before = JSON.stringify(selected);
    expect(balancePeriodContext(selected, '2026-09-14', quarter).s).toMatchObject({
      progress: 50,
      goalCount: 2,
      recommended: 4,
    });
    expect(JSON.stringify(selected)).toBe(before);
    expect(sphereForGoal(withGoals, 'q')).toBe('s');
    expect(
      sphereForGoal(
        { ...state, goals: [Goal.create({ id: id('x'), title: 'Без сферы', now })] },
        'x',
      ),
    ).toBeNull();
  });
  it('keeps historical quantitative and qualitative results after measurement changes', () => {
    const state = fixture(),
      period = automaticPeriod('quarter', '2026-09-14');
    const closed: PeriodDecision = {
      ...record,
      id: 'decision',
      periodId: period.id,
      entityType: 'goal',
      entityId: 'g',
      decision: 'continue',
      targetPeriodId: null,
      statusAtDecision: 'active',
      resultAtDecision: {
        title: 'Режим',
        current: 3,
        target: 5,
        unit: 'раз',
        percent: 60,
        pending: 0,
      },
    };
    const unmeasured = state.goals[0]!.update({ title: 'Режим', measurement: null }, now);
    const historical = {
      ...state,
      goals: [unmeasured],
      memberships: [membership(period.id)],
      decisions: [closed],
    };
    expect(balancePeriodContext(historical, '2026-10-14', period).s?.progress).toBe(60);
    const qualitative = {
      ...closed,
      statusAtDecision: 'achieved',
      resultAtDecision: {
        title: 'Режим',
        current: null,
        target: null,
        unit: null,
        percent: null,
        pending: 0,
      },
    };
    expect(
      balancePeriodContext(
        { ...historical, goals: state.goals, decisions: [qualitative] },
        '2026-10-14',
        period,
      ).s?.progress,
    ).toBe(100);
    expect(
      balancePeriodContext(
        {
          ...historical,
          decisions: [
            { ...closed, resultAtDecision: { ...closed.resultAtDecision!, percent: null } },
          ],
        },
        '2026-10-14',
        period,
      ).s?.progress,
    ).toBeNull();
  });
});
