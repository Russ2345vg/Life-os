import {
  DECISION_KIND,
  DECISION_STATUS,
  type DayDate,
  type Decision,
  type DecisionKind,
  type EntityId,
  type ExpectedResult,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { success, type Result } from '../../shared/result/Result';
import type { MainDecisionLimitPolicy } from '../decision/MainDecisionLimitPolicy';
import type { Clock } from '../ports/Clock';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { IdGenerator } from '../ports/IdGenerator';
import { decisionNotFound, domainFailure } from './decisionCommandResult';

export interface PlanDecisionInput {
  readonly decisionId: EntityId;
  readonly plannedDate: DayDate;
  readonly kind: DecisionKind;
  readonly order?: number | null;
  readonly expectedResult?: ExpectedResult;
}

export class PlanDecision {
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

  public async execute(input: PlanDecisionInput): Promise<Result<Decision, DomainError>> {
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

    if (decision.status !== DECISION_STATUS.draft) {
      return domainFailure(
        new DomainError('decision.plan_requires_draft', 'Планировать можно только черновик.'),
      );
    }

    if (input.kind === DECISION_KIND.main) {
      const limitResult = await this.#limitPolicy.check(decision, input.plannedDate);

      if (!limitResult.ok) {
        return limitResult;
      }
    }

    try {
      decision.plan({
        plannedDate: input.plannedDate,
        kind: input.kind,
        ...(input.order === undefined ? {} : { order: input.order }),
        ...(input.expectedResult === undefined ? {} : { expectedResult: input.expectedResult }),
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
