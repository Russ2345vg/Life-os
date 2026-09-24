import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  unavailableWakeAlarmStatus,
  unavailableWakeDismissalSetup,
  type AlarmSound,
  type WakeAlarmGateway,
  type WakeAlarmPermissionIssue,
  type WakeAlarmSchedule,
  type WakeAlarmStatus,
  type WakeAlarmState,
  type WakeDismissalSetup,
  type QuietModeState,
} from '../../application/sleep/WakeAlarmGateway';
import type { SleepEventKind, WakeResultKind } from '../../domain/sleep/SleepSchedule';

type InvokeFunction = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

interface NativeAlarmStatus {
  readonly supported: boolean;
  readonly state: WakeAlarmState;
  readonly exactAlarmGranted: boolean;
  readonly notificationsGranted: boolean;
  readonly fullScreenGranted: boolean;
  readonly notificationPolicyAccessGranted: boolean;
  readonly issues: readonly WakeAlarmPermissionIssue[];
  readonly nextOccurrenceId: string | null;
  readonly nextScheduledAtEpochMillis: number | null;
  readonly acknowledgedSettingsVersion: number | null;
  readonly lastDeliveredAtEpochMillis: number | null;
  readonly quietModeState: QuietModeState;
  readonly nextReminderAtEpochMillis: number | null;
  readonly sleepEvents: readonly NativeSleepEvent[];
  readonly wakeResults: readonly NativeWakeResult[];
  readonly message: string | null;
}

interface NativeSleepEvent {
  readonly id: string;
  readonly cycleDate: string;
  readonly kind: SleepEventKind;
  readonly occurredAtEpochMillis: number;
}

interface NativeWakeResult {
  readonly id: string;
  readonly occurrenceId: string;
  readonly cycleDate: string;
  readonly kind: WakeResultKind;
  readonly recordedAtEpochMillis: number;
  readonly emergencyReason: string | null;
  readonly emergencyComment: string | null;
  readonly waterCompletedAtEpochMillis: number | null;
}

interface NativeAlarmSound {
  readonly uri: string | null;
  readonly title: string;
}

interface NativeWakeDismissalSetup {
  readonly supported: boolean;
  readonly qrConfigured: boolean;
  readonly emergencyPhraseConfigured: boolean;
  readonly qrSavedTo: string | null;
  readonly lastWaterCompletedAtEpochMillis: number | null;
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
        bedtime: schedule.bedtime,
        wakeTime: schedule.wakeTime,
        timeZone: schedule.timeZone,
        quietModeEnabled: schedule.quietModeEnabled,
        currentCycleDate: schedule.currentCycleDate,
        repeatReminderSuppressed: schedule.repeatReminderSuppressed,
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

  public async dismissalSetup(): Promise<WakeDismissalSetup> {
    if (!this.#isSupported()) return unavailableWakeDismissalSetup();
    return normalizeDismissalSetup(
      (await this.#invoke('android_alarm_dismissal_status')) as NativeWakeDismissalSetup,
    );
  }

  public async regenerateDismissalQr(): Promise<WakeDismissalSetup> {
    if (!this.#isSupported()) return unavailableWakeDismissalSetup();
    return normalizeDismissalSetup(
      (await this.#invoke('android_alarm_regenerate_dismissal_qr')) as NativeWakeDismissalSetup,
    );
  }

  public async saveEmergencyPhrase(phrase: string): Promise<WakeDismissalSetup> {
    if (!this.#isSupported()) return unavailableWakeDismissalSetup();
    return normalizeDismissalSetup(
      (await this.#invoke('android_alarm_save_emergency_phrase', {
        phrase,
      })) as NativeWakeDismissalSetup,
    );
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
        notificationPolicyAccessGranted: false,
        issues: [],
        nextOccurrenceId: null,
        nextScheduledAt: null,
        acknowledgedSettingsVersion: null,
        lastDeliveredAt: null,
        quietModeState: 'ERROR',
        nextReminderAt: null,
        sleepEvents: [],
        wakeResults: [],
        message: reason instanceof Error ? reason.message : 'Android не подтвердил будильник.',
      };
    }
  }
}

function normalizeDismissalSetup(setup: NativeWakeDismissalSetup): WakeDismissalSetup {
  return {
    supported: setup.supported,
    qrConfigured: setup.qrConfigured,
    emergencyPhraseConfigured: setup.emergencyPhraseConfigured,
    qrSavedTo: setup.qrSavedTo,
    lastWaterCompletedAt:
      setup.lastWaterCompletedAtEpochMillis === null
        ? null
        : new Date(setup.lastWaterCompletedAtEpochMillis),
  };
}

function normalizeStatus(status: NativeAlarmStatus): WakeAlarmStatus {
  return {
    supported: status.supported,
    state: status.state,
    exactAlarmGranted: status.exactAlarmGranted,
    notificationsGranted: status.notificationsGranted,
    fullScreenGranted: status.fullScreenGranted,
    notificationPolicyAccessGranted: status.notificationPolicyAccessGranted,
    issues: status.issues,
    nextOccurrenceId: status.nextOccurrenceId,
    nextScheduledAt: toDate(status.nextScheduledAtEpochMillis),
    acknowledgedSettingsVersion: status.acknowledgedSettingsVersion,
    lastDeliveredAt: toDate(status.lastDeliveredAtEpochMillis),
    quietModeState: status.quietModeState,
    nextReminderAt: toDate(status.nextReminderAtEpochMillis),
    sleepEvents: status.sleepEvents.map((event) => ({
      id: event.id,
      cycleDate: event.cycleDate,
      kind: event.kind,
      occurredAt: new Date(event.occurredAtEpochMillis),
    })),
    wakeResults: status.wakeResults.map((result) => ({
      id: result.id,
      occurrenceId: result.occurrenceId,
      cycleDate: result.cycleDate,
      kind: result.kind,
      recordedAt: new Date(result.recordedAtEpochMillis),
      emergencyReason: result.emergencyReason,
      emergencyComment: result.emergencyComment,
      waterCompletedAt: toDate(result.waterCompletedAtEpochMillis),
    })),
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
