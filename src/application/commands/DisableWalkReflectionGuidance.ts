import type { EntityId, Walk } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { WalkRepository } from '../ports/WalkRepository';

export interface DisableWalkReflectionGuidanceInput {
  readonly walkId: EntityId;
}

export class DisableWalkReflectionGuidance {
  public constructor(
    readonly repository: WalkRepository,
    readonly clock: Clock,
  ) {}

  public async execute(
    input: DisableWalkReflectionGuidanceInput,
  ): Promise<Result<Walk, DomainError>> {
    try {
      const stored = await this.repository.findById(input.walkId);
      if (stored === null) return walkNotFound();

      const disabled = stored.disableReflectionGuidance(this.clock.now());
      if (disabled === stored) return success(stored);
      if (await this.repository.updateIfVersionMatches(disabled, stored.version)) {
        return success(disabled);
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
