import type { Goal } from '../../domain';
import type {
  PlanningPeriod,
  PeriodMembership,
  PeriodKind,
} from '../../domain/planner/PlanningPeriod';
import { automaticPeriod, cycleAt } from '../../domain/planner/PlanningPeriod';

export type GoalPeriodFilter = 'all' | PeriodKind | 'none';

export function currentGoalPeriod(
  filter: GoalPeriodFilter,
  today: string,
  periods: readonly PlanningPeriod[],
): PlanningPeriod | null {
  if (filter === 'all' || filter === 'none') return null;
  return filter === 'thirty_days' ? cycleAt(periods, today) : automaticPeriod(filter, today);
}

export function filterGoalsByPeriod(
  goals: readonly Goal[],
  filter: GoalPeriodFilter,
  today: string,
  periods: readonly PlanningPeriod[],
  memberships: readonly PeriodMembership[],
): Goal[] {
  if (filter === 'all') return [...goals];
  const period = currentGoalPeriod(filter, today, periods);
  const members = new Set(
    memberships
      .filter(
        (item) =>
          item.entityType === 'goal' &&
          !item.removed &&
          (filter === 'none' || item.periodId === period?.id),
      )
      .map((item) => item.entityId),
  );
  return goals.filter((goal) =>
    filter === 'none' ? !members.has(goal.id.toString()) : members.has(goal.id.toString()),
  );
}
