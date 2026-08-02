import {
  DECISION_KIND,
  DECISION_STATUS,
  DecisionTitle,
  ExpectedResult,
  type Decision,
  type EntityId,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { IdGenerator } from '../ports/IdGenerator';
import { domainFailure } from './decisionCommandResult';

export interface UpdateDecisionDetailsInput {
  readonly decisionId: EntityId;
  readonly title: string;
  readonly expectedResult: string;
}

export class UpdateDecisionDetails {
  readonly #decisionRepository: DecisionRepository;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;

  public constructor(
    decisionRepository: DecisionRepository,
    clock: Clock,
    idGenerator: IdGenerator,
  ) {
    this.#decisionRepository = decisionRepository;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
  }

  public async execute(input: UpdateDecisionDetailsInput): Promise<Result<Decision, DomainError>> {
    const decision = await this.#decisionRepository.findById(input.decisionId);

    if (decision === null) {
      return failure(new DomainError('decision.not_found', 'Решение не найдено.'));
    }

    if (decision.isArchived() || decision.status !== DECISION_STATUS.planned) {
      return failure(
        new DomainError('decision.cannot_edit', 'Это решение уже нельзя редактировать.'),
      );
    }

    if (input.title.trim().length === 0) {
      return failure(new DomainError('decision.title_required', 'Введите название решения.'));
    }

    if (decision.kind === DECISION_KIND.main && input.expectedResult.trim().length === 0) {
      return failure(
        new DomainError('decision.expected_result_required', 'Укажите ожидаемый результат.'),
      );
    }

    try {
      const title = DecisionTitle.create(input.title);
      const expectedResult =
        input.expectedResult.trim().length === 0
          ? null
          : ExpectedResult.create(input.expectedResult);

      if (
        decision.title.equals(title) &&
        (decision.expectedResult === null
          ? expectedResult === null
          : expectedResult !== null && decision.expectedResult.equals(expectedResult))
      ) {
        return success(decision);
      }

      decision.updateDetails({
        title,
        expectedResult,
        occurredAt: this.#clock.now(),
        eventId: this.#idGenerator.generate(),
      });
      await this.#decisionRepository.save(decision);
      return success(decision);
    } catch (error: unknown) {
      return domainFailure(error);
    }
  }
}
