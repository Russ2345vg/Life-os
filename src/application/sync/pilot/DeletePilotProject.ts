import type { PilotDeleteRepository } from './PilotDeleteRepository';

export class DeletePilotProject {
  public constructor(private readonly repository: PilotDeleteRepository) {}
  public execute(projectId: string): Promise<boolean> {
    return this.repository.delete('project', projectId);
  }
}
