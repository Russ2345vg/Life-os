import type { PilotDeleteRepository } from './PilotDeleteRepository';

export class DeletePilotSphere {
  public constructor(private readonly repository: PilotDeleteRepository) {}
  public execute(sphereId: string): Promise<boolean> {
    return this.repository.delete('sphere', sphereId);
  }
}
