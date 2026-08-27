import { WALK_STATUS, type EntityId, type Walk } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { WalkRepository } from '../ports/WalkRepository';

export interface ResumeWalkInput {
  readonly walkId: EntityId;
}

export class ResumeWalk {
  public constructor(
    readonly repository: WalkRepository,
    readonly clock: Clock,
  ) {}

  public async execute(input: ResumeWalkInput): Promise<Result<Walk, DomainError>> {
    try {
      const stored = await this.repository.findById(input.walkId);
      if (stored === null) {
        return failure(new DomainError('walk.not_found', 'Прогулка не найдена.'));
      }
      if (stored.status === WALK_STATUS.running) return success(stored);

      const resumed = stored.resume(this.clock.now());
      if (await this.repository.updateIfVersionMatches(resumed, stored.version)) {
        return success(resumed);
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
