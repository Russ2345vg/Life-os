import { PROJECT_STATUS, type EntityId } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { ProjectRepository } from '../ports/ProjectRepository';

export interface ResolvedDecisionProject {
  readonly projectId: EntityId | null;
  readonly sphereId: EntityId | null;
}

export async function resolveDecisionProject(
  repository: ProjectRepository | null,
  projectId: EntityId | null,
  sphereId: EntityId | null,
  allowUnavailableProject = false,
): Promise<ResolvedDecisionProject> {
  if (projectId === null) return { projectId: null, sphereId };
  if (repository === null) {
    throw new DomainError(
      'decision.project_validation_unavailable',
      'Не удалось проверить выбранный проект.',
    );
  }

  const project = await repository.findById(projectId);
  if (project === null) {
    throw new DomainError('decision.project_not_found', 'Выбранный проект не найден.');
  }
  if (
    !allowUnavailableProject &&
    (project.status === PROJECT_STATUS.completed || project.status === PROJECT_STATUS.archived)
  ) {
    throw new DomainError(
      'decision.project_unavailable',
      'Завершённый или архивный проект нельзя выбрать для нового решения.',
    );
  }

  if (project.sphereId === null) return { projectId, sphereId };
  if (sphereId === null) return { projectId, sphereId: project.sphereId };
  if (!project.sphereId.equals(sphereId)) {
    throw new DomainError(
      'decision.project_sphere_mismatch',
      'Сфера решения должна совпадать со сферой выбранного проекта.',
    );
  }
  return { projectId, sphereId };
}
