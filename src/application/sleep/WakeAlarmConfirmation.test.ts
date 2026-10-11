import { describe, expect, it } from 'vitest';
import {
  createEmptySleepSchedule,
  ensureNightCycle,
  finishPreparation,
  rebuildWakeSchedule,
  updateSleepSettings,
} from '../../domain/sleep/SleepSchedule';
import { unavailableWakeAlarmStatus, type WakeAlarmStatus } from './WakeAlarmGateway';
import {
  buildWakeAlarmSchedule,
  createAndroidAlarmReport,
  isCurrentAndroidAlarmReport,
  isWakeScheduleAcknowledged,
  wakeAlarmScheduleKey,
} from './WakeAlarmConfirmation';

const now = new Date('2026-10-10T12:00:00Z');
function fixture() {
  return rebuildWakeSchedule(
    updateSleepSettings(
      createEmptySleepSchedule(),
      {
        bedtime: '22:30',
        wakeTime: '07:15',
        timeZone: 'Asia/Chita',
        enabled: true,
      },
      now,
    ),
    {
      cycleDates: ['2026-10-10', '2026-10-11'],
      now,
      nextId: (() => {
        let id = 0;
        return () => `wake-${++id}`;
      })(),
    },
  );
}
function acknowledged(): WakeAlarmStatus {
  const state = fixture();
  return {
    ...unavailableWakeAlarmStatus(),
    supported: true,
    state: 'SCHEDULED',
    exactAlarmGranted: true,
    notificationsGranted: true,
    fullScreenGranted: true,
    acknowledgedSettingsVersion: state.settings!.version,
    nextOccurrenceId: 'wake-1',
    nextScheduledAt: new Date('2026-10-10T22:15:00Z'),
  };
}

describe('Android alarm confirmation', () => {
  it('records an exact supported ack and recognizes it on another device', () => {
    const state = fixture();
    const report = createAndroidAlarmReport(state, acknowledged(), now)!;
    expect(report).toMatchObject({
      source: 'ANDROID',
      outcome: 'CONFIRMED',
      checkedAt: now,
      nextOccurrenceId: 'wake-1',
    });
    expect(isCurrentAndroidAlarmReport({ ...state, androidAlarmReport: report }, now)).toBe(true);
    expect(buildWakeAlarmSchedule(state, now)?.nextOccurrence?.scheduledAt).toEqual(
      report.nextScheduledAt,
    );
    expect(createAndroidAlarmReport(state, unavailableWakeAlarmStatus(), now)).toBeNull();
  });
  it.each([
    { exactAlarmGranted: false },
    { notificationsGranted: false },
    { fullScreenGranted: false },
    { acknowledgedSettingsVersion: 0 },
    { nextOccurrenceId: 'old' },
    { nextScheduledAt: new Date('2026-10-10T22:16:00Z') },
    { state: 'READY' as const },
  ])('does not confirm mismatched evidence %j', (patch) => {
    const state = fixture();
    const status = { ...acknowledged(), ...patch };
    expect(isWakeScheduleAcknowledged(state, status, now)).toBe(false);
    expect(createAndroidAlarmReport(state, status, now)?.outcome).not.toBe('CONFIRMED');
  });
  it('invalidates settings, preparation suppression, skip and the next occurrence', () => {
    const state = fixture();
    const report = createAndroidAlarmReport(state, acknowledged(), now)!;
    const reported = { ...state, androidAlarmReport: report };
    const patches = [
      { ...reported, settings: { ...state.settings!, alarmSound: { uri: 'new', title: 'Other' } } },
      { ...reported, settings: { ...state.settings!, quietModeEnabled: true } },
      {
        ...reported,
        settings: {
          ...state.settings!,
          wakeOverride: { cycleDate: '2026-10-10', wakeTime: '08:00' },
          updatedAt: new Date('2026-10-10T12:01:00Z'),
        },
      },
      {
        ...reported,
        wakeOccurrences: state.wakeOccurrences.map((item, index) =>
          index === 0 ? { ...item, status: 'SKIPPED' as const } : item,
        ),
      },
    ];
    for (const changed of patches) expect(isCurrentAndroidAlarmReport(changed, now)).toBe(false);
    const opened = ensureNightCycle(reported, {
      cycleId: 'night',
      cycleDate: '2026-10-10',
      createdAt: now,
    }).state;
    expect(isCurrentAndroidAlarmReport(opened, now)).toBe(true);
    expect(
      isCurrentAndroidAlarmReport(finishPreparation(opened, '2026-10-10', 'WITH_SKIPS', now), now),
    ).toBe(false);
    expect(isCurrentAndroidAlarmReport(reported, new Date('2026-10-11T12:00:00Z'))).toBe(false);
    expect(wakeAlarmScheduleKey(createEmptySleepSchedule(), now)).toBeNull();
  });
  it('requires an acknowledged cancellation for disabled success', () => {
    const original = fixture();
    const state = { ...original, settings: { ...original.settings!, enabled: false } };
    const status = {
      ...acknowledged(),
      state: 'READY' as const,
      nextOccurrenceId: null,
      nextScheduledAt: null,
    };
    expect(createAndroidAlarmReport(state, status, now)?.outcome).toBe('DISABLED');
    expect(
      createAndroidAlarmReport(state, { ...status, exactAlarmGranted: false }, now)?.outcome,
    ).toBe('DISABLED');
    expect(
      createAndroidAlarmReport(state, { ...status, acknowledgedSettingsVersion: 0 }, now)?.outcome,
    ).toBe('NOT_CONFIRMED');
    const report = createAndroidAlarmReport(state, status, now)!;
    expect(
      isCurrentAndroidAlarmReport(
        { ...state, androidAlarmReport: { ...report, nextOccurrenceId: 'unexpected' } },
        now,
      ),
    ).toBe(false);
  });
  it.each(['PERMISSION_REQUIRED', 'ERROR'] as const)(
    'keeps real failure %s separate from a confirmation',
    (alarmState) => {
      expect(
        createAndroidAlarmReport(
          fixture(),
          { ...acknowledged(), state: alarmState, message: 'private native text' },
          now,
        ),
      ).toMatchObject({ outcome: alarmState });
      expect(
        createAndroidAlarmReport(
          fixture(),
          { ...acknowledged(), state: alarmState, message: 'private native text' },
          now,
        ),
      ).not.toHaveProperty('message');
    },
  );
});
