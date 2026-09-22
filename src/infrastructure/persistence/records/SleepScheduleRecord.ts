import type {
  PreparationSnapshotStatus,
  WakeOccurrenceStatus,
} from '../../../domain/sleep/SleepSchedule';

export interface SleepScheduleRecord {
  readonly schemaVersion: 1;
  readonly id: 'sleep-schedule';
  readonly version: number;
  readonly settings: SleepSettingsRecord | null;
  readonly preparationGroups?: readonly SleepPreparationGroupRecord[];
  readonly preparationItems?: readonly SleepPreparationItemRecord[];
  readonly nightCycles: readonly NightCycleRecord[];
  readonly wakeOccurrences: readonly WakeOccurrenceRecord[];
  readonly alarmExceptions: readonly AlarmExceptionRecord[];
}

export interface SleepPreparationGroupRecord {
  readonly id: string;
  readonly title: string;
  readonly position: number;
}

export interface SleepPreparationItemRecord {
  readonly id: string;
  readonly groupId: string;
  readonly title: string;
  readonly position: number;
  readonly kind: 'BASE' | 'CUSTOM';
  readonly enabled: boolean;
}

export interface SleepSettingsRecord {
  readonly bedtime: string;
  readonly wakeTime: string;
  readonly timeZone: string;
  readonly enabled: boolean;
  readonly alarmSound?: {
    readonly uri: string | null;
    readonly title: string;
  };
  readonly version: number;
  readonly updatedAt: string;
}

export interface NightCycleRecord {
  readonly id: string;
  readonly cycleDate: string;
  readonly plannedSleepAt: string;
  readonly plannedWakeAt: string;
  readonly preparationItems: readonly PreparationSnapshotItemRecord[];
  readonly preparationCompletionKind?: 'ALL_DONE' | 'WITH_SKIPS' | 'SKIPPED_TODAY' | null;
  readonly preparationCompletedAt?: string | null;
  readonly createdAt: string;
}

export interface PreparationSnapshotItemRecord {
  readonly id: string;
  readonly groupId: string;
  readonly groupTitle: string;
  readonly title: string;
  readonly position: number;
  readonly status: PreparationSnapshotStatus;
}

export interface WakeOccurrenceRecord {
  readonly id: string;
  readonly cycleDate: string;
  readonly scheduledAt: string;
  readonly status: WakeOccurrenceStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AlarmExceptionRecord {
  readonly id: string;
  readonly occurrenceId: string;
  readonly kind: 'SKIP_ONCE';
  readonly createdAt: string;
}
