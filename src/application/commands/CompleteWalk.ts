import { WALK_STATUS, type EntityId, type Walk, type WalkPhoto } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { WalkRepository } from '../ports/WalkRepository';

export interface CompleteWalkInput {
  readonly walkId: EntityId;
  readonly result?: string;
  readonly photo?: WalkPhoto;
}

export class CompleteWalk {
  public constructor(
    readonly repository: WalkRepository,
    readonly clock: Clock,
  ) {}

  public async execute(input: CompleteWalkInput): Promise<Result<Walk, DomainError>> {
    try {
      const stored = await this.repository.findById(input.walkId);
      if (stored === null) return walkNotFound();
      if (stored.status !== WALK_STATUS.running) return walkNotRunning('walk.cannot_complete');

      const completed = stored.complete({
        endedAt: this.clock.now(),
        ...(input.result === undefined ? {} : { result: input.result }),
        ...(input.photo === undefined ? {} : { photo: input.photo }),
      });
      if (await this.repository.updateIfVersionMatches(completed, stored.version)) {
        return success(completed);
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

function walkNotRunning(code: string): Result<never, DomainError> {
  return failure(new DomainError(code, 'Только идущую прогулку можно завершить.'));
}

function versionConflict(): Result<never, DomainError> {
  return failure(
    new DomainError(
      'walk.version_conflict',
      'Прогулка уже изменилась в другой вкладке. Обновите данные и повторите действие.',
    ),
  );
}
