import {
  DayDate,
  DECISION_KIND,
  DECISION_STATUS,
  LIFE_ACTION_STATUS,
  type Decision,
  type EntityId,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import type { Clock } from '../ports/Clock';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { DecisionRescheduleUnitOfWork } from '../ports/DecisionRescheduleUnitOfWork';
import type { IdGenerator } from '../ports/IdGenerator';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import { domainFailure } from './decisionCommandResult';

export interface RescheduleDecisionSafelyInput {
  readonly decisionId: EntityId;
  readonly expectedVersion: number;
  readonly newPlannedDate: string;
  readonly reason: string;
}

export class RescheduleDecisionSafely {
  readonly #decisionRepository: DecisionRepository;
  readonly #lifeActionRepository: LifeActionRepository;
  readonly #actionSessionRepository: ActionSessionRepository;
  readonly #unitOfWork: DecisionRescheduleUnitOfWork;
  readonly #currentDateProvider: CurrentDateProvider;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;

  public constructor(
    decisionRepository: DecisionRepository,
    lifeActionRepository: LifeActionRepository,
    actionSessionRepository: ActionSessionRepository,
    unitOfWork: DecisionRescheduleUnitOfWork,
    currentDateProvider: CurrentDateProvider,
    clock: Clock,
    idGenerator: IdGenerator,
  ) {
    this.#decisionRepository = decisionRepository;
    this.#lifeActionRepository = lifeActionRepository;
    this.#actionSessionRepository = actionSessionRepository;
    this.#unitOfWork = unitOfWork;
    this.#currentDateProvider = currentDateProvider;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
  }

  public async execute(
    input: RescheduleDecisionSafelyInput,
  ): Promise<Result<Decision, DomainError>> {
    const decision = await this.#decisionRepository.findById(input.decisionId);

    if (decision === null) {
      return failure(new DomainError('decision.not_found', 'Решение не найдено.'));
    }

    if (decision.version !== input.expectedVersion) {
      return failure(
        new DomainError(
          'decision.reschedule_conflict',
          'Решение изменилось в другой вкладке. Обновите карточку и повторите перенос.',
        ),
      );
    }

    if (
      decision.isArchived() ||
      decision.isDeleted() ||
      (decision.status !== DECISION_STATUS.planned &&
        decision.status !== DECISION_STATUS.inProgress) ||
      decision.plannedDate === null
    ) {
      return failure(
        new DomainError('decision.cannot_reschedule', 'Это решение уже нельзя переносить.'),
      );
    }

    if (input.newPlannedDate.trim().length === 0) {
      return failure(new DomainError('decision.planned_date_required', 'Выберите новую дату.'));
    }

    if (input.reason.trim().length === 0) {
      return failure(
        new DomainError('decision.reschedule_reason_required', 'Укажите причину переноса.'),
      );
    }

    try {
      const newPlannedDate = DayDate.create(input.newPlannedDate);
      const previousDate = decision.plannedDate;
      const currentDate = this.#currentDateProvider.getCurrentDate();

      if (newPlannedDate.isBefore(currentDate)) {
        return failure(
          new DomainError(
            'decision.planned_date_in_past',
            'Нельзя перенести решение на прошедшую дату.',
          ),
        );
      }

      if (!newPlannedDate.isAfter(previousDate)) {
        return failure(
          new DomainError(
            'decision.reschedule_date_must_be_later',
            'Новая дата должна быть позже текущей даты решения.',
          ),
        );
      }

      const lifeActions = await this.#lifeActionRepository.findByDecisionId(decision.id);
      const linkedIds = lifeActions.map((lifeAction) => lifeAction.id);
      const unfinishedSession = await this.#actionSessionRepository.findUnfinished();

      if (
        unfinishedSession !== null &&
        linkedIds.some((lifeActionId) => lifeActionId.equals(unfinishedSession.lifeActionId))
      ) {
        return failure(
          new DomainError(
            'decision.session_unfinished',
            'Сначала завершите активную или приостановленную рабочую сессию.',
          ),
        );
      }

      const movableActions = lifeActions.filter(
        (lifeAction) =>
          lifeAction.status === LIFE_ACTION_STATUS.ready ||
          lifeAction.status === LIFE_ACTION_STATUS.inProgress,
      );

      if (
        movableActions.some(
          (lifeAction) =>
            lifeAction.plannedDate === null || !lifeAction.plannedDate.equals(previousDate),
        )
      ) {
        return failure(
          new DomainError(
            'decision.actions_date_mismatch',
            'Одно из незавершённых действий уже относится к другой дате. Сначала согласуйте его дату.',
          ),
        );
      }

      let newOrder: number | null = null;
      if (decision.kind === DECISION_KIND.main) {
        const decisions = await this.#decisionRepository.findByDate(newPlannedDate);
        const occupiedOrders = new Set(
          decisions
            .filter(
              (candidate) =>
                !candidate.id.equals(decision.id) &&
                candidate.kind === DECISION_KIND.main &&
                !candidate.isArchived() &&
                !candidate.isDeleted() &&
                (candidate.status === DECISION_STATUS.planned ||
                  candidate.status === DECISION_STATUS.inProgress),
            )
            .map((candidate) => candidate.order),
        );
        newOrder = [1, 2, 3].find((order) => !occupiedOrders.has(order)) ?? null;

        if (newOrder === null) {
          return failure(
            new DomainError(
              'decision.main_limit_reached',
              'На выбранную дату уже назначены три главных решения.',
            ),
          );
        }
      }

      const occurredAt = this.#clock.now();
      const expectedDecisionVersion = decision.version;
      const actionChanges = movableActions.map((lifeAction) => {
        const expectedVersion = lifeAction.version;
        lifeAction.reschedule(newPlannedDate, occurredAt, this.#idGenerator.generate());
        return { expectedVersion, lifeAction };
      });
      decision.reschedule(
        newPlannedDate,
        input.reason,
        occurredAt,
        this.#idGenerator.generate(),
        newOrder,
      );

      await this.#unitOfWork.commit({
        decision,
        expectedDecisionVersion,
        previousDate,
        newDate: newPlannedDate,
        linkedLifeActionIds: linkedIds,
        movedLifeActions: actionChanges,
      });

      return success(decision);
    } catch (error: unknown) {
      return domainFailure(error);
    }
  }
}
