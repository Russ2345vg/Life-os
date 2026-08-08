import type { DayDate, EntityId, RoutineOccurrenceOverride } from '../../domain';

export interface RoutineOccurrenceOverrideRepository {
  findByOccurrence(
    routineBlockId: EntityId,
    occurrenceDate: DayDate,
  ): Promise<RoutineOccurrenceOverride | null>;
  findAll(): Promise<readonly RoutineOccurrenceOverride[]>;
  saveIfVersionMatches(
    override: RoutineOccurrenceOverride,
    expectedVersion: number | null,
  ): Promise<boolean>;
  deleteIfVersionMatches(id: EntityId, expectedVersion: number): Promise<boolean>;
}
