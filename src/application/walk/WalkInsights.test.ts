import { describe, expect, it } from 'vitest';
import type { WalkAnalyticsResult } from './WalkAnalytics';
import { describeWalkInsights } from './WalkInsights';

const result = (count: number): WalkAnalyticsResult => ({
  completedCount: count,
  durationMs: count * 600_000,
  activeDays: 1,
  medianDurationMs: 600_000,
  abandonedCount: 0,
  pairedCount: count,
  meanDelta: { energy: 2, tension: 2, clarity: -1 },
  sourceIds: Array.from({ length: count }, (_, i) => `walk-${i}`),
  pairedSourceIds: Array.from({ length: count }, (_, i) => `walk-${i}`),
  days: [],
});

describe('descriptive walk insights', () => {
  it('requires five paired records and keeps tension direction and sources explicit', () => {
    expect(describeWalkInsights(result(4))).toEqual([]);
    expect(describeWalkInsights(result(5))).toMatchObject([
      {
        kind: 'energy',
        sampleSize: 5,
        sourceIds: ['walk-0', 'walk-1', 'walk-2', 'walk-3', 'walk-4'],
      },
      { kind: 'tension', direction: 'increased', sampleSize: 5 },
      { kind: 'clarity', direction: 'decreased', sampleSize: 5 },
    ]);
  });
});
