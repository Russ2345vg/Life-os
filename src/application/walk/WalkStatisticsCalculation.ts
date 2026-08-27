import { DayDate, WALK_STATUS, WALK_TYPE, type Walk, type WalkType } from '../../domain';

export const WALK_STATISTICS_PERIOD = {
  last7Days: 'last7Days',
  last30Days: 'last30Days',
  allTime: 'allTime',
} as const;

export type WalkStatisticsPeriod =
  (typeof WALK_STATISTICS_PERIOD)[keyof typeof WALK_STATISTICS_PERIOD];

export interface WalkStatistics {
  readonly period: WalkStatisticsPeriod;
  readonly completedCount: number;
  readonly abandonedCount: number;
  readonly totalDurationMilliseconds: number;
  readonly averageDurationMilliseconds: number | null;
  readonly completedByType: Readonly<Record<WalkType, number>>;
}

/** Shared by the legacy summary and Analytics; no repository reads or stored projection. */
export function calculateWalkStatistics(
  source: readonly Walk[],
  period: WalkStatisticsPeriod,
  currentDate: DayDate,
) {
  const startDate =
    period === WALK_STATISTICS_PERIOD.allTime
      ? null
      : shiftWalkDate(currentDate, -(period === WALK_STATISTICS_PERIOD.last7Days ? 6 : 29));
  const walks = source.filter(
    (walk) =>
      startDate === null || (!walk.date.isBefore(startDate) && !walk.date.isAfter(currentDate)),
  );
  const completed = walks.filter((walk) => walk.status === WALK_STATUS.completed);
  const duration = completedWalkDuration(completed);
  const counts: Record<WalkType, number> = {
    [WALK_TYPE.restorative]: 0,
    [WALK_TYPE.mindful]: 0,
    [WALK_TYPE.reflection]: 0,
    [WALK_TYPE.physical]: 0,
    [WALK_TYPE.phoneFree]: 0,
  };
  for (const walk of completed) counts[walk.type] += 1;
  const statistics: WalkStatistics = Object.freeze({
    period,
    completedCount: completed.length,
    abandonedCount: walks.filter((walk) => walk.status === WALK_STATUS.abandoned).length,
    ...duration,
    completedByType: Object.freeze(counts),
  });
  return { startDate, endDate: currentDate, completed, statistics };
}

export function completedWalkDuration(completed: readonly Walk[]) {
  const totalDurationMilliseconds = completed.reduce(
    (total, walk) => total + (walk.actualDurationMilliseconds ?? 0),
    0,
  );
  return {
    totalDurationMilliseconds,
    averageDurationMilliseconds:
      completed.length === 0 ? null : totalDurationMilliseconds / completed.length,
  };
}

export function shiftWalkDate(date: DayDate, days: number): DayDate {
  const [yearText, monthText, dayText] = date.toString().split('-');
  const value = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText) + days));
  return DayDate.fromParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
}
