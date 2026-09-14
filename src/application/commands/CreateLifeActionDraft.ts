import { actionPlanningSetup, type ActionContributionInput } from '../planner/actionPlanningSetup';
import type { RecurrenceInput } from '../planner/RecurringActions';
import { EntityId as PlanningEntityId } from '../../domain';
import {
  DECISION_STATUS,
  LifeAction,
  type DayDate,
  type EntityId,
  type LifeActionTitle,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { GoalRepository } from '../ports/GoalRepository';
import type { JournalUnitOfWork } from '../ports/JournalUnitOfWork';
import { clearPreviousMainActions } from './lifeActionPlanning';
import type { Clock } from '../ports/Clock';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { IdGenerator } from '../ports/IdGenerator';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import {
  decisionNotFoundForLifeAction,
  decisionUnavailableForLifeAction,
  lifeActionDomainFailure,
} from './lifeActionCommandResult';

export interface CreateLifeActionDraftInput {
  readonly recurrence?: RecurrenceInput | null;
  readonly contributions?: readonly ActionContributionInput[];
  readonly title: LifeActionTitle;
  readonly description?: string;
  readonly decisionId?: EntityId;
  readonly sphereId?: EntityId | null;
  readonly goalId?: EntityId | null;
  readonly plannedDate?: DayDate | null;
  readonly isNext?: boolean;
}

export class CreateLifeActionDraft {
  readonly #lifeActionRepository: LifeActionRepository;
  readonly #decisionRepository: DecisionRepository;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;

  public constructor(
    lifeActionRepository: LifeActionRepository,
    decisionRepository: DecisionRepository,
    clock: Clock,
    idGenerator: IdGenerator,
    readonly planning?: {
      readonly goalRepository: GoalRepository;
      readonly unitOfWork: JournalUnitOfWork;
    },
  ) {
    this.#lifeActionRepository = lifeActionRepository;
    this.#decisionRepository = decisionRepository;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
  }

  public async execute(
    input: CreateLifeActionDraftInput,
  ): Promise<Result<LifeAction, DomainError>> {
    if (
      (input.isNext || input.recurrence || input.contributions?.length) &&
      this.planning === undefined
    )
      return failure(
        new DomainError('life_action.planning_unavailable', 'Выбор главного действия недоступен.'),
      );
    if (
      input.goalId != null &&
      (this.planning === undefined ||
        (await this.planning.goalRepository.findById(input.goalId)) === null)
    ) {
      return failure(new DomainError('goal.not_found', 'Цель не найдена.'));
    }
    let inheritedSphereId: EntityId | null = null;
    if (input.decisionId !== undefined) {
      const decision = await this.#decisionRepository.findById(input.decisionId);

      if (decision === null) {
        return decisionNotFoundForLifeAction();
      }

      const statusAllowsNewLifeAction =
        decision.status === DECISION_STATUS.draft ||
        decision.status === DECISION_STATUS.planned ||
        decision.status === DECISION_STATUS.inProgress;

      if (decision.isArchived() || decision.isDeleted() || !statusAllowsNewLifeAction) {
        return decisionUnavailableForLifeAction();
      }
      inheritedSphereId = decision.sphereId;
    }

    try {
      const lifeAction = LifeAction.createDraft({
        id: this.#idGenerator.generate(),
        title: input.title,
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.decisionId === undefined ? {} : { decisionId: input.decisionId }),
        sphereId: input.sphereId === undefined ? inheritedSphereId : input.sphereId,
        goalId: input.goalId ?? null,
        plannedDate: input.plannedDate ?? null,
        isNext: input.isNext ?? false,
        createdAt: this.#clock.now(),
        eventId: this.#idGenerator.generate(),
      });

      for (const link of input.contributions ?? []) {
        const goal = await this.planning?.goalRepository.findById(
          PlanningEntityId.create(link.goalId),
        );
        if (!goal?.measurement)
          throw new DomainError(
            'progress.measurement_required',
            'Выберите измеримую цель для вклада.',
          );
      }
      const setup = actionPlanningSetup(
        lifeAction,
        input.recurrence ?? null,
        input.contributions ?? [],
        this.#clock.now(),
      );
      if (this.planning === undefined) {
        await this.#lifeActionRepository.save(lifeAction);
      } else {
        const previous =
          lifeAction.isNext && lifeAction.plannedDate !== null
            ? await clearPreviousMainActions(
                this.#lifeActionRepository,
                lifeAction.plannedDate,
                lifeAction,
              )
            : [];
        await this.planning.unitOfWork.commit({
          ...(lifeAction.isNext && lifeAction.plannedDate !== null
            ? { mainActionDate: lifeAction.plannedDate }
            : {}),
          lifeActions: [...previous, { lifeAction, expectedVersion: null }],
          journalEntries: [],
          planningSetup: setup,
        });
      }
      return success(lifeAction);
    } catch (error: unknown) {
      return lifeActionDomainFailure(error);
    }
  }
}
