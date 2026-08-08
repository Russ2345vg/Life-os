import type { RoutineOccurrenceExecution } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import {
  executionVersionConflict,
  validateFinishFactDate,
  type RoutineExecutionCommandDependencies,
  type RoutineExecutionOccurrenceInput,
} from './routineExecutionCommandSupport';

export interface AbandonRoutineOccurrenceInput extends RoutineExecutionOccurrenceInput {
  readonly expectedVersion: number;
}

export class AbandonRoutineOccurrence {
  public constructor(readonly dependencies: RoutineExecutionCommandDependencies) {}

  public async execute(
    input: AbandonRoutineOccurrenceInput,
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
      const abandoned = current.abandon(this.dependencies.clock.now());
      const saved = await this.dependencies.executionRepository.saveIfVersionMatches(
        abandoned,
        current.version,
      );
      return saved ? success(abandoned) : failure(executionVersionConflict());
    } catch (error: unknown) {
      if (error instanceof DomainError) return failure(error);
      throw error;
    }
  }
}
