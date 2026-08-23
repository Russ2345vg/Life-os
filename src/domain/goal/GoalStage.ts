export const GOAL_STAGE = {
  idea: 'idea',
  intention: 'intention',
  activeGoal: 'active_goal',
  achieved: 'achieved',
} as const;

export type GoalStage = (typeof GOAL_STAGE)[keyof typeof GOAL_STAGE];

export function isGoalStage(value: unknown): value is GoalStage {
  return Object.values(GOAL_STAGE).includes(value as GoalStage);
}
