import type { EntityId, Project } from '../../domain';
import type { ProjectRepository } from '../ports/ProjectRepository';

export class GetProjectsForDirection {
  public constructor(readonly repository: ProjectRepository) {}
  public execute(directionId: EntityId): Promise<readonly Project[]> {
    return this.repository.findByDirectionId(directionId);
  }
}
