import type { EntityId, Goal, GoalStatus } from '../../domain';
import type { GoalRepository } from '../ports/GoalRepository';

export interface GetGoalsInput {
  readonly status?: GoalStatus;
  readonly directionId?: EntityId;
}

export class GetGoals {
  public constructor(readonly repository: GoalRepository) {}

  public async execute(input: GetGoalsInput = {}): Promise<readonly Goal[]> {
    const goals =
      input.directionId === undefined
        ? await this.repository.findAll()
        : await this.repository.findByDirectionId(input.directionId);
    return input.status === undefined
      ? goals
      : goals.filter((goal) => goal.status === input.status);
  }
}
