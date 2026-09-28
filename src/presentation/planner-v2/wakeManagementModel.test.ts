import { describe, expect, it } from 'vitest';
import {
  createEmptySleepSchedule,
  rebuildWakeSchedule,
  updateSleepSettings,
} from '../../domain/sleep/SleepSchedule';
import { unavailableWakeAlarmStatus } from '../../application/sleep/WakeAlarmGateway';
import { isWakeScheduleAcknowledged, wakeProbeLabel } from './wakeManagementModel';

describe('wake management evidence', () => {
  it('requires the native occurrence and version to match the future saved schedule', () => {
    const now = new Date('2026-09-28T10:00:00Z');
    const state = rebuildWakeSchedule(
      updateSleepSettings(
        createEmptySleepSchedule(),
        { bedtime: '22:30', wakeTime: '07:15', timeZone: 'Asia/Chita', enabled: true },
        now,
      ),
      { cycleDates: ['2026-09-28'], now, nextId: () => 'wake-1' },
    );
    const status = {
      ...unavailableWakeAlarmStatus(),
      supported: true,
      state: 'SCHEDULED' as const,
      exactAlarmGranted: true,
      notificationsGranted: true,
      fullScreenGranted: true,
      acknowledgedSettingsVersion: 1,
      nextOccurrenceId: 'wake-1',
      nextScheduledAt: new Date('2026-09-28T22:15:00Z'),
    };
    expect(isWakeScheduleAcknowledged(state, status, now)).toBe(true);
    expect(isWakeScheduleAcknowledged(state, { ...status, nextOccurrenceId: 'stale' }, now)).toBe(
      false,
    );
    expect(
      isWakeScheduleAcknowledged(state, { ...status, acknowledgedSettingsVersion: 0 }, now),
    ).toBe(false);
    expect(isWakeScheduleAcknowledged(state, { ...status, notificationsGranted: false }, now)).toBe(
      false,
    );
  });
  it('never treats a scheduled probe or receipt alone as a heard signal', () => {
    const test = {
      scheduledAt: new Date('2026-09-28T10:00:20Z'),
      deliveredAt: null,
      confirmedAt: null,
      valid: true,
    };
    const status = { ...unavailableWakeAlarmStatus(), supported: true, testEvidence: test };
    const now = new Date('2026-09-28T10:00:00Z');
    expect(wakeProbeLabel(status, now)).toBe('Тест назначен — заблокируйте экран');
    expect(
      wakeProbeLabel(
        { ...status, testEvidence: { ...test, deliveredAt: new Date('2026-09-28T10:00:20Z') } },
        now,
      ),
    ).toBe('Доставлен — слышимость не подтверждена');
    const confirmed = {
      ...test,
      deliveredAt: new Date('2026-09-28T10:00:20Z'),
      confirmedAt: new Date('2026-09-28T10:00:25Z'),
    };
    expect(wakeProbeLabel({ ...status, testEvidence: confirmed }, now)).toBe(
      'Вы подтвердили звук на этом телефоне',
    );
    expect(wakeProbeLabel({ ...status, testEvidence: { ...confirmed, valid: false } }, now)).toBe(
      'Настройки изменились — повторите тест',
    );
    expect(wakeProbeLabel(unavailableWakeAlarmStatus(), now)).toContain('Android');
  });
});
