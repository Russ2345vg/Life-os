import type { DayDate, EntityId, RoutineOccurrenceExecution } from '../../domain';
import type { RoutineOccurrenceExecutionRepository } from '../ports/RoutineOccurrenceExecutionRepository';

export class GetRoutineExecutionForOccurrence {
  public constructor(readonly repository: RoutineOccurrenceExecutionRepository) {}

  public execute(
    routineBlockId: EntityId,
    occurrenceDate: DayDate,
  ): Promise<RoutineOccurrenceExecution | null> {
    return this.repository.findByOccurrence(routineBlockId, occurrenceDate);
  }
}
