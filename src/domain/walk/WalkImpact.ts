export const WALK_IMPACT = {
  better: 'better',
  same: 'same',
  worse: 'worse',
} as const;

export type WalkImpact = (typeof WALK_IMPACT)[keyof typeof WALK_IMPACT];

export function isWalkImpact(value: unknown): value is WalkImpact {
  return Object.values(WALK_IMPACT).some((impact) => impact === value);
}
