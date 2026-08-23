import type { EntityId, Goal } from '../../domain';
import type { GoalRepository } from '../ports/GoalRepository';

export class GetGoalById {
  public constructor(readonly repository: GoalRepository) {}

  public execute(id: EntityId): Promise<Goal | null> {
    return this.repository.findById(id);
  }
}
