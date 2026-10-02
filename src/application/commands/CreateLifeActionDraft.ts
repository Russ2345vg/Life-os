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
import type { DirectionRepository } from '../ports/DirectionRepository';
import type { GoalRepository } from '../ports/GoalRepository';
import type { JournalUnitOfWork, CommitJournalStateInput } from '../ports/JournalUnitOfWork';
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
  readonly walkPlan?: import('../../domain/walk/WalkPlanMetadata').WalkPlanMetadata | null;
  readonly recurrence?: RecurrenceInput | null;
  readonly contributions?: readonly ActionContributionInput[];
  readonly title: LifeActionTitle;
  readonly need?: string | null;
  readonly description?: string;
  readonly decisionId?: EntityId;
  readonly sphereId?: EntityId | null;
  readonly directionId?: EntityId | null;
  readonly goalId?: EntityId | null;
  readonly parentActionId?: EntityId | null;
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
      readonly directionRepository?: DirectionRepository;
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
    const prepared = await this.prepare(input);
    if (!prepared.ok) return prepared;
    try {
      if (this.planning) await this.planning.unitOfWork.commit(prepared.value.commit);
      else await this.#lifeActionRepository.save(prepared.value.action);
      return success(prepared.value.action);
    } catch (error: unknown) {
      return lifeActionDomainFailure(error);
    }
  }

  public async prepare(
    input: CreateLifeActionDraftInput,
    identity?: EntityId,
  ): Promise<Result<{ action: LifeAction; commit: CommitJournalStateInput }, DomainError>> {
    if (
      (input.isNext || input.recurrence || input.contributions?.length || input.parentActionId) &&
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
    if (input.parentActionId) {
      const parent = await this.#lifeActionRepository.findById(input.parentActionId);
      if (!parent || parent.isArchived())
        return failure(
          new DomainError('life_action.parent_missing', 'Родительское действие не найдено.'),
        );
      if (parent.parentActionId)
        return failure(
          new DomainError(
            'life_action.hierarchy_depth',
            'Поддействия поддерживают только один уровень.',
          ),
        );
    }
    const goal = input.goalId ? await this.planning?.goalRepository.findById(input.goalId) : null;
    const directionId = goal?.directionId ?? input.directionId ?? null;
    if (goal && input.directionId && !goal.directionId?.equals(input.directionId))
      return failure(
        new DomainError('life_action.context_conflict', 'Цель принадлежит другому направлению.'),
      );
    const direction = directionId
      ? await this.planning?.directionRepository?.findById(directionId)
      : null;
    if (directionId && (!direction || direction.status === 'archived'))
      return failure(new DomainError('direction.not_found', 'Направление недоступно.'));
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
        walkPlan: input.walkPlan ?? null,
        id: identity ?? this.#idGenerator.generate(),
        title: input.title,
        ...(input.need === undefined ? {} : { need: input.need }),
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.decisionId === undefined ? {} : { decisionId: input.decisionId }),
        sphereId:
          direction?.sphereId ??
          goal?.sphereId ??
          (input.sphereId === undefined ? inheritedSphereId : input.sphereId),
        directionId: input.goalId ? null : directionId,
        goalId: input.goalId ?? null,
        parentActionId: input.parentActionId ?? null,
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
      const previous =
        lifeAction.isNext && lifeAction.plannedDate !== null
          ? await clearPreviousMainActions(
              this.#lifeActionRepository,
              lifeAction.plannedDate,
              lifeAction,
            )
          : [];
      const commit: CommitJournalStateInput = {
        ...(lifeAction.isNext && lifeAction.plannedDate !== null
          ? { mainActionDate: lifeAction.plannedDate }
          : {}),
        lifeActions: [...previous, { lifeAction, expectedVersion: null }],
        journalEntries: [],
        planningSetup: setup,
      };
      return success({ action: lifeAction, commit });
    } catch (error: unknown) {
      return lifeActionDomainFailure(error);
    }
  }
}
