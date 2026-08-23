export interface MorningCycleRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly dayId: string;
  readonly dateKey: string;
  readonly startedAt: string | null;
  readonly waterCompletedAt: string | null;
  readonly waterAmountMl: number | null;
  readonly physicalStatus: string;
  readonly physicalUpdatedAt: string | null;
  readonly updatedAt: string;
  readonly version: number;
}
