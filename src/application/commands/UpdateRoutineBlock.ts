import type { EntityId, RoutineBlock } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { RoutineBlockRepository } from '../ports/RoutineBlockRepository';
import type { RoutineOccurrenceExecutionRepository } from '../ports/RoutineOccurrenceExecutionRepository';
import {
  routineBlockDetails,
  routineBlockFailure,
  routineBlockNotFound,
  routineBlockVersionConflict,
  validExpectedVersion,
  type RoutineBlockDetailsInput,
} from './routineBlockCommandSupport';

export interface UpdateRoutineBlockInput extends RoutineBlockDetailsInput {
  readonly id: EntityId;
  readonly expectedVersion: number;
}

export class UpdateRoutineBlock {
  public constructor(
    readonly repository: RoutineBlockRepository,
    readonly clock: Clock,
    readonly executionRepository?: RoutineOccurrenceExecutionRepository,
  ) {}

  public async execute(input: UpdateRoutineBlockInput): Promise<Result<RoutineBlock, DomainError>> {
    if (!validExpectedVersion(input.expectedVersion)) {
      return failure(
        new DomainError('routine_block.invalid_expected_version', 'Версия блока указана неверно.'),
      );
    }

    const stored = await this.repository.findById(input.id);
    if (stored === null) return routineBlockNotFound();
    if (stored.version !== input.expectedVersion) return routineBlockVersionConflict();
    if (await hasHistoricalExecution(this.executionRepository, input.id)) {
      return failure(
        new DomainError(
          'routine_block.execution_history_exists',
          'Блок с историей фактического выполнения нельзя изменить.',
        ),
      );
    }

    try {
      const updated = stored.update(routineBlockDetails(input), this.clock.now());
      const saved = await this.repository.saveIfVersionMatches(updated, input.expectedVersion);
      return saved ? success(updated) : routineBlockVersionConflict();
    } catch (error: unknown) {
      return routineBlockFailure(error);
    }
  }
}

async function hasHistoricalExecution(
  repository: RoutineOccurrenceExecutionRepository | undefined,
  routineBlockId: EntityId,
): Promise<boolean> {
  return (
    repository !== undefined &&
    (await repository.findAll()).some((execution) =>
      execution.routineBlockId.equals(routineBlockId),
    )
  );
}
