export const GOAL_PROGRESS_TYPE = {
  metric: 'metric',
  milestones: 'milestones',
  qualitative: 'qualitative',
} as const;

export type GoalProgressType = (typeof GOAL_PROGRESS_TYPE)[keyof typeof GOAL_PROGRESS_TYPE];

export const GOAL_QUALITATIVE_STAGE = {
  start: 'start',
  moving: 'moving',
  close: 'close',
  done: 'done',
} as const;

export type GoalQualitativeStage =
  (typeof GOAL_QUALITATIVE_STAGE)[keyof typeof GOAL_QUALITATIVE_STAGE];

export interface GoalMetricProgress {
  readonly type: typeof GOAL_PROGRESS_TYPE.metric;
  readonly current: number;
  readonly target: number;
  readonly unit: string;
}

export interface GoalMilestonesProgress {
  readonly type: typeof GOAL_PROGRESS_TYPE.milestones;
  readonly completed: number;
  readonly total: number;
}

export interface GoalQualitativeProgress {
  readonly type: typeof GOAL_PROGRESS_TYPE.qualitative;
  readonly stage: GoalQualitativeStage;
}

export type GoalProgress = GoalMetricProgress | GoalMilestonesProgress | GoalQualitativeProgress;

export function isGoalProgressType(value: unknown): value is GoalProgressType {
  return Object.values(GOAL_PROGRESS_TYPE).includes(value as GoalProgressType);
}

export function isGoalQualitativeStage(value: unknown): value is GoalQualitativeStage {
  return Object.values(GOAL_QUALITATIVE_STAGE).includes(value as GoalQualitativeStage);
}
