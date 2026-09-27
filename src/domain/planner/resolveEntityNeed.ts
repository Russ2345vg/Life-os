import type { Direction } from '../direction/Direction';
import type { Goal } from '../goal/Goal';
import type { LifeAction } from '../life-action/LifeAction';

export interface ResolvedEntityNeed {
  readonly text: string;
  readonly source: 'own' | 'goal' | 'direction';
}

export function resolveGoalNeed(
  goal: Goal,
  directions: readonly Direction[],
): ResolvedEntityNeed | null {
  if (goal.need) return { text: goal.need, source: 'own' };
  const direction = directions.find((item) => item.id.toString() === goal.directionId?.toString());
  return direction?.need ? { text: direction.need, source: 'direction' } : null;
}

export function resolveActionNeed(
  action: LifeAction,
  goals: readonly Goal[],
  directions: readonly Direction[],
): ResolvedEntityNeed | null {
  if (action.need) return { text: action.need, source: 'own' };
  if (action.goalId) {
    const goal = goals.find((item) => item.id.toString() === action.goalId?.toString());
    if (!goal) return null;
    if (goal.need) return { text: goal.need, source: 'goal' };
    return resolveGoalNeed(goal, directions);
  }
  const direction = directions.find(
    (item) => item.id.toString() === action.directionId?.toString(),
  );
  return direction?.need ? { text: direction.need, source: 'direction' } : null;
}
