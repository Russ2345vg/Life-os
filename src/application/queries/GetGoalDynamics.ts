import { DayDate, type Goal, type LifeAction } from '../../domain';
import { addDays } from '../../domain/planner/PlanningPeriod';
import { contributionIsEffective } from '../../domain/planner/CompletionContributions';
import type { ProgressContribution } from '../../domain/planner/ProgressContribution';
import { createGoalProgressReader } from '../planner/GoalContributions';
import { localDate } from '../planner/planningSupport';

export interface GoalDynamicsDay {
  readonly date: string;
  readonly records: readonly {
    readonly fact: ProgressContribution;
    readonly action: LifeAction | null;
  }[];
  readonly completed: readonly LifeAction[];
  readonly knownAmount: number;
  /** A partial or absent result is unknown, never an invented zero. */
  readonly amount: number | null;
  readonly pending: number;
}

/** Recorded deltas under current configuration, not historical snapshots of Goal progress. */
export function buildGoalDynamics(
  state: {
    readonly goals: readonly Goal[];
    readonly actions: readonly LifeAction[];
    readonly contributions: readonly ProgressContribution[];
  },
  goalId: string,
  today: string,
) {
  const endDate = DayDate.create(today).toString();
  const startDate = addDays(endDate, -29);
  const goal = state.goals.find((item) => item.id.toString() === goalId && !item.isDeleted());
  if (!goal) return null;
  const within = (date: string) => date >= startDate && date <= endDate;
  const actionMap = new Map(state.actions.map((action) => [action.id.toString(), action]));
  const records = state.contributions.filter(
    (fact) =>
      fact.goalId === goalId &&
      fact.source !== 'initial' &&
      within(fact.effectiveDate) &&
      contributionIsEffective(fact, actionMap),
  );
  const dates = new Set(records.map((fact) => fact.effectiveDate));
  const completed = state.actions.filter(
    (action) =>
      action.goalId?.toString() === goalId &&
      action.status === 'completed' &&
      !action.isArchived() &&
      !action.isDeleted(),
  );
  const completionDate = (action: LifeAction) =>
    action.completedOn ?? (action.completedAt ? localDate(action.completedAt) : null);
  for (const action of completed) {
    const date = completionDate(action);
    if (date && within(date)) dates.add(date);
  }
  const days: GoalDynamicsDay[] = [...dates].sort().map((date) => {
    const facts = records.filter((fact) => fact.effectiveDate === date);
    const known = facts.filter((fact) => fact.amount !== null);
    const knownAmount = known.reduce((sum, fact) => sum + (fact.amount ?? 0), 0);
    const pending = facts.length - known.length;
    return {
      date,
      records: facts.map((fact) => ({
        fact,
        action: fact.actionId ? (actionMap.get(fact.actionId) ?? null) : null,
      })),
      completed: completed.filter((action) => completionDate(action) === date),
      knownAmount,
      amount: goal.measurement && known.length && !pending ? knownAmount : null,
      pending,
    };
  });
  const progress = createGoalProgressReader({
    goals: [...state.goals],
    actions: [...state.actions],
    contributions: [...state.contributions],
  })(goalId, today);
  return {
    startDate,
    endDate,
    measured: goal.measurement !== null,
    unit: goal.measurement?.unit ?? null,
    incomplete: progress?.complete === false,
    pending: records.filter((fact) => fact.amount === null).length,
    knownAmount: records.reduce((sum, fact) => sum + (fact.amount ?? 0), 0),
    recordCount: records.length,
    completionCount: days.reduce((sum, day) => sum + day.completed.length, 0),
    days,
  };
}
export type GoalDynamicsModel = NonNullable<ReturnType<typeof buildGoalDynamics>>;
