import type { SleepObservation } from '../../../domain/sleep/SleepObservation';
import { DayDate } from '../../../domain/day/DayDate';

export type SleepChartPeriod = 7 | 30;
export type ConfirmedSleepObservation = SleepObservation & {
  readonly wentToBedAt: Date;
  readonly wokeAt: Date;
  readonly confirmedAt: Date;
};

export interface SleepChartDay {
  readonly cycleDate: string;
  readonly observation: SleepObservation | null;
}

export function selectSleepChartDays(
  observations: readonly SleepObservation[],
  period: SleepChartPeriod,
  endCycleDate: string,
): readonly SleepChartDay[] {
  DayDate.create(endCycleDate);
  const byDate = new Map(observations.map((item) => [item.cycleDate, item]));
  return Array.from({ length: period }, (_, index) => {
    const date = new Date(`${endCycleDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - index);
    const cycleDate = date.toISOString().slice(0, 10);
    return { cycleDate, observation: byDate.get(cycleDate) ?? null };
  });
}
