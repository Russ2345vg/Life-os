import type { SleepScheduleState } from '../../domain/sleep/SleepSchedule';
import { calculateNightWindow, resolveSleepCycleDate } from '../../domain/sleep/NightTime';

export interface SleepTodayEntry {
  readonly active: boolean;
  readonly cycleDate: string | null;
  readonly startsAt: Date | null;
  readonly closesAt: Date | null;
}

export function selectSleepTodayEntry(state: SleepScheduleState, now: Date): SleepTodayEntry {
  if (Number.isNaN(now.getTime())) throw new TypeError('Текущее время некорректно.');
  const settings = state.settings;
  if (settings === null) {
    return { active: false, cycleDate: null, startsAt: null, closesAt: null };
  }
  const cycleDate = resolveSleepCycleDate(now, settings.timeZone, settings.wakeTime);
  const window = calculateNightWindow({ cycleDate, ...settings });
  const startsAt = new Date(window.plannedSleepAt.getTime() - 60 * 60_000);
  const closesAt = new Date(window.plannedWakeAt);
  return {
    active: now.getTime() >= startsAt.getTime() && now.getTime() < closesAt.getTime(),
    cycleDate,
    startsAt,
    closesAt,
  };
}
