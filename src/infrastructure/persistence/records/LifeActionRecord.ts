export interface LifeActionRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly expectedResult: string | null;
  readonly actualResult: string | null;
  readonly status: 'draft' | 'ready' | 'in_progress' | 'completed' | 'cancelled';
  readonly decisionId: string | null;
  readonly plannedDate: string | null;
  readonly createdAt: string;
  readonly readyAt: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly cancelledAt: string | null;
  readonly cancelReason: string | null;
  readonly archivedAt: string | null;
  readonly rescheduleCount: number;
  readonly version: number;
}
