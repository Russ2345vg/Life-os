import { type EntityId, type Walk, type WalkImpact, type WalkStateSnapshot } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { WalkRepository } from '../ports/WalkRepository';
import { resolveWalkReentryAction } from '../walk/WalkReentryPolicy';

export interface RecordWalkOutcomeInput {
  readonly walkId: EntityId;
  readonly afterState: WalkStateSnapshot;
  readonly impact: WalkImpact;
  readonly reflection?: string;
}

export class RecordWalkOutcome {
  public constructor(
    readonly repository: WalkRepository,
    readonly clock: Clock,
  ) {}

  public async execute(input: RecordWalkOutcomeInput): Promise<Result<Walk, DomainError>> {
    try {
      const stored = await this.repository.findById(input.walkId);
      if (stored === null) return walkNotFound();

      const reentryAction = resolveWalkReentryAction(stored, {
        impact: input.impact,
        ...(input.reflection === undefined ? {} : { reflection: input.reflection }),
      });
      const recorded = stored.recordOutcome({
        afterState: input.afterState,
        impact: input.impact,
        ...(input.reflection === undefined ? {} : { reflection: input.reflection }),
        reentryAction,
        updatedAt: this.clock.now(),
      });
      if (await this.repository.updateIfVersionMatches(recorded, stored.version)) {
        return success(recorded);
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
