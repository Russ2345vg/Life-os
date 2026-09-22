import { describe, expect, it, vi } from 'vitest';
import { TauriAndroidWakeAlarmGateway } from './TauriAndroidWakeAlarmGateway';

describe('TauriAndroidWakeAlarmGateway', () => {
  it('serializes the concrete occurrence and normalizes the acknowledged Android status', async () => {
    const scheduledAt = new Date('2026-11-14T23:00:00.000Z');
    const invoke = vi.fn().mockResolvedValue({
      supported: true,
      state: 'SCHEDULED',
      exactAlarmGranted: true,
      notificationsGranted: true,
      fullScreenGranted: true,
      issues: [],
      nextOccurrenceId: 'wake-1',
      nextScheduledAtEpochMillis: scheduledAt.getTime(),
      acknowledgedSettingsVersion: 4,
      lastDeliveredAtEpochMillis: null,
      message: null,
    });
    const gateway = new TauriAndroidWakeAlarmGateway(invoke, () => true);

    const status = await gateway.reconcile({
      enabled: true,
      settingsVersion: 4,
      wakeTime: '07:00',
      timeZone: 'Asia/Chita',
      sound: { uri: 'content://alarm/2', title: 'Morning' },
      nextOccurrence: {
        id: 'wake-1',
        cycleDate: '2026-11-14',
        scheduledAt,
      },
    });

    expect(invoke).toHaveBeenCalledWith('android_alarm_reconcile', {
      schedule: {
        enabled: true,
        settingsVersion: 4,
        wakeTime: '07:00',
        timeZone: 'Asia/Chita',
        soundUri: 'content://alarm/2',
        soundTitle: 'Morning',
        nextOccurrence: {
          id: 'wake-1',
          cycleDate: '2026-11-14',
          scheduledAtEpochMillis: scheduledAt.getTime(),
        },
      },
    });
    expect(status.nextScheduledAt?.toISOString()).toBe('2026-11-14T23:00:00.000Z');
    expect(status.acknowledgedSettingsVersion).toBe(4);
  });

  it('keeps desktop unconfirmed and never invokes Android commands', async () => {
    const invoke = vi.fn();
    const gateway = new TauriAndroidWakeAlarmGateway(invoke, () => false);

    const status = await gateway.status();

    expect(status).toMatchObject({ supported: false, state: 'UNAVAILABLE' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('converts a native command failure into an explicit error status', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('native unavailable'));
    const gateway = new TauriAndroidWakeAlarmGateway(invoke, () => true);

    const status = await gateway.status();

    expect(status).toMatchObject({
      supported: true,
      state: 'ERROR',
      message: 'native unavailable',
    });
  });
});
