import { LifeActionTitle, type EntityId, type LifeAction } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import type { JournalUnitOfWork } from '../ports/JournalUnitOfWork';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import { planningJournal } from '../planner/planningSupport';
import { lifeActionDomainFailure, lifeActionNotFound } from './lifeActionCommandResult';

export class EditPlannerActionDraft {
  public constructor(
    private readonly repository: LifeActionRepository,
    private readonly unitOfWork: JournalUnitOfWork,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  public async execute(input: {
    readonly lifeActionId: EntityId;
    readonly title: string;
    readonly description: string;
  }): Promise<Result<LifeAction, DomainError>> {
    const action = await this.repository.findById(input.lifeActionId);
    if (!action) return lifeActionNotFound();
    try {
      const expectedVersion = action.version;
      const previousTitle = action.title.toString();
      if (!action.updateDraftDetails(LifeActionTitle.create(input.title), input.description))
        return success(action);
      const now = this.clock.now();
      await this.unitOfWork.commit({
        lifeActions: [{ lifeAction: action, expectedVersion }],
        journalEntries: [
          planningJournal(
            this.ids.generate().toString(),
            'LifeAction',
            action.id.toString(),
            'Действие изменено',
            now,
            { previousTitle, nextTitle: action.title.toString() },
          ),
        ],
      });
      return success(action);
    } catch (error: unknown) {
      return lifeActionDomainFailure(error);
    }
  }
}
