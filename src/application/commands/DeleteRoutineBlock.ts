import type { EntityId } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { RoutineBlockRepository } from '../ports/RoutineBlockRepository';
import type { RoutineOccurrenceExecutionRepository } from '../ports/RoutineOccurrenceExecutionRepository';
import {
  routineBlockNotFound,
  routineBlockVersionConflict,
  validExpectedVersion,
} from './routineBlockCommandSupport';

export interface DeleteRoutineBlockInput {
  readonly id: EntityId;
  readonly expectedVersion: number;
}

export class DeleteRoutineBlock {
  public constructor(
    readonly repository: RoutineBlockRepository,
    readonly executionRepository?: RoutineOccurrenceExecutionRepository,
  ) {}

  public async execute(input: DeleteRoutineBlockInput): Promise<Result<void, DomainError>> {
    if (!validExpectedVersion(input.expectedVersion)) {
      return failure(
        new DomainError('routine_block.invalid_expected_version', 'Версия блока указана неверно.'),
      );
    }
    const stored = await this.repository.findById(input.id);
    if (stored === null) return routineBlockNotFound();
    if (stored.version !== input.expectedVersion) return routineBlockVersionConflict();
    if (
      this.executionRepository !== undefined &&
      (await this.executionRepository.findAll()).some((execution) =>
        execution.routineBlockId.equals(input.id),
      )
    ) {
      return failure(
        new DomainError(
          'routine_block.execution_history_exists',
          'Блок с историей фактического выполнения нельзя удалить.',
        ),
      );
    }
    const deleted = await this.repository.deleteIfVersionMatches(input.id, input.expectedVersion);
    return deleted ? success(undefined) : routineBlockVersionConflict();
  }
}
