import { WALK_STATUS, type EntityId, type Walk, type WalkPhoto } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { WalkRepository } from '../ports/WalkRepository';
import { finishRoutineWalk, type RoutineWalkFinishDependencies } from './routineWalkFinishSupport';

export interface CompleteWalkInput {
  readonly walkId: EntityId;
  readonly result?: string;
  readonly photo?: WalkPhoto;
}

export class CompleteWalk {
  public constructor(
    readonly repository: WalkRepository,
    readonly clock: Clock,
    readonly routine?: RoutineWalkFinishDependencies,
  ) {}

  public async execute(input: CompleteWalkInput): Promise<Result<Walk, DomainError>> {
    try {
      const stored = await this.repository.findById(input.walkId);
      if (stored === null) return walkNotFound();
      const routineContext = stored.returnContext?.routineContext ?? null;
      if (routineContext !== null) {
        if (this.routine === undefined) return transactionDependencyMissing();
        if (stored.status === WALK_STATUS.abandoned) return routineTerminalConflict();
        if (
          stored.status !== WALK_STATUS.running &&
          stored.status !== WALK_STATUS.paused &&
          stored.status !== WALK_STATUS.completed
        ) {
          return walkNotRunning('walk.cannot_complete');
        }
        const occurredAt = this.clock.now();
        const completed =
          stored.status === WALK_STATUS.completed
            ? stored
            : stored.complete({
                endedAt: occurredAt,
                ...(input.result === undefined ? {} : { result: input.result }),
                ...(input.photo === undefined ? {} : { photo: input.photo }),
              });
        await finishRoutineWalk({
          storedWalk: stored,
          finishedWalk: completed,
          terminalStatus: WALK_STATUS.completed,
          dependencies: this.routine,
          occurredAt,
        });
        return success(completed);
      }
      if (stored.status !== WALK_STATUS.running && stored.status !== WALK_STATUS.paused) {
        return walkNotRunning('walk.cannot_complete');
      }

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

function transactionDependencyMissing(): Result<never, DomainError> {
  return failure(
    new DomainError(
      'persistence.transaction_failed',
      'Не удалось атомарно сохранить завершение прогулки. Повторите попытку.',
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

function walkNotFound(): Result<never, DomainError> {
  return failure(new DomainError('walk.not_found', 'Прогулка не найдена.'));
}

function walkNotRunning(code: string): Result<never, DomainError> {
  return failure(new DomainError(code, 'Только активную прогулку можно завершить.'));
}

function versionConflict(): Result<never, DomainError> {
  return failure(
    new DomainError(
      'walk.version_conflict',
      'Прогулка уже изменилась в другой вкладке. Обновите данные и повторите действие.',
    ),
  );
}
