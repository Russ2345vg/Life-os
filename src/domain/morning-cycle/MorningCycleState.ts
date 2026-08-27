export const MORNING_CYCLE_STATE = {
  notStarted: 'NOT_STARTED',
  inProgress: 'IN_PROGRESS',
  readyToWork: 'READY_TO_WORK',
  finished: 'FINISHED',
  abandoned: 'ABANDONED',
} as const;

export type MorningCycleState = (typeof MORNING_CYCLE_STATE)[keyof typeof MORNING_CYCLE_STATE];

const MORNING_CYCLE_STATES = new Set<MorningCycleState>(Object.values(MORNING_CYCLE_STATE));

export function isMorningCycleState(value: unknown): value is MorningCycleState {
  return typeof value === 'string' && MORNING_CYCLE_STATES.has(value as MorningCycleState);
}
