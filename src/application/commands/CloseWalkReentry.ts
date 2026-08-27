import type { Walk } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { WalkRepository } from '../ports/WalkRepository';
import type { WalkReentryCommandInput } from './CompleteWalkReentry';

export class CloseWalkReentry {
  public constructor(
    readonly repository: WalkRepository,
    readonly clock: Clock,
  ) {}

  public async execute(input: WalkReentryCommandInput): Promise<Result<Walk, DomainError>> {
    try {
      const stored = await this.repository.findById(input.walkId);
      if (stored === null) return walkNotFound();

      const closed = stored.closeReentry(this.clock.now());
      if (await this.repository.updateIfVersionMatches(closed, stored.version)) {
        return success(closed);
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
