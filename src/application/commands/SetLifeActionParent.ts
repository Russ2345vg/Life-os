import { type EntityId, type LifeAction } from '../../domain';
import { assertActionHierarchy } from '../../domain/life-action/ActionHierarchy';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import type { JournalUnitOfWork } from '../ports/JournalUnitOfWork';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import { planningJournal } from '../planner/planningSupport';
import { lifeActionDomainFailure, lifeActionNotFound } from './lifeActionCommandResult';

export class SetLifeActionParent {
  public constructor(
    private readonly repository: LifeActionRepository,
    private readonly unitOfWork: JournalUnitOfWork,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  public async execute(input: {
    readonly lifeActionId: EntityId;
    readonly parentActionId: EntityId | null;
  }): Promise<Result<LifeAction, DomainError>> {
    const action = await this.repository.findById(input.lifeActionId);
    if (!action) return lifeActionNotFound();
    if (!this.repository.findAll)
      return failure(
        new DomainError('life_action.hierarchy_unavailable', 'Не удалось проверить поддействия.'),
      );
    try {
      const actions = await this.repository.findAll();
      assertActionHierarchy(
        actions.map((item) => ({
          id: item.id.toString(),
          parentActionId: item.id.equals(action.id)
            ? (input.parentActionId?.toString() ?? null)
            : (item.parentActionId?.toString() ?? null),
        })),
      );
      const expectedVersion = action.version;
      const previousParentId = action.parentActionId?.toString() ?? null;
      if (!action.setParentAction(input.parentActionId)) return success(action);
      const now = this.clock.now();
      await this.unitOfWork.commit({
        lifeActions: [{ lifeAction: action, expectedVersion }],
        journalEntries: [
          planningJournal(
            this.ids.generate().toString(),
            'LifeAction',
            action.id.toString(),
            input.parentActionId ? 'Родительское действие изменено' : 'Поддействие отделено',
            now,
            { previousParentId, parentActionId: input.parentActionId?.toString() ?? null },
          ),
        ],
      });
      return success(action);
    } catch (error: unknown) {
      return lifeActionDomainFailure(error);
    }
  }
}
