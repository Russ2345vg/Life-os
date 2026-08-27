import type { Walk, WalkImpact, WalkIntent, WalkStateSnapshot } from '../../domain';
import type { WalkStatisticsPeriod } from './WalkStatisticsCalculation';
import type { WalkInsight } from './WalkInsights';

export type WalkAnalyticsPeriod = Exclude<WalkStatisticsPeriod, 'allTime'>;
export type WalkAnalyticsMetricKey = keyof WalkStateSnapshot;

export interface WalkAnalyticsMetric {
  readonly sampleSize: number;
  readonly averageBefore: number | null;
  readonly averageAfter: number | null;
  readonly averageDelta: number | null;
}
export type WalkAnalyticsState = Readonly<Record<WalkAnalyticsMetricKey, WalkAnalyticsMetric>>;
export interface WalkAnalyticsMode {
  readonly count: number;
  readonly averageDurationMilliseconds: number | null;
  readonly state: WalkAnalyticsState;
}
export interface WalkAnalytics {
  readonly insights: readonly WalkInsight[];
  readonly period: WalkAnalyticsPeriod;
  readonly startDate: string;
  readonly endDate: string;
  readonly completedCount: number;
  readonly daysWithWalks: number;
  readonly totalDurationMilliseconds: number;
  readonly averageDurationMilliseconds: number | null;
  readonly state: WalkAnalyticsState;
  readonly byIntent: Readonly<Record<WalkIntent, WalkAnalyticsMode>>;
  readonly unclassifiedCount: number;
  readonly impactCounts: Readonly<Record<WalkImpact, number>>;
  readonly withTextResultCount: number;
  readonly withCapturesCount: number;
  readonly captureCount: number;
  readonly days: readonly Readonly<{ date: string; count: number }>[];
}

export function aggregateWalkAnalyticsState(walks: readonly Walk[]): WalkAnalyticsState {
  return Object.freeze({
    energy: aggregateMetric(walks, 'energy'),
    tension: aggregateMetric(walks, 'tension'),
    clarity: aggregateMetric(walks, 'clarity'),
  });
}

function aggregateMetric(
  walks: readonly Walk[],
  metric: WalkAnalyticsMetricKey,
): WalkAnalyticsMetric {
  let sampleSize = 0;
  let beforeTotal = 0;
  let afterTotal = 0;
  let deltaTotal = 0;
  for (const walk of walks) {
    const before = walk.beforeState?.[metric];
    const after = walk.afterState?.[metric];
    if (before === undefined || after === undefined) continue;
    sampleSize += 1;
    beforeTotal += before;
    afterTotal += after;
    deltaTotal += after - before;
  }
  return Object.freeze({
    sampleSize,
    averageBefore: sampleSize === 0 ? null : beforeTotal / sampleSize,
    averageAfter: sampleSize === 0 ? null : afterTotal / sampleSize,
    averageDelta: sampleSize === 0 ? null : deltaTotal / sampleSize,
  });
}
