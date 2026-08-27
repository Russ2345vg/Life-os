import { WALK_STATUS, type EntityId, type Walk } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { WalkRepository } from '../ports/WalkRepository';

export interface PauseWalkInput {
  readonly walkId: EntityId;
}

export class PauseWalk {
  public constructor(
    readonly repository: WalkRepository,
    readonly clock: Clock,
  ) {}

  public async execute(input: PauseWalkInput): Promise<Result<Walk, DomainError>> {
    try {
      const stored = await this.repository.findById(input.walkId);
      if (stored === null) {
        return failure(new DomainError('walk.not_found', 'Прогулка не найдена.'));
      }
      if (stored.status === WALK_STATUS.paused) return success(stored);

      const paused = stored.pause(this.clock.now());
      if (await this.repository.updateIfVersionMatches(paused, stored.version)) {
        return success(paused);
      }
      return failure(
        new DomainError(
          'walk.version_conflict',
          'Прогулка уже изменилась в другой вкладке. Обновите данные и повторите действие.',
        ),
      );
    } catch (error: unknown) {
      if (error instanceof DomainError) return failure(error);
      throw error;
    }
  }
}
