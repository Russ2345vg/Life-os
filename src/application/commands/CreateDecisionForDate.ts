import {
  DECISION_KIND,
  Decision,
  DecisionTitle,
  ExpectedResult,
  type DayDate,
  type DecisionKind,
} from '../../domain';
import type { DomainError } from '../../shared/errors/DomainError';
import { success, type Result } from '../../shared/result/Result';
import type { MainDecisionLimitPolicy } from '../decision/MainDecisionLimitPolicy';
import type { Clock } from '../ports/Clock';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { IdGenerator } from '../ports/IdGenerator';
import { domainFailure } from './decisionCommandResult';

export interface CreateDecisionForDateInput {
  readonly title: string;
  readonly kind: DecisionKind;
  readonly plannedDate: DayDate;
  readonly expectedResult?: string;
}

export class CreateDecisionForDate {
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

  public async execute(input: CreateDecisionForDateInput): Promise<Result<Decision, DomainError>> {
    const decisions = await this.#repository.findByDate(input.plannedDate);
    let order: number | null = null;

    if (input.kind === DECISION_KIND.main) {
      const orderResult = this.#limitPolicy.findFirstAvailableOrder(decisions);

      if (!orderResult.ok) {
        return orderResult;
      }

      order = orderResult.value;
    }

    try {
      const occurredAt = this.#clock.now();
      const decisionId = this.#idGenerator.generate();
      const draftEventId = this.#idGenerator.generate();
      const plannedEventId = this.#idGenerator.generate();
      const expectedResult = normalizeExpectedResult(input.expectedResult);
      const decision = Decision.createDraft({
        id: decisionId,
        title: DecisionTitle.create(input.title),
        kind: input.kind,
        ...(expectedResult === undefined ? {} : { expectedResult }),
        occurredAt,
        eventId: draftEventId,
      });

      decision.plan({
        plannedDate: input.plannedDate,
        kind: input.kind,
        ...(order === null ? {} : { order }),
        ...(expectedResult === undefined ? {} : { expectedResult }),
        occurredAt,
        eventId: plannedEventId,
      });

      await this.#repository.save(decision);
      return success(decision);
    } catch (error: unknown) {
      return domainFailure(error);
    }
  }
}

function normalizeExpectedResult(value: string | undefined): ExpectedResult | undefined {
  return value === undefined || value.trim().length === 0
    ? undefined
    : ExpectedResult.create(value);
}
