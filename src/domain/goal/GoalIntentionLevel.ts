export const GOAL_INTENTION_LEVEL = {
  want: 'want',
  plan: 'plan',
  commit: 'commit',
} as const;

export type GoalIntentionLevel = (typeof GOAL_INTENTION_LEVEL)[keyof typeof GOAL_INTENTION_LEVEL];

export function isGoalIntentionLevel(value: unknown): value is GoalIntentionLevel {
  return Object.values(GOAL_INTENTION_LEVEL).includes(value as GoalIntentionLevel);
}
