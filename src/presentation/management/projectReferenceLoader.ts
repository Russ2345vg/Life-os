import type { GetDirections, GetProjects, GetSpheres, SpheresSnapshot } from '../../application';
import type { Direction, Project } from '../../domain';
import { sortProjects } from './projectSorting';

export interface ProjectReferenceData {
  readonly projects: readonly Project[];
  readonly directions: readonly Direction[];
  readonly spheres: SpheresSnapshot;
}

interface ProjectReferenceQueries {
  readonly getProjects: Pick<GetProjects, 'execute'>;
  readonly getDirections: Pick<GetDirections, 'execute'>;
  readonly getSpheres: Pick<GetSpheres, 'execute'>;
}

export interface ProjectReferenceLoader {
  load(): Promise<ProjectReferenceData>;
  refresh(): Promise<ProjectReferenceData>;
}

export function createProjectReferenceLoader(
  queries: ProjectReferenceQueries,
): ProjectReferenceLoader {
  let cached: Promise<ProjectReferenceData> | null = null;

  function query(): Promise<ProjectReferenceData> {
    const request = Promise.all([
      queries.getProjects.execute(),
      queries.getDirections.execute(),
      queries.getSpheres.execute(),
    ]).then(([projects, directions, spheres]) => ({
      projects: sortProjects(projects),
      directions,
      spheres,
    }));
    cached = request;
    return request;
  }

  return {
    load: () => (cached === null ? query() : cached),
    refresh: query,
  };
}
