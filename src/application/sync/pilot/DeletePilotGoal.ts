import type { PilotDeleteRepository } from './PilotDeleteRepository';

export class DeletePilotGoal {
  public constructor(private readonly repository: PilotDeleteRepository) {}
  public execute(goalId: string): Promise<boolean> {
    return this.repository.delete('goal', goalId);
  }
}
