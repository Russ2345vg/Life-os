export interface RoutineOccurrenceOverrideRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly routineBlockId: string;
  readonly occurrenceDate: string;
  readonly occurrenceKey: string;
  readonly type: string;
  readonly startTimeOverride: string | null;
  readonly endTimeOverride: string | null;
  readonly targetDate: string | null;
  readonly targetStartTime: string | null;
  readonly replacementActionId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}
