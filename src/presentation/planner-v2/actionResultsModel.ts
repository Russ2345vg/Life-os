import type { LifeAction } from '../../domain';

function resultActions(actions: readonly LifeAction[]): LifeAction[] {
  return actions
    .filter((action) => action.status === 'completed' && !action.isDeleted())
    .sort(
      (left, right) =>
        (right.completedAt?.getTime() ?? 0) - (left.completedAt?.getTime() ?? 0) ||
        left.id.toString().localeCompare(right.id.toString()),
    );
}

export function actionResultsForGoal(actions: readonly LifeAction[], goalId: string): LifeAction[] {
  return resultActions(actions).filter((action) => action.goalId?.toString() === goalId);
}

export function actionResultsForDirection(
  actions: readonly LifeAction[],
  directionId: string,
  goalIds: readonly string[],
): LifeAction[] {
  const goals = new Set(goalIds);
  return resultActions(actions).filter((action) =>
    action.goalId
      ? goals.has(action.goalId.toString())
      : action.directionId?.toString() === directionId,
  );
}
