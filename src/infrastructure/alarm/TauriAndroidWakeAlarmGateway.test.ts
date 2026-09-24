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
      notificationPolicyAccessGranted: true,
      issues: [],
      nextOccurrenceId: 'wake-1',
      nextScheduledAtEpochMillis: scheduledAt.getTime(),
      acknowledgedSettingsVersion: 4,
      lastDeliveredAtEpochMillis: null,
      quietModeState: 'ACTIVE',
      nextReminderAtEpochMillis: scheduledAt.getTime() - 60 * 60 * 1000,
      sleepEvents: [
        {
          id: 'REMINDER_60:2026-11-14',
          cycleDate: '2026-11-14',
          kind: 'REMINDER_60',
          occurredAtEpochMillis: scheduledAt.getTime() - 60 * 60 * 1000,
        },
      ],
      wakeResults: [],
      message: null,
    });
    const gateway = new TauriAndroidWakeAlarmGateway(invoke, () => true);

    const status = await gateway.reconcile({
      enabled: true,
      settingsVersion: 4,
      bedtime: '22:00',
      wakeTime: '07:00',
      timeZone: 'Asia/Chita',
      quietModeEnabled: true,
      currentCycleDate: '2026-11-14',
      repeatReminderSuppressed: false,
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
        bedtime: '22:00',
        wakeTime: '07:00',
        timeZone: 'Asia/Chita',
        quietModeEnabled: true,
        currentCycleDate: '2026-11-14',
        repeatReminderSuppressed: false,
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
    expect(status.quietModeState).toBe('ACTIVE');
    expect(status.sleepEvents[0]?.occurredAt.toISOString()).toBe('2026-11-14T22:00:00.000Z');
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

  it('configures the guarded dismissal flow only through native Android commands', async () => {
    const invoke = vi.fn().mockResolvedValue({
      supported: true,
      qrConfigured: true,
      emergencyPhraseConfigured: true,
      qrSavedTo: 'Downloads/LifeOS/lifeos-wake-qr.png',
      lastWaterCompletedAtEpochMillis: null,
    });
    const gateway = new TauriAndroidWakeAlarmGateway(invoke, () => true);

    await gateway.regenerateDismissalQr();
    await gateway.saveEmergencyPhrase('Моя длинная аварийная фраза');
    const setup = await gateway.dismissalSetup();

    expect(invoke).toHaveBeenNthCalledWith(1, 'android_alarm_regenerate_dismissal_qr');
    expect(invoke).toHaveBeenNthCalledWith(2, 'android_alarm_save_emergency_phrase', {
      phrase: 'Моя длинная аварийная фраза',
    });
    expect(invoke).toHaveBeenNthCalledWith(3, 'android_alarm_dismissal_status');
    expect(setup).toMatchObject({
      qrConfigured: true,
      emergencyPhraseConfigured: true,
      qrSavedTo: 'Downloads/LifeOS/lifeos-wake-qr.png',
    });
  });
});
