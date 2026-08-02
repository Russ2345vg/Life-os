import type { Decision, EntityId } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { DecisionRepository } from '../ports/DecisionRepository';

export class GetDecisionById {
  readonly #repository: DecisionRepository;

  public constructor(repository: DecisionRepository) {
    this.#repository = repository;
  }

  public async execute(decisionId: EntityId): Promise<Result<Decision, DomainError>> {
    const decision = await this.#repository.findById(decisionId);

    if (decision === null) {
      return failure(new DomainError('decision.not_found', 'Решение не найдено.'));
    }

    return success(decision);
  }
}
