import type { SleepSettings } from '../../../domain/sleep/SleepSchedule';

export type SleepPageMode = 'MORNING' | 'EVENING';

export function resolveSleepPageMode(
  now: Date,
  settings: Pick<SleepSettings, 'bedtime' | 'wakeTime' | 'timeZone'>,
): SleepPageMode {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: settings.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const local =
    Number(parts.find((p) => p.type === 'hour')?.value) * 60 +
    Number(parts.find((p) => p.type === 'minute')?.value);
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const wake = minutes(settings.wakeTime);
  const awake = (minutes(settings.bedtime) - wake + 1440) % 1440;
  const sinceWake = (local - wake + 1440) % 1440;
  return sinceWake < awake / 2 ? 'MORNING' : 'EVENING';
}
