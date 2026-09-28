import type { LifeActionRepository } from '../ports/LifeActionRepository';
import type { LifeAction } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';

export function isPlannerCatalogVisibleAction(action: LifeAction): boolean {
  return !action.isArchived() && !(action.status === 'cancelled' && action.occurrence != null);
}

export class PlannerCatalog {
  constructor(readonly repository: LifeActionRepository) {}
  async actions() {
    if (!this.repository.findAll)
      throw new DomainError('planner.read_unavailable', 'Не удалось загрузить действия.');
    return (await this.repository.findAll()).filter(isPlannerCatalogVisibleAction);
  }
}
