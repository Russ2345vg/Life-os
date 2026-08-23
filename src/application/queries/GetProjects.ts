import type { Project } from '../../domain';
import type { ProjectRepository } from '../ports/ProjectRepository';

export class GetProjects {
  public constructor(readonly repository: ProjectRepository) {}
  public execute(): Promise<readonly Project[]> {
    return this.repository.findAll();
  }
}
