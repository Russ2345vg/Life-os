export interface RoutineBlockRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly anchorDate: string;
  readonly title: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly category: string;
  readonly recurrence: string;
  readonly selectedWeekdays: readonly number[];
  readonly required: boolean;
  readonly assignment?: string;
  readonly actionId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}
