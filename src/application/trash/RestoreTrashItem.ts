import { EntityId } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { RecurringActions } from '../planner/RecurringActions';
import type { Clock } from '../ports/Clock';
import type { GoalRepository } from '../ports/GoalRepository';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import type { TrashDependencyPolicy } from './TrashDependencyPolicy';
import type { RestoredTrashItem, TrashReceipt } from './TrashItem';
import type { TrashRepository } from './TrashRepository';

export class RestoreTrashItem {
  public constructor(
    private readonly trash: TrashRepository,
    private readonly goals: Pick<GoalRepository, 'updateIfVersionMatches'>,
    private readonly actions: Pick<LifeActionRepository, 'save'>,
    private readonly recurring: Pick<RecurringActions, 'restore'>,
    private readonly policy: TrashDependencyPolicy,
    private readonly clock: Clock,
  ) {}

  public async execute(input: TrashReceipt): Promise<RestoredTrashItem> {
    const { type, id } = input;
    switch (type) {
      case 'goal': {
        const goal = await this.trash.findGoalIncludingDeleted(EntityId.create(id));
        if (!goal) throw expired();
        if (!goal.isDeleted()) return { type, id, entity: goal };
        await this.policy.assertCanRestore(type, id);
        const restored = goal.restoreFromTrash(this.clock.now());
        if (!(await this.goals.updateIfVersionMatches(restored, goal.version)))
          throw new DomainError('goal.version_conflict', 'Цель уже изменена. Обновите данные.');
        return { type, id, entity: restored };
      }
      case 'action': {
        const action = await this.trash.findActionIncludingDeleted(EntityId.create(id));
        if (!action) throw expired();
        if (action.occurrence)
          throw new DomainError('trash.recurring_occurrence', 'Восстановите всю серию повторений.');
        if (!action.isDeleted()) return { type, id, entity: action };
        await this.policy.assertCanRestore(type, id);
        action.restoreFromTrash(this.clock.now());
        await this.actions.save(action);
        return { type, id, entity: action };
      }
      case 'series': {
        const rule = await this.trash.findSeriesIncludingRemoved(id);
        if (!rule || rule.purgedAt != null) throw expired();
        if (rule.removedAt == null) return { type, id, entity: rule };
        await this.policy.assertCanRestore(type, id);
        await this.recurring.restore(id);
        const restored = await this.trash.findSeriesIncludingRemoved(id);
        if (!restored || restored.purgedAt != null) throw expired();
        return { type, id, entity: restored };
      }
      default:
        throw new DomainError('trash.invalid_type', 'Неизвестный тип записи корзины.');
    }
  }
}

function expired(): DomainError {
  return new DomainError(
    'trash.expired',
    'Запись больше недоступна для восстановления. Обновите корзину.',
  );
}
