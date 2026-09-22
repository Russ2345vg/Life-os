import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  unavailableWakeAlarmStatus,
  type AlarmSound,
  type WakeAlarmGateway,
  type WakeAlarmPermissionIssue,
  type WakeAlarmSchedule,
  type WakeAlarmStatus,
  type WakeAlarmState,
} from '../../application/sleep/WakeAlarmGateway';

type InvokeFunction = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

interface NativeAlarmStatus {
  readonly supported: boolean;
  readonly state: WakeAlarmState;
  readonly exactAlarmGranted: boolean;
  readonly notificationsGranted: boolean;
  readonly fullScreenGranted: boolean;
  readonly issues: readonly WakeAlarmPermissionIssue[];
  readonly nextOccurrenceId: string | null;
  readonly nextScheduledAtEpochMillis: number | null;
  readonly acknowledgedSettingsVersion: number | null;
  readonly lastDeliveredAtEpochMillis: number | null;
  readonly message: string | null;
}

interface NativeAlarmSound {
  readonly uri: string | null;
  readonly title: string;
}

export class TauriAndroidWakeAlarmGateway implements WakeAlarmGateway {
  readonly #invoke: InvokeFunction;
  readonly #isSupported: () => boolean;

  public constructor(
    invokeFunction: InvokeFunction = (command, args) => invoke(command, args),
    isSupported: () => boolean = isAndroidTauriRuntime,
  ) {
    this.#invoke = invokeFunction;
    this.#isSupported = isSupported;
  }

  public async reconcile(schedule: WakeAlarmSchedule): Promise<WakeAlarmStatus> {
    if (!this.#isSupported()) return unavailableWakeAlarmStatus();
    return this.#callStatus('android_alarm_reconcile', {
      schedule: {
        enabled: schedule.enabled,
        settingsVersion: schedule.settingsVersion,
        wakeTime: schedule.wakeTime,
        timeZone: schedule.timeZone,
        soundUri: schedule.sound.uri,
        soundTitle: schedule.sound.title,
        nextOccurrence:
          schedule.nextOccurrence === null
            ? null
            : {
                id: schedule.nextOccurrence.id,
                cycleDate: schedule.nextOccurrence.cycleDate,
                scheduledAtEpochMillis: schedule.nextOccurrence.scheduledAt.getTime(),
              },
      },
    });
  }

  public async status(): Promise<WakeAlarmStatus> {
    if (!this.#isSupported()) return unavailableWakeAlarmStatus();
    return this.#callStatus('android_alarm_status');
  }

  public async listSounds(): Promise<readonly AlarmSound[]> {
    if (!this.#isSupported()) return [{ uri: null, title: 'Системный сигнал' }];
    try {
      const response = (await this.#invoke('android_alarm_list_sounds')) as {
        readonly sounds?: readonly NativeAlarmSound[];
      };
      const sounds = response.sounds ?? [];
      return sounds.length > 0 ? sounds : [{ uri: null, title: 'Системный сигнал' }];
    } catch {
      return [{ uri: null, title: 'Системный сигнал' }];
    }
  }

  public async scheduleTest(input: {
    readonly sound: AlarmSound;
    readonly delaySeconds: number;
  }): Promise<WakeAlarmStatus> {
    if (!this.#isSupported()) return unavailableWakeAlarmStatus();
    return this.#callStatus('android_alarm_schedule_test', {
      delaySeconds: input.delaySeconds,
      soundUri: input.sound.uri,
      soundTitle: input.sound.title,
    });
  }

  public async openSettings(issue: WakeAlarmPermissionIssue): Promise<void> {
    if (!this.#isSupported()) return;
    await this.#invoke('android_alarm_open_settings', { issue });
  }

  public async stop(): Promise<void> {
    if (!this.#isSupported()) return;
    await this.#invoke('android_alarm_stop');
  }

  async #callStatus(command: string, args?: Record<string, unknown>): Promise<WakeAlarmStatus> {
    try {
      return normalizeStatus((await this.#invoke(command, args)) as NativeAlarmStatus);
    } catch (reason: unknown) {
      return {
        supported: true,
        state: 'ERROR',
        exactAlarmGranted: false,
        notificationsGranted: false,
        fullScreenGranted: false,
        issues: [],
        nextOccurrenceId: null,
        nextScheduledAt: null,
        acknowledgedSettingsVersion: null,
        lastDeliveredAt: null,
        message: reason instanceof Error ? reason.message : 'Android не подтвердил будильник.',
      };
    }
  }
}

function normalizeStatus(status: NativeAlarmStatus): WakeAlarmStatus {
  return {
    supported: status.supported,
    state: status.state,
    exactAlarmGranted: status.exactAlarmGranted,
    notificationsGranted: status.notificationsGranted,
    fullScreenGranted: status.fullScreenGranted,
    issues: status.issues,
    nextOccurrenceId: status.nextOccurrenceId,
    nextScheduledAt: toDate(status.nextScheduledAtEpochMillis),
    acknowledgedSettingsVersion: status.acknowledgedSettingsVersion,
    lastDeliveredAt: toDate(status.lastDeliveredAtEpochMillis),
    message: status.message,
  };
}

function toDate(value: number | null): Date | null {
  return value === null ? null : new Date(value);
}

function isAndroidTauriRuntime(): boolean {
  return (
    isTauri() && typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent ?? '')
  );
}
