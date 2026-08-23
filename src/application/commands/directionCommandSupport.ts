import type { Direction, EntityId } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Failure, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { DirectionRepository } from '../ports/DirectionRepository';

export interface DirectionCommandInput {
  readonly id: EntityId;
  readonly expectedVersion: number;
}

export function directionFailure(error: unknown): Failure<DomainError> {
  if (error instanceof DomainError) return failure(error);
  throw error;
}

export async function changeDirection(
  repository: DirectionRepository,
  clock: Clock,
  input: DirectionCommandInput,
  change: (direction: Direction, now: Date) => Direction,
): Promise<Result<Direction, DomainError>> {
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    return failure(
      new DomainError('direction.invalid_expected_version', 'Версия указана неверно.'),
    );
  }
  const stored = await repository.findById(input.id);
  if (stored === null) {
    return failure(new DomainError('direction.not_found', 'Направление не найдено.'));
  }
  if (stored.version !== input.expectedVersion) return directionVersionConflict();
  try {
    const changed = change(stored, clock.now());
    if (changed === stored) return success(stored);
    return (await repository.updateIfVersionMatches(changed, input.expectedVersion))
      ? success(changed)
      : directionVersionConflict();
  } catch (error: unknown) {
    return directionFailure(error);
  }
}

export function directionVersionConflict(): Failure<DomainError> {
  return failure(
    new DomainError('direction.version_conflict', 'Направление уже изменилось. Обновите данные.'),
  );
}
