import {
  DIRECTION_STATUS,
  GOAL_STATUS,
  type EntityId,
  type Goal,
  type GoalStatus,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Failure, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { DirectionRepository } from '../ports/DirectionRepository';
import type { GoalRepository } from '../ports/GoalRepository';

export function goalFailure(error: unknown): Failure<DomainError> {
  if (error instanceof DomainError) return failure(error);
  throw error;
}

export function goalVersionConflict(): Failure<DomainError> {
  return failure(new DomainError('goal.version_conflict', 'Цель уже изменена. Обновите данные.'));
}

export function validateGoalExpectedVersion(expectedVersion: number): Failure<DomainError> | null {
  return Number.isInteger(expectedVersion) && expectedVersion >= 1
    ? null
    : failure(new DomainError('goal.invalid_expected_version', 'Версия указана неверно.'));
}

export async function validateGoalDirection(
  directionRepository: DirectionRepository,
  directionId: EntityId | null,
  status: GoalStatus,
  allowArchivedDirection = false,
): Promise<Failure<DomainError> | null> {
  if (status === GOAL_STATUS.active && directionId === null) {
    return failure(
      new DomainError('goal.direction_required', 'Активной цели необходимо направление.'),
    );
  }
  if (directionId === null) return null;
  const direction = await directionRepository.findById(directionId);
  if (direction === null) {
    return failure(new DomainError('goal.direction_not_found', 'Направление цели не найдено.'));
  }
  if (direction.status === DIRECTION_STATUS.archived && !allowArchivedDirection) {
    return failure(
      new DomainError('goal.archived_direction', 'Нельзя назначить цели архивное направление.'),
    );
  }
  return null;
}

export interface GoalCommandInput {
  readonly id: Goal['id'];
  readonly expectedVersion: number;
}

export async function changeGoal(
  repository: GoalRepository,
  clock: Clock,
  input: GoalCommandInput,
  change: (goal: Goal, now: Date) => Goal,
): Promise<Result<Goal, DomainError>> {
  const invalidVersion = validateGoalExpectedVersion(input.expectedVersion);
  if (invalidVersion !== null) return invalidVersion;
  const stored = await repository.findById(input.id);
  if (stored === null) return failure(new DomainError('goal.not_found', 'Цель не найдена.'));
  if (stored.version !== input.expectedVersion) return goalVersionConflict();
  try {
    const changed = change(stored, clock.now());
    if (changed === stored) return success(stored);
    return (await repository.updateIfVersionMatches(changed, input.expectedVersion))
      ? success(changed)
      : goalVersionConflict();
  } catch (error: unknown) {
    return goalFailure(error);
  }
}
