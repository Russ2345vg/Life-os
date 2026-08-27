export const WALK_STATUS = {
  planned: 'planned',
  running: 'running',
  paused: 'paused',
  completed: 'completed',
  abandoned: 'abandoned',
} as const;

export type WalkStatus = (typeof WALK_STATUS)[keyof typeof WALK_STATUS];

export function isWalkStatus(value: unknown): value is WalkStatus {
  return Object.values(WALK_STATUS).some((status) => status === value);
}
