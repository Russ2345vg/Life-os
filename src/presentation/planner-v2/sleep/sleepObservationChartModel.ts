import {
  isConfirmedSleepObservation,
  type SleepObservation,
} from '../../../domain/sleep/SleepObservation';

export type SleepChartPeriod = 7 | 30;
export type ConfirmedSleepObservation = SleepObservation & {
  readonly wentToBedAt: Date;
  readonly wokeAt: Date;
  readonly confirmedAt: Date;
};

export function selectChartObservations(
  observations: readonly SleepObservation[],
  period: SleepChartPeriod,
): readonly ConfirmedSleepObservation[] {
  return observations
    .filter(isConfirmedSleepObservation)
    .sort((left, right) => right.cycleDate.localeCompare(left.cycleDate))
    .slice(0, period);
}
