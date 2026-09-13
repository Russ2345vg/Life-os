import { PROJECT_STATUS } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { Clock } from '../ports/Clock';
import type { ProjectRepository } from '../ports/ProjectRepository';

export class EnsureSingleMainProject {
  public constructor(
    readonly repository: ProjectRepository,
    readonly clock: Clock,
  ) {}

  public async execute(): Promise<void> {
    const mainProjects = (await this.repository.findAll())
      .filter((project) => project.isMain && project.status === PROJECT_STATUS.active)
      .sort(
        (left, right) =>
          right.updatedAt.getTime() - left.updatedAt.getTime() ||
          left.id.toString().localeCompare(right.id.toString()),
      );
    const winners = new Map<string, (typeof mainProjects)[number]>();
    for (const project of mainProjects) {
      const directionId = project.directionId?.toString() ?? '__standalone__';
      if (!winners.has(directionId)) winners.set(directionId, project);
    }
    for (const winner of winners.values()) {
      const duplicates = mainProjects.filter(
        (project) => samePortfolio(project, winner) && !project.id.equals(winner.id),
      );
      if (duplicates.length === 0) continue;
      if (!(await this.repository.replaceMain(winner, winner.version, this.clock.now()))) {
        throw new DomainError(
          'project.main_reconciliation_conflict',
          'Не удалось восстановить единственную главную цель направления.',
        );
      }
    }
  }
}

function samePortfolio(
  left: Awaited<ReturnType<ProjectRepository['findAll']>>[number],
  right: Awaited<ReturnType<ProjectRepository['findAll']>>[number],
): boolean {
  return left.directionId === null
    ? right.directionId === null
    : right.directionId !== null && left.directionId.equals(right.directionId);
}
