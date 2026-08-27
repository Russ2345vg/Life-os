export interface WalkStateSnapshot {
  readonly energy: number;
  readonly tension: number;
  readonly clarity: number;
}

export function isWalkStateSnapshot(value: unknown): value is WalkStateSnapshot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const snapshot = value as Record<string, unknown>;
  return (
    isStateScore(snapshot.energy) &&
    isStateScore(snapshot.tension) &&
    isStateScore(snapshot.clarity)
  );
}

function isStateScore(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === 'number' && value >= 0 && value <= 10;
}
