import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { WalkRepository } from '../ports/WalkRepository';
import {
  calculateWalkStatistics,
  WALK_STATISTICS_PERIOD,
  type WalkStatistics,
  type WalkStatisticsPeriod,
} from '../walk/WalkStatisticsCalculation';

export { WALK_STATISTICS_PERIOD };
export type { WalkStatistics, WalkStatisticsPeriod };

export class GetWalkStatistics {
  public constructor(
    readonly repository: WalkRepository,
    readonly currentDateProvider: CurrentDateProvider,
  ) {}

  public async execute(
    period: WalkStatisticsPeriod = WALK_STATISTICS_PERIOD.last7Days,
  ): Promise<WalkStatistics> {
    const currentDate = this.currentDateProvider.getCurrentDate();
    return calculateWalkStatistics(await this.repository.findAll(), period, currentDate).statistics;
  }
}
