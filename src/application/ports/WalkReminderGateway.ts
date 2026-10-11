export interface WalkReminderConfiguration {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly cityId: string;
  readonly timeZone: string;
  readonly enabled: boolean;
  readonly fromCityDate: string;
  readonly throughCityDate: string;
  readonly days: readonly {
    readonly cityDate: string;
    readonly sunsetAt: number | null;
    readonly walkStartAt: number | null;
  }[];
}
export type WalkReminderState =
  'scheduled' | 'disabled' | 'permission-required' | 'unsupported' | 'expired' | 'error';
export interface WalkReminderReceipt {
  readonly revision: number;
  readonly state: WalkReminderState;
  readonly nextTriggerAt: number | null;
  readonly throughCityDate: string | null;
  readonly checkedAt: number;
  readonly message: string | null;
}
export interface WalkReminderGateway {
  reconcile(config: WalkReminderConfiguration): Promise<WalkReminderReceipt>;
  status(): Promise<WalkReminderReceipt>;
  openSettings?(issue: 'EXACT_ALARM' | 'NOTIFICATIONS'): Promise<void>;
}
