export const GOAL_HORIZON = {
  now: 'now',
  withinYear: '<1y',
  oneToThreeYears: '1-3y',
  threeToFiveYears: '3-5y',
  someday: 'someday',
} as const;

export type GoalHorizon = (typeof GOAL_HORIZON)[keyof typeof GOAL_HORIZON];

export function isGoalHorizon(value: unknown): value is GoalHorizon {
  return Object.values(GOAL_HORIZON).includes(value as GoalHorizon);
}
