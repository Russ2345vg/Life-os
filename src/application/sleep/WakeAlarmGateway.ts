import type { SleepAlarmSound } from '../../domain/sleep/SleepSchedule';

export type AlarmSound = SleepAlarmSound;

export type WakeAlarmPermissionIssue = 'EXACT_ALARM' | 'NOTIFICATIONS' | 'FULL_SCREEN';

export type WakeAlarmState =
  'UNAVAILABLE' | 'PERMISSION_REQUIRED' | 'READY' | 'SCHEDULED' | 'RINGING' | 'ERROR';

export interface WakeAlarmStatus {
  readonly supported: boolean;
  readonly state: WakeAlarmState;
  readonly exactAlarmGranted: boolean;
  readonly notificationsGranted: boolean;
  readonly fullScreenGranted: boolean;
  readonly issues: readonly WakeAlarmPermissionIssue[];
  readonly nextOccurrenceId: string | null;
  readonly nextScheduledAt: Date | null;
  readonly acknowledgedSettingsVersion: number | null;
  readonly lastDeliveredAt: Date | null;
  readonly message: string | null;
}

export interface WakeAlarmOccurrenceCommand {
  readonly id: string;
  readonly cycleDate: string;
  readonly scheduledAt: Date;
}

export interface WakeAlarmSchedule {
  readonly enabled: boolean;
  readonly settingsVersion: number;
  readonly wakeTime: string;
  readonly timeZone: string;
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
}

export function unavailableWakeAlarmStatus(): WakeAlarmStatus {
  return {
    supported: false,
    state: 'UNAVAILABLE',
    exactAlarmGranted: false,
    notificationsGranted: false,
    fullScreenGranted: false,
    issues: [],
    nextOccurrenceId: null,
    nextScheduledAt: null,
    acknowledgedSettingsVersion: null,
    lastDeliveredAt: null,
    message: 'Постановка подтверждается только приложением LifeOS на Android.',
  };
}
