import type { WalkImpact, WalkIntent } from '../../domain';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { WalkCaptureRepository } from '../ports/WalkCaptureRepository';
import type { WalkRepository } from '../ports/WalkRepository';
import { buildWalkInsights } from '../walk/WalkInsightEngine';
import {
  aggregateWalkAnalyticsState,
  type WalkAnalytics,
  type WalkAnalyticsMode,
  type WalkAnalyticsPeriod,
} from '../walk/WalkAnalytics';
import {
  calculateWalkStatistics,
  completedWalkDuration,
  shiftWalkDate,
} from '../walk/WalkStatisticsCalculation';

/** Ephemeral read model of existing Walks and captures; never owns persisted state. */
export class GetWalkAnalytics {
  public constructor(
    private readonly walks: Pick<WalkRepository, 'findAll'>,
    private readonly dates: CurrentDateProvider,
    private readonly captures: Pick<WalkCaptureRepository, 'findByWalkId'>,
  ) {}

  public async execute(period: WalkAnalyticsPeriod = 'last30Days'): Promise<WalkAnalytics> {
    const currentDate = this.dates.getCurrentDate();
    const { completed, statistics, startDate } = calculateWalkStatistics(
      await this.walks.findAll(),
      period,
      currentDate,
    );
    const capturesByWalk = await Promise.all(
      completed.map((walk) => this.captures.findByWalkId(walk.id)),
    );
    const forIntent = (intent: WalkIntent): WalkAnalyticsMode => {
      const walks = completed.filter((walk) => walk.intent === intent);
      return Object.freeze({
        count: walks.length,
        averageDurationMilliseconds: completedWalkDuration(walks).averageDurationMilliseconds,
        state: aggregateWalkAnalyticsState(walks),
      });
    };
    const dailyCounts = new Map<string, number>();
    const impactCounts: Record<WalkImpact, number> = { better: 0, same: 0, worse: 0 };
    for (const walk of completed) {
      const date = walk.date.toString();
      dailyCounts.set(date, (dailyCounts.get(date) ?? 0) + 1);
      if (walk.impact !== null) impactCounts[walk.impact] += 1;
    }
    return Object.freeze({
      insights: buildWalkInsights(
        completed.map((walk) => ({
          intent: walk.intent,
          durationMilliseconds: walk.actualDurationMilliseconds,
          startedAt: walk.startedAt,
          beforeState: walk.beforeState,
          afterState: walk.afterState,
        })),
      ),
      period,
      startDate: startDate!.toString(),
      endDate: currentDate.toString(),
      completedCount: statistics.completedCount,
      daysWithWalks: dailyCounts.size,
      totalDurationMilliseconds: statistics.totalDurationMilliseconds,
      averageDurationMilliseconds: statistics.averageDurationMilliseconds,
      state: aggregateWalkAnalyticsState(completed),
      byIntent: Object.freeze({
        free: forIntent('free'),
        recovery: forIntent('recovery'),
        reflection: forIntent('reflection'),
      }),
      unclassifiedCount: completed.filter((walk) => walk.intent === null).length,
      impactCounts: Object.freeze(impactCounts),
      withTextResultCount: completed.filter((walk) => (walk.result?.trim().length ?? 0) > 0).length,
      withCapturesCount: capturesByWalk.filter((captures) => captures.length > 0).length,
      captureCount: capturesByWalk.reduce((count, captures) => count + captures.length, 0),
      days: Object.freeze(
        Array.from({ length: period === 'last7Days' ? 7 : 30 }, (_, index) => {
          const date = shiftWalkDate(startDate!, index).toString();
          return Object.freeze({ date, count: dailyCounts.get(date) ?? 0 });
        }),
      ),
    });
  }
}
