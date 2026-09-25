import { EntityId } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { Clock } from '../ports/Clock';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import type { TrashDependencyPolicy } from './TrashDependencyPolicy';
import type { TrashReceipt } from './TrashItem';
import type { TrashRepository } from './TrashRepository';

export class MoveLifeActionToTrash {
  public constructor(
    private readonly trash: TrashRepository,
    private readonly actions: Pick<LifeActionRepository, 'save'>,
    private readonly policy: TrashDependencyPolicy,
    private readonly clock: Clock,
  ) {}

  public async execute(inputId: string): Promise<TrashReceipt> {
    const entityId = EntityId.create(inputId);
    const id = entityId.toString();
    const action = await this.trash.findActionIncludingDeleted(entityId);
    if (!action) throw new DomainError('life_action.not_found', 'Действие не найдено.');
    if (action.occurrence)
      throw new DomainError(
        'trash.recurring_occurrence',
        'Переместите в корзину всю серию или пропустите отдельное повторение.',
      );
    const receipt: TrashReceipt = { type: 'action', id };
    if (action.isDeleted()) return receipt;
    await this.policy.assertCanMove('action', id);
    action.softDelete(this.clock.now());
    await this.actions.save(action);
    return receipt;
  }
}
