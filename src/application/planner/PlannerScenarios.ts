import { DayDate, EntityId } from '../../domain';
import {
  addScenarioAction,
  removeScenarioAction,
  taskScenario,
  type TaskScenario,
} from '../../domain/planner/TaskScenario';
import { DomainError } from '../../shared/errors/DomainError';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import type { TaskScenarioRepository } from '../ports/TaskScenarioRepository';

export class PlannerScenarios {
  constructor(
    readonly repository: TaskScenarioRepository,
    readonly actions: LifeActionRepository,
    readonly clock: Clock,
    readonly ids: IdGenerator,
  ) {}
  async list(date: string) {
    DayDate.create(date);
    return (await this.repository.list()).filter(
      (s) => !s.archived && (s.date === null || s.date === date),
    );
  }
  async create(title: string, date: string | null) {
    const value = taskScenario({
      id: this.ids.generate().toString(),
      title,
      date,
      actionIds: [],
      archived: false,
      updatedAt: this.clock.now().toISOString(),
      version: 1,
      schemaVersion: 1,
    });
    await this.repository.create(value);
    return value;
  }
  update(id: string, title: string, date: string | null) {
    return this.change(id, (current) =>
      taskScenario({
        ...current,
        title,
        date,
        updatedAt: this.clock.now().toISOString(),
        version: current.version + 1,
      }),
    );
  }
  async addAction(id: string, actionId: string) {
    const action = await this.actions.findById(EntityId.create(actionId));
    if (
      !action ||
      action.isArchived() ||
      action.status === 'completed' ||
      action.status === 'cancelled'
    )
      throw new DomainError('scenario.action_unavailable', 'Задача недоступна. Выберите другую.');
    return this.change(id, (current) =>
      addScenarioAction(current, actionId, this.clock.now().toISOString()),
    );
  }
  removeAction(id: string, actionId: string) {
    return this.change(id, (current) =>
      removeScenarioAction(current, actionId, this.clock.now().toISOString()),
    );
  }
  archive(id: string) {
    return this.change(id, (current) =>
      taskScenario({
        ...current,
        archived: true,
        updatedAt: this.clock.now().toISOString(),
        version: current.version + 1,
      }),
    );
  }
  private change(id: string, update: (current: TaskScenario) => TaskScenario) {
    return this.repository.change(id, (current) => {
      if (current.archived)
        throw new DomainError('scenario.archived', 'Сценарий удалён. Выберите другой.');
      return update(current);
    });
  }
}
