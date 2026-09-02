export const MORNING_STAGE_STATUS = {
  pending: 'PENDING',
  active: 'ACTIVE',
  completed: 'COMPLETED',
  skipped: 'SKIPPED',
  notApplicable: 'NOT_APPLICABLE',
} as const;

export const MORNING_STAGE_ID = {
  coldShower: 'quick_start.cold_shower',
  mirror: 'mirror.attention',
  mainAction: 'main_action.selection',
} as const;

export type MorningStageStatus = (typeof MORNING_STAGE_STATUS)[keyof typeof MORNING_STAGE_STATUS];

export interface MorningStageState {
  readonly stageId: string;
  readonly status: MorningStageStatus;
  readonly updatedAt: Date | null;
}

const MORNING_STAGE_STATUSES = new Set<MorningStageStatus>(Object.values(MORNING_STAGE_STATUS));

export function isMorningStageStatus(value: unknown): value is MorningStageStatus {
  return typeof value === 'string' && MORNING_STAGE_STATUSES.has(value as MorningStageStatus);
}
