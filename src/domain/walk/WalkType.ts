export const WALK_TYPE = {
  restorative: 'restorative',
  mindful: 'mindful',
  reflection: 'reflection',
  physical: 'physical',
  phoneFree: 'phoneFree',
} as const;

export type WalkType = (typeof WALK_TYPE)[keyof typeof WALK_TYPE];

export function isWalkType(value: unknown): value is WalkType {
  return Object.values(WALK_TYPE).some((type) => type === value);
}
