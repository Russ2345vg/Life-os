import { DECISION_KIND, DECISION_STATUS, type DayDate, type Decision } from '../../domain';
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
    const activeMainDecisionCount = decisions.filter(
      (existingDecision) =>
        !existingDecision.id.equals(decision.id) &&
        existingDecision.kind === DECISION_KIND.main &&
        !existingDecision.isArchived() &&
        (existingDecision.status === DECISION_STATUS.planned ||
          existingDecision.status === DECISION_STATUS.inProgress),
    ).length;

    if (activeMainDecisionCount >= MAXIMUM_ACTIVE_MAIN_DECISIONS) {
      return failure(
        new DomainError(
          'decision.main_limit_reached',
          'На выбранную дату уже назначены три активных главных решения.',
        ),
      );
    }

    return success(undefined);
  }
}
