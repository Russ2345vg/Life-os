import type { SleepPreparationItem } from './SleepSchedule';

export interface SleepPreparationTiming {
  readonly totalPreparationMinutes: number;
  readonly stretchingItemId: string | null;
  readonly stretchingMinutes: number;
}

export function defaultSleepPreparationTiming(): SleepPreparationTiming {
  return { totalPreparationMinutes: 30, stretchingItemId: null, stretchingMinutes: 10 };
}

export function validateSleepPreparationTiming(timing: SleepPreparationTiming): void {
  validateMinutes(timing.totalPreparationMinutes, 180, 'Общее время подготовки');
  validateMinutes(timing.stretchingMinutes, 120, 'Время растяжки');
  if (timing.stretchingItemId !== null) {
    if (typeof timing.stretchingItemId !== 'string' || !timing.stretchingItemId.trim())
      throw new TypeError('Выберите пункт растяжки.');
    if (timing.totalPreparationMinutes < timing.stretchingMinutes)
      throw new TypeError('Растяжка должна входить в общее время подготовки.');
  }
}

export function calculatePreparationStart(
  plannedSleepAt: Date,
  totalPreparationMinutes: number,
): Date {
  validateMinutes(totalPreparationMinutes, 180, 'Общее время подготовки');
  if (!(plannedSleepAt instanceof Date) || Number.isNaN(plannedSleepAt.getTime()))
    throw new TypeError('Плановое время сна некорректно.');
  return new Date(plannedSleepAt.getTime() - totalPreparationMinutes * 60_000);
}

export function resolveStretchingItem(
  timing: SleepPreparationTiming,
  items: readonly SleepPreparationItem[],
): SleepPreparationItem | null {
  return items.find((item) => item.id === timing.stretchingItemId && item.enabled) ?? null;
}

function validateMinutes(value: number, max: number, label: string): void {
  if (!Number.isInteger(value) || value < 1 || value > max)
    throw new TypeError(`${label}: выберите от 1 до ${max} целых минут.`);
}
