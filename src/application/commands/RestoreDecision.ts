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

export interface RestoreDecisionInput {
  readonly decisionId: EntityId;
  readonly newDate: DayDate;
}

export class RestoreDecision {
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

  public async execute(input: RestoreDecisionInput): Promise<Result<Decision, DomainError>> {
    const decision = await this.#repository.findById(input.decisionId);

    if (decision === null) {
      return decisionNotFound();
    }

    if (decision.isArchived()) {
      return domainFailure(
        new DomainError(
          'decision.archived_is_immutable',
          'Архивированное решение нельзя изменять.',
        ),
      );
    }

    if (decision.status !== DECISION_STATUS.cancelled) {
      return domainFailure(
        new DomainError(
          'decision.restore_requires_cancelled',
          'Восстановить можно только отменённое решение.',
        ),
      );
    }

    if (decision.kind === DECISION_KIND.main) {
      const limitResult = await this.#limitPolicy.check(decision, input.newDate);

      if (!limitResult.ok) {
        return limitResult;
      }
    }

    try {
      decision.restore({
        plannedDate: input.newDate,
        occurredAt: this.#clock.now(),
        eventId: this.#idGenerator.generate(),
      });
      await this.#repository.save(decision);
      return success(decision);
    } catch (error: unknown) {
      return domainFailure(error);
    }
  }
}
