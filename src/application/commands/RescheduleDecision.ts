import {
  DECISION_KIND,
  DECISION_STATUS,
  type DayDate,
  type Decision,
  type EntityId,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { success, type Result } from '../../shared/result/Result';
import type { MainDecisionLimitPolicy } from '../decision/MainDecisionLimitPolicy';
import type { Clock } from '../ports/Clock';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { IdGenerator } from '../ports/IdGenerator';
import { decisionNotFound, domainFailure } from './decisionCommandResult';

export interface RescheduleDecisionInput {
  readonly decisionId: EntityId;
  readonly newDate: DayDate;
  readonly reason: string;
}

export class RescheduleDecision {
  readonly #repository: DecisionRepository;
  readonly #limitPolicy: MainDecisionLimitPolicy;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;

  public constructor(
    repository: DecisionRepository,
    limitPolicy: MainDecisionLimitPolicy,
    clock: Clock,
    idGenerator: IdGenerator,
  ) {
    this.#repository = repository;
    this.#limitPolicy = limitPolicy;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
  }

  public async execute(input: RescheduleDecisionInput): Promise<Result<Decision, DomainError>> {
    const decision = await this.#repository.findById(input.decisionId);

    if (decision === null) {
      return decisionNotFound();
    }

    const validationFailure = validateReschedule(decision, input.newDate);

    if (validationFailure !== null) {
      return domainFailure(validationFailure);
    }

    if (decision.kind === DECISION_KIND.main) {
      const limitResult = await this.#limitPolicy.check(decision, input.newDate);

      if (!limitResult.ok) {
        return limitResult;
      }
    }

    try {
      decision.reschedule(
        input.newDate,
        input.reason,
        this.#clock.now(),
        this.#idGenerator.generate(),
      );
      await this.#repository.save(decision);
      return success(decision);
    } catch (error: unknown) {
      return domainFailure(error);
    }
  }
}

function validateReschedule(decision: Decision, newDate: DayDate): DomainError | null {
  if (decision.isArchived()) {
    return new DomainError(
      'decision.archived_is_immutable',
      'Архивированное решение нельзя изменять.',
    );
  }

  if (
    (decision.status !== DECISION_STATUS.planned &&
      decision.status !== DECISION_STATUS.inProgress) ||
    decision.plannedDate === null
  ) {
    return new DomainError(
      'decision.reschedule_not_allowed',
      'Перенести можно только запланированное или выполняемое решение.',
    );
  }

  if (decision.plannedDate.equals(newDate)) {
    return new DomainError(
      'decision.reschedule_same_date',
      'Новая дата решения должна отличаться от текущей.',
    );
  }

  return null;
}
