import type { EntityId, Goal } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { GoalRepository } from '../ports/GoalRepository';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import { goalFailure, goalVersionConflict } from './goalCommandSupport';

/** Selects a Goal step without changing the separate main Action of any Day. */
export class SelectGoalNextAction {
  public constructor(
    private readonly goals: GoalRepository,
    private readonly actions: LifeActionRepository,
    private readonly clock: Clock,
  ) {}

  public async execute(input: {
    readonly goalId: EntityId;
    readonly actionId: EntityId;
  }): Promise<Result<Goal, DomainError>> {
    const goal = await this.goals.findById(input.goalId);
    if (!goal) return failure(new DomainError('goal.not_found', 'Цель не найдена.'));
    const action = await this.actions.findById(input.actionId);
    if (
      !action ||
      !action.goalId?.equals(goal.id) ||
      action.isArchived() ||
      action.status === 'completed' ||
      action.status === 'cancelled'
    )
      return failure(
        new DomainError('goal.next_action_invalid', 'Выберите открытое действие этой цели.'),
      );
    try {
      const updated = goal.selectNextAction(action.id, this.clock.now());
      if (updated === goal) return success(goal);
      if (!(await this.goals.updateIfVersionMatches(updated, goal.version)))
        return goalVersionConflict();
      return success(updated);
    } catch (error: unknown) {
      return goalFailure(error);
    }
  }
}
