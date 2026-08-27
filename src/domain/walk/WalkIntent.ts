export const WALK_INTENT = {
  free: 'free',
  recovery: 'recovery',
  reflection: 'reflection',
} as const;

export type WalkIntent = (typeof WALK_INTENT)[keyof typeof WALK_INTENT];

export function isWalkIntent(value: unknown): value is WalkIntent {
  return Object.values(WALK_INTENT).some((intent) => intent === value);
}
