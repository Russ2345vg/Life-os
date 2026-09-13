import { LIFE_ACTION_STATUS, type DayDate, type EntityId, type LifeAction } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import type { JournalUnitOfWork } from '../ports/JournalUnitOfWork';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import { createLifeActionJournalEntries } from '../journal/createJournalEntries';
import { lifeActionDomainFailure, lifeActionNotFound } from './lifeActionCommandResult';
import { clearPreviousMainActions } from './lifeActionPlanning';

export interface SetLifeActionPlanInput {
  readonly lifeActionId: EntityId;
  readonly plannedDate: DayDate | null;
  readonly isNext?: boolean;
}

export class SetLifeActionPlan {
  public constructor(
    readonly repository: LifeActionRepository,
    readonly unitOfWork: JournalUnitOfWork,
    readonly clock: Clock,
    readonly ids: IdGenerator,
  ) {}

  public async execute(input: SetLifeActionPlanInput): Promise<Result<LifeAction, DomainError>> {
    const action = await this.repository.findById(input.lifeActionId);
    if (action === null) return lifeActionNotFound();
    try {
      const expectedVersion = action.version;
      const completed = action.status === LIFE_ACTION_STATUS.completed;
      const isNext = input.isNext ?? (input.plannedDate === null ? false : action.isNext);
      if (
        action.status !== LIFE_ACTION_STATUS.draft &&
        !completed &&
        action.plannedDate?.toString() !== input.plannedDate?.toString()
      ) {
        if (action.status === LIFE_ACTION_STATUS.inProgress)
          throw new DomainError(
            'life_action.plan_in_progress',
            'Дату выполняемого действия можно менять только через прежний рабочий процесс.',
          );
        if (input.plannedDate === null)
          throw new DomainError(
            'life_action.legacy_date_required',
            'У подготовленного действия можно изменить дату, но нельзя убрать её.',
          );
        action.reschedule(input.plannedDate, this.clock.now(), this.ids.generate());
      }
      action.setPlan(input.plannedDate, isNext);
      const previous =
        !completed && isNext && input.plannedDate !== null
          ? await clearPreviousMainActions(this.repository, input.plannedDate, action)
          : [];
      if (action.version === expectedVersion && previous.length === 0) return success(action);
      await this.unitOfWork.commit({
        ...(!completed && isNext && input.plannedDate !== null
          ? { mainActionDate: input.plannedDate }
          : {}),
        lifeActions: [...previous, { lifeAction: action, expectedVersion }],
        journalEntries: createLifeActionJournalEntries(action),
      });
      return success(action);
    } catch (error: unknown) {
      return lifeActionDomainFailure(error);
    }
  }
}
