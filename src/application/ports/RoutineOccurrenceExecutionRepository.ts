import type { DayDate, EntityId, RoutineOccurrenceExecution } from '../../domain';

export type StartRoutineExecutionResult = 'saved' | 'occurrenceExists' | 'runningExists';

export interface RoutineOccurrenceExecutionRepository {
  findByOccurrence(
    routineBlockId: EntityId,
    occurrenceDate: DayDate,
  ): Promise<RoutineOccurrenceExecution | null>;
  findRunning(): Promise<RoutineOccurrenceExecution | null>;
  findAll(): Promise<readonly RoutineOccurrenceExecution[]>;
  addIfNoRunning(execution: RoutineOccurrenceExecution): Promise<StartRoutineExecutionResult>;
  saveIfVersionMatches(
    execution: RoutineOccurrenceExecution,
    expectedVersion: number,
  ): Promise<boolean>;
}
