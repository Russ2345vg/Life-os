import type { MorningCenterOverview } from '../../application';

export function calculateMorningElapsedMinutes(
  overview: Pick<MorningCenterOverview, 'startedAt' | 'finishedAt'>,
  now: Date,
): number {
  if (overview.startedAt === null) return 0;
  const elapsedUntil = overview.finishedAt ?? now;
  return Math.max(0, Math.floor((elapsedUntil.getTime() - overview.startedAt.getTime()) / 60_000));
}
