import type { Direction, Goal, LifeAction } from '../../domain';
import type { ProgressContribution } from '../../domain/planner/ProgressContribution';

export interface ActionRankingRow {
  readonly id: string;
  readonly name: string;
  readonly count: number;
}

export function rankCompletedActions(input: {
  readonly actions: readonly LifeAction[];
  readonly goals: readonly Goal[];
  readonly directions: readonly Direction[];
  readonly contributions: readonly ProgressContribution[];
}): {
  goalActionCounts: readonly ActionRankingRow[];
  directionActionCounts: readonly ActionRankingRow[];
} {
  const goals = new Map(
    input.goals.filter((goal) => !goal.isDeleted()).map((goal) => [goal.id.toString(), goal]),
  );
  const directions = new Map(
    input.directions.map((direction) => [direction.id.toString(), direction]),
  );
  const contributions = new Map<string, Set<string>>();
  for (const fact of input.contributions) {
    if (fact.source !== 'completion' || fact.actionId === null || !goals.has(fact.goalId)) continue;
    const key = `${fact.actionId}:${fact.completionKey ?? ''}`;
    const goalIds = contributions.get(key) ?? new Set<string>();
    goalIds.add(fact.goalId);
    contributions.set(key, goalIds);
  }
  const goalCounts = new Map<string, number>();
  const directionCounts = new Map<string, number>();
  for (const action of input.actions) {
    const goalIds = new Set(
      contributions.get(`${action.id.toString()}:${action.completionKey}`) ?? [],
    );
    if (action.goalId && goals.has(action.goalId.toString())) goalIds.add(action.goalId.toString());
    const directionIds = new Set<string>();
    if (action.directionId && directions.has(action.directionId.toString()))
      directionIds.add(action.directionId.toString());
    for (const goalId of goalIds) {
      goalCounts.set(goalId, (goalCounts.get(goalId) ?? 0) + 1);
      const directionId = goals.get(goalId)?.directionId?.toString();
      if (directionId && directions.has(directionId)) directionIds.add(directionId);
    }
    for (const directionId of directionIds)
      directionCounts.set(directionId, (directionCounts.get(directionId) ?? 0) + 1);
  }
  const sort = (rows: ActionRankingRow[]) =>
    rows.sort(
      (left, right) => right.count - left.count || left.name.localeCompare(right.name, 'ru'),
    );
  return {
    goalActionCounts: sort(
      [...goalCounts].map(([id, count]) => ({ id, count, name: goals.get(id)!.title.toString() })),
    ),
    directionActionCounts: sort(
      [...directionCounts].map(([id, count]) => ({ id, count, name: directions.get(id)!.name })),
    ),
  };
}
