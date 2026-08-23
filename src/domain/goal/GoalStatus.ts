export const GOAL_STATUS = {
  active: 'active',
  future: 'future',
  achieved: 'achieved',
  archived: 'archived',
} as const;

export type GoalStatus = (typeof GOAL_STATUS)[keyof typeof GOAL_STATUS];

export function isGoalStatus(value: unknown): value is GoalStatus {
  return Object.values(GOAL_STATUS).includes(value as GoalStatus);
}
