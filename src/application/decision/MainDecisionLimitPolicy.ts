import {
  DECISION_KIND,
  DECISION_STATUS,
  type DayDate,
  type Decision,
  type EntityId,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { DecisionRepository } from '../ports/DecisionRepository';

const MAXIMUM_ACTIVE_MAIN_DECISIONS = 3;

export class MainDecisionLimitPolicy {
  readonly #repository: DecisionRepository;

  public constructor(repository: DecisionRepository) {
    this.#repository = repository;
  }

  public async check(decision: Decision, plannedDate: DayDate): Promise<Result<void, DomainError>> {
    const decisions = await this.#repository.findByDate(plannedDate);
    const availableOrder = this.findFirstAvailableOrder(decisions, decision.id);

    if (!availableOrder.ok) {
      return availableOrder;
    }

    return success(undefined);
  }

  public findFirstAvailableOrder(
    decisions: readonly Decision[],
    excludedDecisionId?: EntityId,
  ): Result<number, DomainError> {
    const activeMainDecisions = decisions.filter(
      (decision) =>
        (excludedDecisionId === undefined || !decision.id.equals(excludedDecisionId)) &&
        decision.kind === DECISION_KIND.main &&
        !decision.isArchived() &&
        (decision.status === DECISION_STATUS.planned ||
          decision.status === DECISION_STATUS.inProgress),
    );

    if (activeMainDecisions.length >= MAXIMUM_ACTIVE_MAIN_DECISIONS) {
      return mainDecisionLimitReached();
    }

    const occupiedOrders = new Set(activeMainDecisions.map((decision) => decision.order));
    const availableOrder = [1, 2, 3].find((order) => !occupiedOrders.has(order));

    return availableOrder === undefined ? mainDecisionLimitReached() : success(availableOrder);
  }
}

function mainDecisionLimitReached() {
  return failure(
    new DomainError(
      'decision.main_limit_reached',
      'На выбранную дату уже назначены три активных главных решения.',
    ),
  );
}
