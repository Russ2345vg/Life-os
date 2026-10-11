import { DayDate } from '../day/DayDate';
import type { WakeResultKind } from './SleepSchedule';
import { resolveSleepCycleDate } from './NightTime';
import {
  validateSleepMorningFeedback,
  type SleepMorningFeedback,
  type SleepMorningFeedbackPatch,
} from './SleepMorningFeedback';

export type WakeObservationSource = 'ALARM_QR' | 'ALARM_EMERGENCY' | 'MANUAL';

export interface SleepObservation {
  readonly morningFeedback?: SleepMorningFeedback;
  readonly id: string;
  readonly cycleDate: string;
  readonly nightCycleId: string | null;
  readonly wentToBedAt: Date | null;
  readonly wokeAt: Date | null;
  readonly wakeSource: WakeObservationSource | null;
  readonly wakeOccurrenceId: string | null;
  readonly timeZone: string;
  readonly confirmedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SleepObservationSummary {
  readonly confirmedCount: number;
  readonly incompleteCount: number;
  readonly averageTimeInBedMinutes: number | null;
  readonly averageBedtimeMinute: number | null;
  readonly averageWakeMinute: number | null;
  readonly bedtimeVariabilityMinutes: number | null;
  readonly wakeVariabilityMinutes: number | null;
}

export interface ManualSleepDraftInput {
  readonly id: string;
  readonly cycleDate: string;
  readonly nightCycleId: string | null;
  readonly timeZone: string;
  readonly kind: 'BEDTIME' | 'WAKE';
  readonly recordedAt: Date;
  readonly now: Date;
}

export function setSleepMorningFeedback(
  previous: SleepObservation | null,
  input: {
    readonly id: string;
    readonly cycleDate: string;
    readonly nightCycleId: string | null;
    readonly timeZone: string;
    readonly patch: SleepMorningFeedbackPatch;
    readonly now: Date;
  },
): SleepObservation {
  DayDate.create(input.cycleDate);
  if (previous && previous.cycleDate !== input.cycleDate)
    throw new TypeError('Оценка относится к другой ночи.');
  validateSleepMorningFeedback({
    sleepQuality: input.patch.sleepQuality ?? null,
    energy: input.patch.energy ?? null,
    recordedAt: input.now,
  });
  const timeZone = previous?.timeZone ?? input.timeZone;
  const wakeDate = new Date(`${input.cycleDate}T12:00:00Z`);
  wakeDate.setUTCDate(wakeDate.getUTCDate() + 1);
  if (wakeDate.toISOString().slice(0, 10) > resolveSleepCycleDate(input.now, timeZone, '00:00'))
    throw new TypeError('Нельзя оценить будущую ночь.');
  const observation: SleepObservation = {
    ...(previous ?? {
      id: input.id,
      cycleDate: input.cycleDate,
      nightCycleId: input.nightCycleId,
      wentToBedAt: null,
      wokeAt: null,
      wakeSource: null,
      wakeOccurrenceId: null,
      timeZone,
      confirmedAt: null,
      createdAt: new Date(input.now),
    }),
    updatedAt: new Date(input.now),
    morningFeedback: {
      sleepQuality: input.patch.sleepQuality ?? previous?.morningFeedback?.sleepQuality ?? null,
      energy: input.patch.energy ?? previous?.morningFeedback?.energy ?? null,
      recordedAt: new Date(input.now),
    },
  };
  validateSleepObservation(observation);
  return observation;
}

export function clearSleepMorningFeedback(
  observation: SleepObservation,
  now: Date,
): SleepObservation {
  const { morningFeedback, ...rest } = observation;
  if (morningFeedback === undefined) return observation;
  const cleared = { ...rest, updatedAt: new Date(now) };
  validateSleepObservation(cleared);
  return cleared;
}

export function recordManualSleepDraft(
  previous: SleepObservation | null,
  input: ManualSleepDraftInput,
): SleepObservation {
  if (previous !== null && previous.cycleDate !== input.cycleDate)
    throw new TypeError('Отметка относится к другой ночи.');
  if (
    previous !== null &&
    (isConfirmedSleepObservation(previous) ||
      (input.kind === 'BEDTIME' && previous.wentToBedAt !== null) ||
      (input.kind === 'WAKE' && previous.wakeSource === 'MANUAL'))
  )
    return previous;
  if (input.recordedAt > input.now) throw new TypeError('Время отметки ещё не наступило.');
  const observation: SleepObservation = {
    id: previous?.id ?? input.id,
    ...(previous?.morningFeedback ? { morningFeedback: previous.morningFeedback } : {}),
    cycleDate: input.cycleDate,
    nightCycleId: previous?.nightCycleId ?? input.nightCycleId,
    wentToBedAt:
      input.kind === 'BEDTIME' ? new Date(input.recordedAt) : (previous?.wentToBedAt ?? null),
    wokeAt: input.kind === 'WAKE' ? new Date(input.recordedAt) : (previous?.wokeAt ?? null),
    wakeSource: input.kind === 'WAKE' ? 'MANUAL' : (previous?.wakeSource ?? null),
    wakeOccurrenceId: previous?.wakeOccurrenceId ?? null,
    timeZone: previous?.timeZone ?? input.timeZone,
    confirmedAt: null,
    createdAt: previous?.createdAt ?? new Date(input.now),
    updatedAt: new Date(input.now),
  };
  validateSleepObservation(observation);
  return observation;
}

export function createWakeObservationDraft(input: {
  readonly id: string;
  readonly cycleDate: string;
  readonly nightCycleId: string | null;
  readonly wakeOccurrenceId: string;
  readonly wakeKind: WakeResultKind;
  readonly wokeAt: Date;
  readonly timeZone: string;
  readonly now: Date;
}): SleepObservation {
  const source = alarmSource(input.wakeKind);
  if (source === null)
    throw new TypeError('Для наблюдения требуется результат отключения будильника.');
  const observation: SleepObservation = {
    id: input.id,
    cycleDate: input.cycleDate,
    nightCycleId: input.nightCycleId,
    wentToBedAt: null,
    wokeAt: new Date(input.wokeAt),
    wakeSource: source,
    wakeOccurrenceId: input.wakeOccurrenceId,
    timeZone: input.timeZone,
    confirmedAt: null,
    createdAt: new Date(input.now),
    updatedAt: new Date(input.now),
  };
  validateSleepObservation(observation);
  return observation;
}

export function confirmSleepObservation(
  previous: SleepObservation | null,
  input: {
    readonly id: string;
    readonly cycleDate: string;
    readonly nightCycleId: string | null;
    readonly wentToBedAt: Date;
    readonly wokeAt: Date;
    readonly timeZone: string;
    readonly confirmedAt: Date;
  },
): SleepObservation {
  const sameAlarmWake =
    previous !== null &&
    previous.wakeSource !== null &&
    previous?.wakeSource !== 'MANUAL' &&
    previous.wokeAt?.getTime() === input.wokeAt.getTime();
  const observation: SleepObservation = {
    id: previous?.id ?? input.id,
    ...(previous?.morningFeedback ? { morningFeedback: previous.morningFeedback } : {}),
    cycleDate: previous?.cycleDate ?? input.cycleDate,
    nightCycleId: previous?.nightCycleId ?? input.nightCycleId,
    wentToBedAt: new Date(input.wentToBedAt),
    wokeAt: new Date(input.wokeAt),
    wakeSource: sameAlarmWake ? previous.wakeSource : 'MANUAL',
    wakeOccurrenceId: previous?.wakeOccurrenceId ?? null,
    timeZone: previous?.timeZone ?? input.timeZone,
    confirmedAt: new Date(input.confirmedAt),
    createdAt: new Date(previous?.createdAt ?? input.confirmedAt),
    updatedAt: new Date(input.confirmedAt),
  };
  validateSleepObservation(observation);
  return observation;
}

export function reviseSleepObservation(
  observation: SleepObservation,
  input: {
    readonly wentToBedAt: Date;
    readonly wokeAt: Date;
    readonly updatedAt: Date;
  },
): SleepObservation {
  if (!isConfirmedSleepObservation(observation))
    throw new TypeError('Сначала подтвердите наблюдение за ночью.');
  const revised: SleepObservation = {
    ...observation,
    wentToBedAt: new Date(input.wentToBedAt),
    wokeAt: new Date(input.wokeAt),
    wakeSource: 'MANUAL',
    confirmedAt: new Date(input.updatedAt),
    updatedAt: new Date(input.updatedAt),
  };
  validateSleepObservation(revised);
  return revised;
}

export function validateSleepObservation(observation: SleepObservation): void {
  if (observation.morningFeedback !== undefined)
    validateSleepMorningFeedback(observation.morningFeedback);
  requiredText(observation.id, 'Идентификатор наблюдения');
  DayDate.create(observation.cycleDate);
  if (observation.nightCycleId !== null) requiredText(observation.nightCycleId, 'Ночной цикл');
  if (observation.wakeOccurrenceId !== null)
    requiredText(observation.wakeOccurrenceId, 'Срабатывание будильника');
  validTimeZone(observation.timeZone);
  validDate(observation.createdAt, 'Время создания наблюдения');
  validDate(observation.updatedAt, 'Время изменения наблюдения');
  if (observation.updatedAt < observation.createdAt)
    throw new TypeError('Время изменения наблюдения не может быть раньше его создания.');
  if (observation.wentToBedAt !== null) validDate(observation.wentToBedAt, 'Время отбоя');
  if (observation.wokeAt !== null) validDate(observation.wokeAt, 'Время подъёма');
  if (observation.confirmedAt !== null) validDate(observation.confirmedAt, 'Время подтверждения');
  if (
    observation.wentToBedAt !== null &&
    observation.wokeAt !== null &&
    observation.wentToBedAt.getTime() >= observation.wokeAt.getTime()
  )
    throw new TypeError('Время, когда лёг, должно быть раньше времени подъёма.');
  if (observation.confirmedAt !== null && !isComplete(observation))
    throw new TypeError('Для подтверждения укажите время, когда легли и встали.');
  if (observation.wakeSource === null && observation.wokeAt !== null)
    throw new TypeError('Укажите источник времени подъёма.');
  if (
    observation.wakeSource !== null &&
    !['ALARM_QR', 'ALARM_EMERGENCY', 'MANUAL'].includes(observation.wakeSource)
  )
    throw new TypeError('Источник времени подъёма не поддерживается.');
}

export function isConfirmedSleepObservation(
  observation: SleepObservation,
): observation is SleepObservation & {
  readonly wentToBedAt: Date;
  readonly wokeAt: Date;
  readonly confirmedAt: Date;
} {
  return observation.confirmedAt !== null && isComplete(observation);
}

export function timeInBedMilliseconds(observation: SleepObservation): number {
  if (!isConfirmedSleepObservation(observation))
    throw new TypeError('Время в постели доступно после подтверждения ночи.');
  return observation.wokeAt.getTime() - observation.wentToBedAt.getTime();
}

export function summarizeSleepObservations(
  observations: readonly SleepObservation[],
): SleepObservationSummary {
  const confirmed = observations.filter(isConfirmedSleepObservation);
  const bedtimeMinutes = confirmed.map((item) =>
    localMinute(item.wentToBedAt, item.timeZone, true),
  );
  const wakeMinutes = confirmed.map((item) => localMinute(item.wokeAt, item.timeZone, false));
  return {
    confirmedCount: confirmed.length,
    incompleteCount: observations.length - confirmed.length,
    averageTimeInBedMinutes: average(confirmed.map((item) => timeInBedMilliseconds(item) / 60_000)),
    averageBedtimeMinute: average(bedtimeMinutes),
    averageWakeMinute: average(wakeMinutes),
    bedtimeVariabilityMinutes: variability(bedtimeMinutes),
    wakeVariabilityMinutes: variability(wakeMinutes),
  };
}

function isComplete(observation: SleepObservation): boolean {
  return observation.wentToBedAt !== null && observation.wokeAt !== null;
}

function alarmSource(kind: WakeResultKind): WakeObservationSource | null {
  if (kind === 'QR') return 'ALARM_QR';
  if (kind === 'EMERGENCY') return 'ALARM_EMERGENCY';
  return null;
}

function localMinute(value: Date, timeZone: string, bedtime: boolean): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  const total = hour * 60 + minute;
  return bedtime && total < 12 * 60 ? total + 24 * 60 : total;
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function variability(values: readonly number[]): number | null {
  const mean = average(values);
  if (mean === null) return null;
  return Math.round(values.reduce((sum, value) => sum + Math.abs(value - mean), 0) / values.length);
}

function requiredText(value: string, label: string): void {
  if (!value.trim()) throw new TypeError(`${label} не указан.`);
}

function validDate(value: Date, label: string): void {
  if (!Number.isFinite(value.getTime())) throw new TypeError(`${label} некорректно.`);
}

function validTimeZone(value: string): void {
  requiredText(value, 'Часовой пояс');
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(0);
  } catch {
    throw new TypeError('Часовой пояс не поддерживается.');
  }
}
