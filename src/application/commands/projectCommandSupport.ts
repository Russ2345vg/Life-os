import type { EntityId, Project } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Failure, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { DirectionRepository } from '../ports/DirectionRepository';
import type { ProjectRepository } from '../ports/ProjectRepository';

export interface ProjectCommandInput {
  readonly id: EntityId;
  readonly expectedVersion: number;
}

export function projectFailure(error: unknown): Failure<DomainError> {
  if (error instanceof DomainError) return failure(error);
  throw error;
}

export async function validateProjectReferences(
  directionRepository: DirectionRepository,
  directionId: EntityId | null,
  sphereId: EntityId | null,
): Promise<Failure<DomainError> | null> {
  if (directionId === null) return null;
  const direction = await directionRepository.findById(directionId);
  if (direction === null) {
    return failure(
      new DomainError('project.direction_not_found', 'Направление проекта не найдено.'),
    );
  }
  const referencesMatch =
    direction.sphereId === null
      ? sphereId === null
      : sphereId !== null && direction.sphereId.equals(sphereId);
  if (!referencesMatch) {
    return failure(
      new DomainError(
        'project.direction_sphere_mismatch',
        'Направление не принадлежит выбранной сфере.',
      ),
    );
  }
  return null;
}

export async function changeProject(
  repository: ProjectRepository,
  clock: Clock,
  input: ProjectCommandInput,
  change: (project: Project, now: Date) => Project,
): Promise<Result<Project, DomainError>> {
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    return failure(new DomainError('project.invalid_expected_version', 'Версия указана неверно.'));
  }
  const stored = await repository.findById(input.id);
  if (stored === null) return failure(new DomainError('project.not_found', 'Проект не найден.'));
  if (stored.version !== input.expectedVersion) return projectVersionConflict();
  try {
    const changed = change(stored, clock.now());
    if (changed === stored) return success(stored);
    return (await repository.updateIfVersionMatches(changed, input.expectedVersion))
      ? success(changed)
      : projectVersionConflict();
  } catch (error: unknown) {
    return projectFailure(error);
  }
}

export function projectVersionConflict(): Failure<DomainError> {
  return failure(
    new DomainError('project.version_conflict', 'Проект уже изменился. Обновите данные.'),
  );
}
