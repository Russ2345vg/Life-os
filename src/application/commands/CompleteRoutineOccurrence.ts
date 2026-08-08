import { ROUTINE_EXECUTION_STATUS, type RoutineOccurrenceExecution } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import {
  executionVersionConflict,
  validateFinishFactDate,
  type RoutineExecutionCommandDependencies,
  type RoutineExecutionOccurrenceInput,
} from './routineExecutionCommandSupport';

export interface CompleteRoutineOccurrenceInput extends RoutineExecutionOccurrenceInput {
  readonly expectedVersion: number;
}

export class CompleteRoutineOccurrence {
  public constructor(readonly dependencies: RoutineExecutionCommandDependencies) {}

  public async execute(
    input: CompleteRoutineOccurrenceInput,
  ): Promise<Result<RoutineOccurrenceExecution, DomainError>> {
    try {
      const current = await this.dependencies.executionRepository.findByOccurrence(
        input.routineBlockId,
        input.occurrenceDate,
      );
      if (current === null) {
        return failure(
          new DomainError(
            'routine_execution.not_found',
            'Фактическое выполнение блока не найдено.',
          ),
        );
      }
      await validateFinishFactDate(this.dependencies, input, current);
      if (current.version !== input.expectedVersion) return failure(executionVersionConflict());
      if (current.status === ROUTINE_EXECUTION_STATUS.completed) return success(current);
      const completed = current.complete(this.dependencies.clock.now());
      const saved = await this.dependencies.executionRepository.saveIfVersionMatches(
        completed,
        current.version,
      );
      return saved ? success(completed) : failure(executionVersionConflict());
    } catch (error: unknown) {
      if (error instanceof DomainError) return failure(error);
      throw error;
    }
  }
}
