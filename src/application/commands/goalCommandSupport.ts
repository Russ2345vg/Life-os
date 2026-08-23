import type { Goal } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Failure, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
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
