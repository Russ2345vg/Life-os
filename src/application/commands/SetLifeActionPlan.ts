import { planningJournal } from '../planner/planningSupport';
import {
  LIFE_ACTION_STATUS,
  type DayDate,
  type EntityId,
  type LifeAction,
  type LifeActionStatus,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
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
  /** Optional caller policy, validated against the freshly loaded action. */
  readonly allowedStatuses?: readonly LifeActionStatus[];
}

export interface LifeActionDateUndoReceipt {
  readonly lifeActionId: EntityId;
  readonly previousDate: DayDate | null;
  readonly previousIsNext: boolean;
  readonly previousOccurrence: LifeAction['occurrence'];
  readonly previousEstimateMinutes: number | null;
  readonly previousScheduledStartMinute: number | null;
  readonly previousScheduledDurationMinutes: number | null;
  readonly expectedVersion: number;
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
    return this.applyPlan(action, input);
  }

  public async changeDate(
    input: Pick<SetLifeActionPlanInput, 'lifeActionId' | 'plannedDate'> & {
      readonly expectedVersion?: number;
    },
  ): Promise<
    Result<
      { readonly action: LifeAction; readonly receipt: LifeActionDateUndoReceipt | null },
      DomainError
    >
  > {
    const action = await this.repository.findById(input.lifeActionId);
    if (action === null) return lifeActionNotFound();
    if (input.expectedVersion !== undefined && action.version !== input.expectedVersion)
      return failure(
        new DomainError(
          'life_action.version_conflict',
          'Действие изменилось. Обновите список и выберите шаг снова.',
        ),
      );
    const previous = {
      lifeActionId: action.id,
      previousDate: action.plannedDate,
      previousIsNext: action.isNext,
      previousOccurrence: action.occurrence,
      previousEstimateMinutes: action.estimateMinutes,
      previousScheduledStartMinute: action.scheduledStartMinute,
      previousScheduledDurationMinutes: action.scheduledDurationMinutes,
    };
    const changed =
      (action.plannedDate?.toString() ?? null) !== (input.plannedDate?.toString() ?? null);
    const result = await this.applyPlan(action, {
      ...input,
      isNext: changed ? false : action.isNext,
      allowedStatuses: [LIFE_ACTION_STATUS.draft, LIFE_ACTION_STATUS.ready],
    });
    if (!result.ok) return result;
    return success({
      action: result.value,
      receipt: changed ? { ...previous, expectedVersion: result.value.version } : null,
    });
  }

  public async undoDate(
    receipt: LifeActionDateUndoReceipt,
  ): Promise<Result<LifeAction, DomainError>> {
    const action = await this.repository.findById(receipt.lifeActionId);
    if (action === null) return lifeActionNotFound();
    try {
      if (
        action.version !== receipt.expectedVersion ||
        ![LIFE_ACTION_STATUS.draft, LIFE_ACTION_STATUS.ready].some(
          (status) => status === action.status,
        )
      )
        throw new DomainError(
          'life_action.undo_conflict',
          'Действие уже изменилось. Отмена не выполнена.',
        );
      if (action.status === LIFE_ACTION_STATUS.ready && receipt.previousDate !== null)
        action.reschedule(receipt.previousDate, this.clock.now(), this.ids.generate());
      action.setPlan(receipt.previousDate, receipt.previousIsNext);
      action.setTimePlanning({
        estimateMinutes: receipt.previousEstimateMinutes,
        scheduledStartMinute: receipt.previousScheduledStartMinute,
        scheduledDurationMinutes: receipt.previousScheduledDurationMinutes,
      });
      action.setPlanningMetadata({ occurrence: receipt.previousOccurrence });
      await this.unitOfWork.commit({
        ...(receipt.previousIsNext && receipt.previousDate !== null
          ? { mainActionDate: receipt.previousDate }
          : {}),
        lifeActions: [{ lifeAction: action, expectedVersion: receipt.expectedVersion }],
        journalEntries: [
          ...createLifeActionJournalEntries(action),
          planningJournal(
            this.ids.generate().toString(),
            'LifeAction',
            action.id.toString(),
            'Перенос даты отменён',
            this.clock.now(),
            { plannedDate: receipt.previousDate?.toString() ?? null },
          ),
        ],
      });
      return success(action);
    } catch (error: unknown) {
      return lifeActionDomainFailure(error);
    }
  }

  private async applyPlan(
    action: LifeAction,
    input: SetLifeActionPlanInput,
  ): Promise<Result<LifeAction, DomainError>> {
    try {
      if (input.allowedStatuses && !input.allowedStatuses.includes(action.status))
        throw new DomainError(
          'life_action.status_changed',
          'Состояние действия изменилось. Обновите список и повторите попытку.',
        );
      const expectedVersion = action.version;
      const previousDate = action.plannedDate?.toString() ?? null;
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
      if (action.occurrence && previousDate !== (input.plannedDate?.toString() ?? null))
        action.setPlanningMetadata({ occurrence: { ...action.occurrence, manualDate: true } });
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
        journalEntries: [
          ...createLifeActionJournalEntries(action),
          ...(action.occurrence && previousDate !== (action.plannedDate?.toString() ?? null)
            ? [
                planningJournal(
                  this.ids.generate().toString(),
                  'LifeAction',
                  action.id.toString(),
                  'Дата повторения изменена',
                  this.clock.now(),
                  {
                    ruleId: action.occurrence.ruleId,
                    slot: action.occurrence.slot,
                    previousDate,
                    nextDate: action.plannedDate?.toString() ?? null,
                  },
                ),
              ]
            : []),
        ],
      });
      return success(action);
    } catch (error: unknown) {
      return lifeActionDomainFailure(error);
    }
  }
}
