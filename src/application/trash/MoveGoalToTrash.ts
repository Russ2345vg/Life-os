import { EntityId } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { Clock } from '../ports/Clock';
import type { GoalRepository } from '../ports/GoalRepository';
import type { TrashDependencyPolicy } from './TrashDependencyPolicy';
import type { TrashReceipt } from './TrashItem';
import type { TrashRepository } from './TrashRepository';

export class MoveGoalToTrash {
  public constructor(
    private readonly trash: TrashRepository,
    private readonly goals: Pick<GoalRepository, 'updateIfVersionMatches'>,
    private readonly policy: TrashDependencyPolicy,
    private readonly clock: Clock,
  ) {}

  public async execute(id: string): Promise<TrashReceipt> {
    const goal = await this.trash.findGoalIncludingDeleted(EntityId.create(id));
    if (!goal) throw new DomainError('goal.not_found', 'Цель не найдена.');
    const receipt: TrashReceipt = { type: 'goal', id };
    if (goal.isDeleted()) return receipt;
    await this.policy.assertCanMove('goal', id);
    const deleted = goal.softDelete(this.clock.now());
    if (!(await this.goals.updateIfVersionMatches(deleted, goal.version)))
      throw new DomainError('goal.version_conflict', 'Цель уже изменена. Обновите данные.');
    return receipt;
  }
}
