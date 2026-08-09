export const WALK_MODE = {
  stopwatch: 'stopwatch',
  timer: 'timer',
} as const;

export type WalkMode = (typeof WALK_MODE)[keyof typeof WALK_MODE];

export function isWalkMode(value: unknown): value is WalkMode {
  return Object.values(WALK_MODE).some((mode) => mode === value);
}
