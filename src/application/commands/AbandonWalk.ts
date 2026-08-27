import { WALK_STATUS, type EntityId, type Walk } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { WalkRepository } from '../ports/WalkRepository';
import { finishRoutineWalk, type RoutineWalkFinishDependencies } from './routineWalkFinishSupport';

export interface AbandonWalkInput {
  readonly walkId: EntityId;
}

export class AbandonWalk {
  public constructor(
    readonly repository: WalkRepository,
    readonly clock: Clock,
    readonly routine?: RoutineWalkFinishDependencies,
  ) {}

  public async execute(input: AbandonWalkInput): Promise<Result<Walk, DomainError>> {
    try {
      const stored = await this.repository.findById(input.walkId);
      if (stored === null) {
        return failure(new DomainError('walk.not_found', 'Прогулка не найдена.'));
      }
      const routineContext = stored.returnContext?.routineContext ?? null;
      if (routineContext !== null) {
        if (this.routine === undefined) return transactionDependencyMissing();
        if (stored.status === WALK_STATUS.completed) return routineTerminalConflict();
        if (
          stored.status !== WALK_STATUS.running &&
          stored.status !== WALK_STATUS.paused &&
          stored.status !== WALK_STATUS.abandoned
        ) {
          return failure(
            new DomainError('walk.cannot_abandon', 'Только активную прогулку можно прервать.'),
          );
        }
        const occurredAt = this.clock.now();
        const abandoned =
          stored.status === WALK_STATUS.abandoned ? stored : stored.abandon(occurredAt);
        await finishRoutineWalk({
          storedWalk: stored,
          finishedWalk: abandoned,
          terminalStatus: WALK_STATUS.abandoned,
          dependencies: this.routine,
          occurredAt,
        });
        return success(abandoned);
      }
      if (stored.status !== WALK_STATUS.running && stored.status !== WALK_STATUS.paused) {
        return failure(
          new DomainError('walk.cannot_abandon', 'Только активную прогулку можно прервать.'),
        );
      }
      const abandoned = stored.abandon(this.clock.now());
      if (await this.repository.updateIfVersionMatches(abandoned, stored.version)) {
        return success(abandoned);
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

function transactionDependencyMissing(): Result<never, DomainError> {
  return failure(
    new DomainError(
      'persistence.transaction_failed',
      'Не удалось атомарно сохранить прерывание прогулки. Повторите попытку.',
    ),
  );
}

function routineTerminalConflict(): Result<never, DomainError> {
  return failure(
    new DomainError(
      'routine_walk.terminal_conflict',
      'Прогулка и блок распорядка уже завершены несовместимыми способами.',
    ),
  );
}
