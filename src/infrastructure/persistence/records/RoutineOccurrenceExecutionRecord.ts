export interface RoutineOccurrenceExecutionRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly routineBlockId: string;
  readonly occurrenceDate: string;
  readonly occurrenceKey: string;
  readonly actualStartedAt: string | null;
  readonly actualEndedAt: string | null;
  readonly status: string;
  readonly note: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}
