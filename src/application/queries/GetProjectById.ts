import type { EntityId, Project } from '../../domain';
import type { ProjectRepository } from '../ports/ProjectRepository';

export class GetProjectById {
  public constructor(readonly repository: ProjectRepository) {}
  public execute(id: EntityId): Promise<Project | null> {
    return this.repository.findById(id);
  }
}
