import { PROJECT_STATUS, type Direction, type Project } from '../../domain';
import type { DirectionRepository } from '../ports/DirectionRepository';
import type { ProjectRepository } from '../ports/ProjectRepository';

export interface DirectionOverviewItem {
  readonly direction: Direction;
  readonly activeProjectCount: number;
  readonly totalProjectCount: number;
  readonly isMain: boolean;
}

export class GetDirectionsOverview {
  public constructor(
    readonly directionRepository: DirectionRepository,
    readonly projectRepository: ProjectRepository,
  ) {}

  public async execute(): Promise<readonly DirectionOverviewItem[]> {
    const [directions, projects] = await Promise.all([
      this.directionRepository.findAll(),
      this.projectRepository.findAll(),
    ]);
    const counts = countProjects(projects);
    return directions.map((direction) => {
      const count = counts.get(direction.id.toString());
      return {
        direction,
        activeProjectCount: count?.active ?? 0,
        totalProjectCount: count?.total ?? 0,
        isMain: direction.isMain,
      };
    });
  }
}

interface ProjectCount {
  readonly active: number;
  readonly total: number;
}

function countProjects(projects: readonly Project[]): ReadonlyMap<string, ProjectCount> {
  const counts = new Map<string, ProjectCount>();
  for (const project of projects) {
    const directionId = project.directionId?.toString();
    if (directionId === undefined) continue;
    const current = counts.get(directionId) ?? { active: 0, total: 0 };
    counts.set(directionId, {
      active: current.active + (project.status === PROJECT_STATUS.active ? 1 : 0),
      total: current.total + 1,
    });
  }
  return counts;
}
