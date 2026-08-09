import { DayDate, WALK_STATUS, WALK_TYPE, type Walk, type WalkType } from '../../domain';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { WalkRepository } from '../ports/WalkRepository';

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

export class GetWalkStatistics {
  public constructor(
    readonly repository: WalkRepository,
    readonly currentDateProvider: CurrentDateProvider,
  ) {}

  public async execute(
    period: WalkStatisticsPeriod = WALK_STATISTICS_PERIOD.last7Days,
  ): Promise<WalkStatistics> {
    const currentDate = this.currentDateProvider.getCurrentDate();
    const walks = (await this.repository.findAll()).filter((walk) =>
      isWalkInPeriod(walk, period, currentDate),
    );
    const completed = walks.filter((walk) => walk.status === WALK_STATUS.completed);
    const totalDurationMilliseconds = completed.reduce(
      (total, walk) => total + (walk.actualDurationMilliseconds ?? 0),
      0,
    );

    return {
      period,
      completedCount: completed.length,
      abandonedCount: walks.filter((walk) => walk.status === WALK_STATUS.abandoned).length,
      totalDurationMilliseconds,
      averageDurationMilliseconds:
        completed.length === 0 ? null : totalDurationMilliseconds / completed.length,
      completedByType: countCompletedByType(completed),
    };
  }
}

function isWalkInPeriod(walk: Walk, period: WalkStatisticsPeriod, currentDate: DayDate): boolean {
  if (period === WALK_STATISTICS_PERIOD.allTime) return true;
  const days = period === WALK_STATISTICS_PERIOD.last7Days ? 7 : 30;
  const firstDate = shiftDayDate(currentDate, -(days - 1));
  return !walk.date.isBefore(firstDate) && !walk.date.isAfter(currentDate);
}

function shiftDayDate(date: DayDate, days: number): DayDate {
  const [yearText, monthText, dayText] = date.toString().split('-');
  const value = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText) + days));
  return DayDate.fromParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
}

function countCompletedByType(walks: readonly Walk[]): Readonly<Record<WalkType, number>> {
  const counts: Record<WalkType, number> = {
    [WALK_TYPE.restorative]: 0,
    [WALK_TYPE.mindful]: 0,
    [WALK_TYPE.reflection]: 0,
    [WALK_TYPE.physical]: 0,
    [WALK_TYPE.phoneFree]: 0,
  };
  for (const walk of walks) counts[walk.type] += 1;
  return counts;
}
