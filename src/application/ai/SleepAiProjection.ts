import {
  isConfirmedSleepObservation,
  summarizeSleepObservations,
  timeInBedMilliseconds,
  type SleepObservation,
} from '../../domain/sleep/SleepObservation';
import type { NightCycle } from '../../domain/sleep/SleepSchedule';

export interface SleepAiSource {
  readonly kind: 'sleep';
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly date: string;
}

export function projectSleepForAi(input: {
  readonly observations: readonly SleepObservation[];
  readonly plans: readonly NightCycle[];
  readonly from?: string;
  readonly to?: string;
}): { readonly facts: readonly string[]; readonly sources: readonly SleepAiSource[] } {
  const confirmed = input.observations
    .filter(isConfirmedSleepObservation)
    .filter(
      ({ cycleDate }) =>
        (input.from === undefined || cycleDate >= input.from) &&
        (input.to === undefined || cycleDate <= input.to),
    )
    .sort((left, right) => right.cycleDate.localeCompare(left.cycleDate));
  const summary = summarizeSleepObservations(confirmed);
  const plans = new Map(input.plans.map((plan) => [plan.cycleDate, plan]));
  const facts = [
    `Подтверждено ночей: ${summary.confirmedCount}`,
    `Среднее время в постели: ${summary.averageTimeInBedMinutes ?? 'нет данных'} мин`,
    `Разброс времени, когда лёг: ${summary.bedtimeVariabilityMinutes ?? 'нет данных'} мин; когда встал: ${summary.wakeVariabilityMinutes ?? 'нет данных'} мин`,
  ];
  const sources = confirmed.map((observation): SleepAiSource => {
    const plan = plans.get(observation.cycleDate);
    const planned = plan
      ? `План: ${timeRange(plan.plannedSleepAt, plan.plannedWakeAt, observation.timeZone)}; `
      : '';
    return {
      kind: 'sleep',
      id: observation.id,
      title: `Наблюдение сна ${observation.cycleDate}`,
      detail: `${planned}факт: ${timeRange(observation.wentToBedAt, observation.wokeAt, observation.timeZone)}; время в постели: ${Math.round(timeInBedMilliseconds(observation) / 60_000)} мин`,
      date: observation.cycleDate,
    };
  });
  return { facts, sources };
}

function timeRange(start: Date, end: Date, timeZone: string): string {
  return `${timeLabel(start, timeZone)}–${timeLabel(end, timeZone)}`;
}

function timeLabel(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(value);
}
