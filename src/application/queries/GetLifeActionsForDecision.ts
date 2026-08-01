import type { EntityId, LifeAction } from '../../domain';
import type { LifeActionRepository } from '../ports/LifeActionRepository';

export class GetLifeActionsForDecision {
  readonly #repository: LifeActionRepository;

  public constructor(repository: LifeActionRepository) {
    this.#repository = repository;
  }

  public async execute(decisionId: EntityId): Promise<readonly LifeAction[]> {
    const lifeActions = await this.#repository.findByDecisionId(decisionId);

    return [...lifeActions].sort(
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
    );
  }
}
