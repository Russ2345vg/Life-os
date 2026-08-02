export interface DecisionRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly title: string;
  readonly reason: string | null;
  readonly expectedResult: string | null;
  readonly actualResultSummary: string | null;
  readonly status: 'draft' | 'planned' | 'in_progress' | 'confirmed' | 'cancelled';
  readonly kind: 'main' | 'additional';
  readonly plannedDate: string | null;
  readonly order: number | null;
  readonly createdAt: string;
  readonly plannedAt: string | null;
  readonly startedAt: string | null;
  readonly confirmedAt: string | null;
  readonly cancelledAt: string | null;
  readonly cancelReason: string | null;
  readonly archivedAt: string | null;
  readonly evidenceIds: readonly string[];
  readonly rescheduleCount: number;
  readonly version: number;
}
