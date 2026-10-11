import type {
  AndroidAlarmReport,
  AndroidAlarmOutcome,
} from '../../domain/sleep/AndroidAlarmReport';
import { resolveSleepCycleDate } from '../../domain/sleep/NightTime';
import type { SleepScheduleState } from '../../domain/sleep/SleepSchedule';
import type { WakeAlarmSchedule, WakeAlarmStatus } from './WakeAlarmGateway';

export function buildWakeAlarmSchedule(
  state: SleepScheduleState,
  now: Date,
): WakeAlarmSchedule | null {
  const settings = state.settings;
  if (!settings) return null;
  const next = state.wakeOccurrences
    .filter(
      ({ status, scheduledAt }) => status === 'SCHEDULED' && scheduledAt.getTime() > now.getTime(),
    )
    .sort(
      (left, right) =>
        left.scheduledAt.getTime() - right.scheduledAt.getTime() || left.id.localeCompare(right.id),
    )[0];
  const currentCycleDate = resolveSleepCycleDate(now, settings.timeZone, settings.wakeTime);
  const activeCycle = state.nightCycles.find(({ cycleDate }) => cycleDate === currentCycleDate);
  return {
    enabled: settings.enabled,
    settingsVersion: settings.version,
    bedtime: settings.bedtime,
    wakeTime: settings.wakeTime,
    timeZone: settings.timeZone,
    quietModeEnabled: settings.quietModeEnabled,
    currentCycleDate,
    repeatReminderSuppressed: activeCycle?.preparationCompletionKind != null,
    sound: settings.alarmSound,
    nextOccurrence:
      settings.enabled && next
        ? { id: next.id, cycleDate: next.cycleDate, scheduledAt: next.scheduledAt }
        : null,
  };
}

export function wakeAlarmScheduleKey(state: SleepScheduleState, now: Date): string | null {
  const schedule = buildWakeAlarmSchedule(state, now);
  if (!schedule || !state.settings) return null;
  // Explicit fields keep the key stable across serialization and object-property order.
  return JSON.stringify([
    state.settings.updatedAt.toISOString(),
    schedule.settingsVersion,
    schedule.enabled,
    schedule.bedtime,
    schedule.wakeTime,
    schedule.timeZone,
    schedule.quietModeEnabled,
    schedule.currentCycleDate,
    schedule.repeatReminderSuppressed,
    schedule.sound.uri,
    schedule.sound.title,
    state.settings.wakeOverride?.cycleDate ?? null,
    state.settings.wakeOverride?.wakeTime ?? null,
    schedule.nextOccurrence?.id ?? null,
    schedule.nextOccurrence?.cycleDate ?? null,
    schedule.nextOccurrence?.scheduledAt.toISOString() ?? null,
  ]);
}

function matchesOccurrence(
  schedule: WakeAlarmSchedule,
  evidence: Pick<
    WakeAlarmStatus,
    'acknowledgedSettingsVersion' | 'nextOccurrenceId' | 'nextScheduledAt'
  >,
): boolean {
  return (
    schedule.nextOccurrence !== null &&
    evidence.acknowledgedSettingsVersion === schedule.settingsVersion &&
    evidence.nextOccurrenceId === schedule.nextOccurrence.id &&
    evidence.nextScheduledAt?.getTime() === schedule.nextOccurrence.scheduledAt.getTime()
  );
}

export function isWakeScheduleAcknowledged(
  state: SleepScheduleState,
  status: WakeAlarmStatus,
  now: Date,
): boolean {
  const schedule = buildWakeAlarmSchedule(state, now);
  return (
    schedule !== null &&
    schedule.enabled &&
    status.supported &&
    status.state === 'SCHEDULED' &&
    status.exactAlarmGranted &&
    status.notificationsGranted &&
    status.fullScreenGranted &&
    matchesOccurrence(schedule, status)
  );
}

export function createAndroidAlarmReport(
  state: SleepScheduleState,
  status: WakeAlarmStatus,
  checkedAt: Date,
): AndroidAlarmReport | null {
  const scheduleKey = wakeAlarmScheduleKey(state, checkedAt);
  if (!status.supported || scheduleKey === null) return null;
  let outcome: AndroidAlarmOutcome = 'NOT_CONFIRMED';
  if (status.state === 'ERROR') outcome = 'ERROR';
  else if (
    state.settings?.enabled === false &&
    status.state === 'READY' &&
    status.acknowledgedSettingsVersion === state.settings.version &&
    status.nextOccurrenceId === null &&
    status.nextScheduledAt === null
  )
    outcome = 'DISABLED';
  else if (
    status.state === 'PERMISSION_REQUIRED' ||
    !status.exactAlarmGranted ||
    !status.notificationsGranted ||
    !status.fullScreenGranted
  )
    outcome = 'PERMISSION_REQUIRED';
  else if (isWakeScheduleAcknowledged(state, status, checkedAt)) outcome = 'CONFIRMED';
  return {
    source: 'ANDROID',
    checkedAt,
    scheduleKey,
    outcome,
    acknowledgedSettingsVersion: status.acknowledgedSettingsVersion,
    nextOccurrenceId: status.nextOccurrenceId,
    nextScheduledAt: status.nextScheduledAt,
  };
}

export function isCurrentAndroidAlarmReport(state: SleepScheduleState, now: Date): boolean {
  const report = state.androidAlarmReport;
  const schedule = buildWakeAlarmSchedule(state, now);
  if (
    !report ||
    report.source !== 'ANDROID' ||
    !Number.isFinite(report.checkedAt.getTime()) ||
    !schedule ||
    report.scheduleKey !== wakeAlarmScheduleKey(state, now)
  )
    return false;
  if (report.outcome === 'CONFIRMED')
    return schedule.enabled && matchesOccurrence(schedule, report);
  if (report.outcome === 'DISABLED')
    return (
      !schedule.enabled &&
      report.acknowledgedSettingsVersion === schedule.settingsVersion &&
      report.nextOccurrenceId === null &&
      report.nextScheduledAt === null
    );
  return true;
}
