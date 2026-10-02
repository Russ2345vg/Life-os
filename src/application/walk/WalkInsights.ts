import type { WalkAnalyticsResult } from './WalkAnalytics';

export interface WalkInsight {
  readonly kind: 'energy' | 'tension' | 'clarity';
  readonly direction: 'increased' | 'decreased' | 'unchanged';
  readonly meanChange: number;
  readonly sampleSize: number;
  readonly sourceIds: readonly string[];
}

export function describeWalkInsights(analytics: WalkAnalyticsResult): readonly WalkInsight[] {
  if (analytics.pairedCount < 5 || analytics.meanDelta === null) return [];
  return (['energy', 'tension', 'clarity'] as const).map((kind) => {
    const meanChange = analytics.meanDelta![kind];
    return {
      kind,
      direction:
        meanChange > 0
          ? ('increased' as const)
          : meanChange < 0
            ? ('decreased' as const)
            : ('unchanged' as const),
      meanChange,
      sampleSize: analytics.pairedCount,
      sourceIds: analytics.pairedSourceIds,
    };
  });
}
