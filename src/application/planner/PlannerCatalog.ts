import type { LifeActionRepository } from '../ports/LifeActionRepository';
import { DomainError } from '../../shared/errors/DomainError';

export class PlannerCatalog {
  constructor(readonly repository: LifeActionRepository) {}
  async actions() {
    if (!this.repository.findAll)
      throw new DomainError('planner.read_unavailable', 'Не удалось загрузить действия.');
    return (await this.repository.findAll()).filter((action) => !action.isArchived());
  }
}
