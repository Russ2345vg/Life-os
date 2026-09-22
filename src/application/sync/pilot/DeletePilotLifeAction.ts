import type { PilotDeleteRepository } from './PilotDeleteRepository';

export class DeletePilotLifeAction {
  public constructor(private readonly repository: PilotDeleteRepository) {}
  public execute(actionId: string): Promise<boolean> {
    return this.repository.delete('life_action', actionId, { explainBlocked: true });
  }
}
