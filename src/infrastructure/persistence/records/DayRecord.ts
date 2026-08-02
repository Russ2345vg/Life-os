export interface DayRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly date: string;
  readonly status: 'planned' | 'open' | 'completed';
  readonly createdAt: string;
  readonly plannedAt: string | null;
  readonly openedAt: string | null;
  readonly firstActivityAt: string | null;
  readonly completedAt: string | null;
  readonly summary: string | null;
  readonly version: number;
}
