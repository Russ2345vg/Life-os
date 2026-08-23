export const EVENING_CYCLE_STATE = {
  notStarted: 'NOT_STARTED',
  windingDown: 'WINDING_DOWN',
  resolving: 'RESOLVING',
  reflecting: 'REFLECTING',
  planningTomorrow: 'PLANNING_TOMORROW',
  preparing: 'PREPARING',
  shutdown: 'SHUTDOWN',
  completed: 'COMPLETED',
} as const;

export type EveningCycleState = (typeof EVENING_CYCLE_STATE)[keyof typeof EVENING_CYCLE_STATE];

export function isEveningCycleState(value: string): value is EveningCycleState {
  return (Object.values(EVENING_CYCLE_STATE) as readonly string[]).includes(value);
}
