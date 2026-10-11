export type AndroidAlarmOutcome =
  'CONFIRMED' | 'DISABLED' | 'PERMISSION_REQUIRED' | 'ERROR' | 'NOT_CONFIRMED';

/** Last response from Android, not a promise of future delivery or current connectivity. */
export interface AndroidAlarmReport {
  readonly source: 'ANDROID';
  readonly checkedAt: Date;
  readonly scheduleKey: string;
  readonly outcome: AndroidAlarmOutcome;
  readonly acknowledgedSettingsVersion: number | null;
  readonly nextOccurrenceId: string | null;
  readonly nextScheduledAt: Date | null;
}
