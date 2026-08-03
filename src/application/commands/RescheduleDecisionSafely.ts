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
import type { Clock } from '../ports/Clock';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { IdGenerator } from '../ports/IdGenerator';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import { domainFailure } from './decisionCommandResult';

export interface RescheduleDecisionSafelyInput {
  readonly decisionId: EntityId;
  readonly newPlannedDate: string;
}

export class RescheduleDecisionSafely {
  readonly #decisionRepository: DecisionRepository;
  readonly #lifeActionRepository: LifeActionRepository;
  readonly #currentDateProvider: CurrentDateProvider;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;

  public constructor(
    decisionRepository: DecisionRepository,
    lifeActionRepository: LifeActionRepository,
    currentDateProvider: CurrentDateProvider,
    clock: Clock,
    idGenerator: IdGenerator,
  ) {
    this.#decisionRepository = decisionRepository;
    this.#lifeActionRepository = lifeActionRepository;
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

    if (decision.isArchived() || decision.status !== DECISION_STATUS.planned) {
      return failure(
        new DomainError('decision.cannot_reschedule', 'Это решение уже нельзя переносить.'),
      );
    }

    if (input.newPlannedDate.trim().length === 0) {
      return failure(new DomainError('decision.planned_date_required', 'Выберите новую дату.'));
    }

    try {
      const newPlannedDate = DayDate.create(input.newPlannedDate);
      const currentDate = this.#currentDateProvider.getCurrentDate();

      if (newPlannedDate.isBefore(currentDate)) {
        return failure(
          new DomainError(
            'decision.planned_date_in_past',
            'Нельзя перенести решение на прошедшую дату.',
          ),
        );
      }

      if (decision.plannedDate?.equals(newPlannedDate)) {
        return success(decision);
      }

      const lifeActions = await this.#lifeActionRepository.findByDecisionId(decision.id);

      if (
        lifeActions.some(
          (lifeAction) =>
            lifeAction.status === LIFE_ACTION_STATUS.draft ||
            lifeAction.status === LIFE_ACTION_STATUS.inProgress,
        )
      ) {
        return failure(
          new DomainError(
            'decision.actions_block_reschedule',
            'Сначала завершите настройку или выполнение связанных действий.',
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

      decision.reschedule(
        newPlannedDate,
        this.#clock.now(),
        this.#idGenerator.generate(),
        newOrder,
      );
      await this.#decisionRepository.save(decision);
      return success(decision);
    } catch (error: unknown) {
      return domainFailure(error);
    }
  }
}
