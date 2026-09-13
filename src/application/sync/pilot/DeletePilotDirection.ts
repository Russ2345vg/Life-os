import type { PilotDeleteRepository } from './PilotDeleteRepository';

export class DeletePilotDirection {
  public constructor(private readonly repository: PilotDeleteRepository) {}
  public execute(directionId: string): Promise<boolean> {
    return this.repository.delete('direction', directionId);
  }
}
