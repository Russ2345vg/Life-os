export const EVENING_CYCLE_MODE = {
  normal: 'NORMAL',
  quick: 'QUICK',
  emergency: 'EMERGENCY',
} as const;

export type EveningCycleMode = (typeof EVENING_CYCLE_MODE)[keyof typeof EVENING_CYCLE_MODE];

export function isEveningCycleMode(value: string): value is EveningCycleMode {
  return (Object.values(EVENING_CYCLE_MODE) as readonly string[]).includes(value);
}

export const EVENING_MODE_REASON = {
  userSelected: 'USER_SELECTED',
  lateNight: 'LATE_NIGHT',
  interrupted: 'INTERRUPTED',
  other: 'OTHER',
} as const;

export type EveningModeReason = (typeof EVENING_MODE_REASON)[keyof typeof EVENING_MODE_REASON];

export function isEveningModeReason(value: string): value is EveningModeReason {
  return (Object.values(EVENING_MODE_REASON) as readonly string[]).includes(value);
}

export const EVENING_CYCLE_COMPLETION = {
  completed: 'COMPLETED',
  skipped: 'SKIPPED',
} as const;

export type EveningCycleCompletion =
  (typeof EVENING_CYCLE_COMPLETION)[keyof typeof EVENING_CYCLE_COMPLETION];

export function isEveningCycleCompletion(value: string): value is EveningCycleCompletion {
  return (Object.values(EVENING_CYCLE_COMPLETION) as readonly string[]).includes(value);
}

export const EVENING_STAGE_SKIP_REASON = {
  quickMode: 'QUICK_MODE',
  emergencyMode: 'EMERGENCY_MODE',
} as const;

export type EveningStageSkipReason =
  (typeof EVENING_STAGE_SKIP_REASON)[keyof typeof EVENING_STAGE_SKIP_REASON];

export function isEveningStageSkipReason(value: string): value is EveningStageSkipReason {
  return (Object.values(EVENING_STAGE_SKIP_REASON) as readonly string[]).includes(value);
}
