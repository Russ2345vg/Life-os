import type { EntityId, Walk } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { WalkRepository } from '../ports/WalkRepository';

export interface AdvanceWalkReflectionStageInput {
  readonly walkId: EntityId;
}

export class AdvanceWalkReflectionStage {
  public constructor(
    readonly repository: WalkRepository,
    readonly clock: Clock,
  ) {}

  public async execute(input: AdvanceWalkReflectionStageInput): Promise<Result<Walk, DomainError>> {
    try {
      const stored = await this.repository.findById(input.walkId);
      if (stored === null) return walkNotFound();

      const advanced = stored.advanceReflectionStage(this.clock.now());
      if (await this.repository.updateIfVersionMatches(advanced, stored.version)) {
        return success(advanced);
      }
      return versionConflict();
    } catch (error: unknown) {
      if (error instanceof DomainError) return failure(error);
      throw error;
    }
  }
}

function walkNotFound(): Result<never, DomainError> {
  return failure(new DomainError('walk.not_found', 'Прогулка не найдена.'));
}

function versionConflict(): Result<never, DomainError> {
  return failure(
    new DomainError(
      'walk.version_conflict',
      'Прогулка уже изменилась в другой вкладке. Обновите данные и повторите действие.',
    ),
  );
}
