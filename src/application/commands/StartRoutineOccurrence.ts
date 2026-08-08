import { RoutineOccurrenceExecution } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import {
  getStartableEffectiveOccurrence,
  type RoutineExecutionCommandDependencies,
  type RoutineExecutionOccurrenceInput,
} from './routineExecutionCommandSupport';

export class StartRoutineOccurrence {
  public constructor(readonly dependencies: RoutineExecutionCommandDependencies) {}

  public async execute(
    input: RoutineExecutionOccurrenceInput,
  ): Promise<Result<RoutineOccurrenceExecution, DomainError>> {
    try {
      await getStartableEffectiveOccurrence(this.dependencies, input);
      const existing = await this.dependencies.executionRepository.findByOccurrence(
        input.routineBlockId,
        input.occurrenceDate,
      );
      if (existing !== null) return success(existing);

      const execution = RoutineOccurrenceExecution.start({
        id: this.dependencies.idGenerator.generate(),
        routineBlockId: input.routineBlockId,
        occurrenceDate: input.occurrenceDate,
        occurredAt: this.dependencies.clock.now(),
      });
      const saved = await this.dependencies.executionRepository.addIfNoRunning(execution);
      if (saved === 'saved') return success(execution);
      if (saved === 'occurrenceExists') {
        const concurrent = await this.dependencies.executionRepository.findByOccurrence(
          input.routineBlockId,
          input.occurrenceDate,
        );
        if (concurrent !== null) return success(concurrent);
      }
      return failure(
        new DomainError(
          'routine_execution.another_running',
          'Сначала завершите или прервите текущий блок распорядка.',
        ),
      );
    } catch (error: unknown) {
      if (error instanceof DomainError) return failure(error);
      throw error;
    }
  }
}
