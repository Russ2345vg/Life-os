import { Decision, type DecisionKind, type DecisionTitle, type ExpectedResult } from '../../domain';
import type { DomainError } from '../../shared/errors/DomainError';
import { success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { IdGenerator } from '../ports/IdGenerator';
import { domainFailure } from './decisionCommandResult';

export interface CreateDecisionDraftInput {
  readonly title: DecisionTitle;
  readonly kind: DecisionKind;
  readonly reason?: string;
  readonly expectedResult?: ExpectedResult;
}

export class CreateDecisionDraft {
  readonly #repository: DecisionRepository;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;

  public constructor(repository: DecisionRepository, clock: Clock, idGenerator: IdGenerator) {
    this.#repository = repository;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
  }

  public async execute(input: CreateDecisionDraftInput): Promise<Result<Decision, DomainError>> {
    try {
      const decision = Decision.createDraft({
        id: this.#idGenerator.generate(),
        title: input.title,
        kind: input.kind,
        ...(input.reason === undefined ? {} : { reason: input.reason }),
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
