import type { Goal } from '../../domain';
import type { GoalRepository } from '../ports/GoalRepository';

export class GetGoals {
  public constructor(readonly repository: GoalRepository) {}

  public execute(): Promise<readonly Goal[]> {
    return this.repository.findAll();
  }
}
