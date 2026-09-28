import type { SleepAlarmSound, SleepEvent, WakeResult } from '../../domain/sleep/SleepSchedule';

export type AlarmSound = SleepAlarmSound;

export type WakeAlarmPermissionIssue =
  'EXACT_ALARM' | 'NOTIFICATIONS' | 'FULL_SCREEN' | 'DND_POLICY';

export type QuietModeState =
  'UNAVAILABLE' | 'DISABLED' | 'READY' | 'ACTIVE' | 'OVERRIDDEN' | 'ERROR';

export type WakeAlarmState =
  'UNAVAILABLE' | 'PERMISSION_REQUIRED' | 'READY' | 'SCHEDULED' | 'RINGING' | 'ERROR';

export interface WakeAlarmStatus {
  readonly supported: boolean;
  readonly state: WakeAlarmState;
  readonly exactAlarmGranted: boolean;
  readonly notificationsGranted: boolean;
  readonly fullScreenGranted: boolean;
  readonly notificationPolicyAccessGranted: boolean;
  readonly issues: readonly WakeAlarmPermissionIssue[];
  readonly nextOccurrenceId: string | null;
  readonly nextScheduledAt: Date | null;
  readonly acknowledgedSettingsVersion: number | null;
  readonly lastDeliveredAt: Date | null;
  readonly quietModeState: QuietModeState;
  readonly nextReminderAt: Date | null;
  readonly sleepEvents: readonly SleepEvent[];
  readonly wakeResults: readonly WakeResult[];
  readonly message: string | null;
  readonly testEvidence?: {
    readonly scheduledAt: Date;
    readonly deliveredAt: Date | null;
    readonly confirmedAt: Date | null;
    readonly valid: boolean;
  } | null;
}

export interface WakeDismissalSetup {
  readonly supported: boolean;
  readonly qrConfigured: boolean;
  readonly emergencyPhraseConfigured: boolean;
  readonly qrSavedTo: string | null;
  readonly lastWaterCompletedAt: Date | null;
}

export interface WakeAlarmOccurrenceCommand {
  readonly id: string;
  readonly cycleDate: string;
  readonly scheduledAt: Date;
}

export interface WakeAlarmSchedule {
  readonly enabled: boolean;
  readonly settingsVersion: number;
  readonly bedtime: string;
  readonly wakeTime: string;
  readonly timeZone: string;
  readonly quietModeEnabled: boolean;
  readonly currentCycleDate: string;
  readonly repeatReminderSuppressed: boolean;
  readonly sound: AlarmSound;
  readonly nextOccurrence: WakeAlarmOccurrenceCommand | null;
}

export interface WakeAlarmGateway {
  reconcile(schedule: WakeAlarmSchedule): Promise<WakeAlarmStatus>;
  status(): Promise<WakeAlarmStatus>;
  listSounds(): Promise<readonly AlarmSound[]>;
  scheduleTest(input: {
    readonly sound: AlarmSound;
    readonly delaySeconds: number;
  }): Promise<WakeAlarmStatus>;
  openSettings(issue: WakeAlarmPermissionIssue): Promise<void>;
  stop(): Promise<void>;
  dismissalSetup(): Promise<WakeDismissalSetup>;
  regenerateDismissalQr(): Promise<WakeDismissalSetup>;
  exportDismissalQr(): Promise<void>;
  saveEmergencyPhrase(phrase: string): Promise<WakeDismissalSetup>;
}

export class UnsupportedWakeAlarmGateway implements WakeAlarmGateway {
  public async reconcile(): Promise<WakeAlarmStatus> {
    return unavailableWakeAlarmStatus();
  }

  public async status(): Promise<WakeAlarmStatus> {
    return unavailableWakeAlarmStatus();
  }

  public async listSounds(): Promise<readonly AlarmSound[]> {
    return [{ uri: null, title: 'Системный сигнал' }];
  }

  public async scheduleTest(): Promise<WakeAlarmStatus> {
    return unavailableWakeAlarmStatus();
  }

  public async openSettings(): Promise<void> {}

  public async stop(): Promise<void> {}

  public async dismissalSetup(): Promise<WakeDismissalSetup> {
    return unavailableWakeDismissalSetup();
  }

  public async regenerateDismissalQr(): Promise<WakeDismissalSetup> {
    return unavailableWakeDismissalSetup();
  }

  public async saveEmergencyPhrase(): Promise<WakeDismissalSetup> {
    return unavailableWakeDismissalSetup();
  }

  public async exportDismissalQr(): Promise<void> {
    throw new Error('Открыть QR можно в приложении LifeOS на Android.');
  }
}

export function unavailableWakeAlarmStatus(): WakeAlarmStatus {
  return {
    supported: false,
    state: 'UNAVAILABLE',
    exactAlarmGranted: false,
    notificationsGranted: false,
    fullScreenGranted: false,
    notificationPolicyAccessGranted: false,
    issues: [],
    nextOccurrenceId: null,
    nextScheduledAt: null,
    acknowledgedSettingsVersion: null,
    lastDeliveredAt: null,
    quietModeState: 'UNAVAILABLE',
    nextReminderAt: null,
    sleepEvents: [],
    wakeResults: [],
    message: 'Постановка подтверждается только приложением LifeOS на Android.',
  };
}

export function unavailableWakeDismissalSetup(): WakeDismissalSetup {
  return {
    supported: false,
    qrConfigured: false,
    emergencyPhraseConfigured: false,
    qrSavedTo: null,
    lastWaterCompletedAt: null,
  };
}
