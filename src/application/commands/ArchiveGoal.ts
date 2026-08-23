import type { Goal } from '../../domain';
import type { DomainError } from '../../shared/errors/DomainError';
import type { Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { GoalRepository } from '../ports/GoalRepository';
import { changeGoal, type GoalCommandInput } from './goalCommandSupport';

export type ArchiveGoalInput = GoalCommandInput;

export class ArchiveGoal {
  public constructor(
    readonly repository: GoalRepository,
    readonly clock: Clock,
  ) {}

  public execute(input: ArchiveGoalInput): Promise<Result<Goal, DomainError>> {
    return changeGoal(this.repository, this.clock, input, (goal, now) => goal.archive(now));
  }
}
