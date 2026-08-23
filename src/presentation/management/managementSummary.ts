import { DIRECTION_STATUS, PROJECT_STATUS, type Direction, type Project } from '../../domain';

export interface ManagementSummary {
  readonly totalDirections: number;
  readonly activeDirections: number;
  readonly totalProjects: number;
  readonly activeProjects: number;
  readonly pausedProjects: number;
}

export function summarizeManagement(
  directions: readonly Direction[],
  projects: readonly Project[],
): ManagementSummary {
  return {
    totalDirections: directions.length,
    activeDirections: directions.filter((direction) => direction.status === DIRECTION_STATUS.active)
      .length,
    totalProjects: projects.length,
    activeProjects: projects.filter((project) => project.status === PROJECT_STATUS.active).length,
    pausedProjects: projects.filter((project) => project.status === PROJECT_STATUS.paused).length,
  };
}
