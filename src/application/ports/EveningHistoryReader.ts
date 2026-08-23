import type { DayDate, EveningCycle, PreparationPlan, TomorrowPlan } from '../../domain';

export interface EveningHistoryReadRange {
  readonly startDate: DayDate;
  readonly endDate: DayDate;
}

export interface EveningHistorySourceData {
  readonly cycles: readonly EveningCycle[];
  readonly tomorrowPlans: readonly TomorrowPlan[];
  readonly preparationPlans: readonly PreparationPlan[];
}

/**
 * A single read boundary for the evening history projection. Presentation and
 * analytics code must not join the three persistence models themselves.
 */
export interface EveningHistoryReader {
  read(range: EveningHistoryReadRange): Promise<EveningHistorySourceData>;
}
