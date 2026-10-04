import { calculateNightWindow } from '../../../domain/sleep/NightTime';

export function observationWindowFromTimes(
  cycleDate: string,
  wentToBed: string,
  wokeAt: string,
  timeZone: string,
): { readonly wentToBedAt: Date; readonly wokeAt: Date } {
  if (!wentToBed || !wokeAt) throw new TypeError('Укажите оба фактических времени.');
  const window = calculateNightWindow({
    cycleDate,
    bedtime: wentToBed,
    wakeTime: wokeAt,
    timeZone,
  });
  return { wentToBedAt: window.plannedSleepAt, wokeAt: window.plannedWakeAt };
}
