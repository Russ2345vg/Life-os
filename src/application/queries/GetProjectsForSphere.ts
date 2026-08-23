import type { EntityId, Project } from '../../domain';
import type { ProjectRepository } from '../ports/ProjectRepository';

export class GetProjectsForSphere {
  public constructor(readonly repository: ProjectRepository) {}
  public execute(sphereId: EntityId): Promise<readonly Project[]> {
    return this.repository.findBySphereId(sphereId);
  }
}
