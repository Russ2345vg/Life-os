import type { Decision } from '../../domain';
import type { DecisionRepository } from '../ports/DecisionRepository';

export class GetDeletedDecisions {
  readonly #repository: DecisionRepository;

  public constructor(repository: DecisionRepository) {
    this.#repository = repository;
  }

  public async execute(): Promise<readonly Decision[]> {
    const decisions =
      this.#repository.findAll === undefined ? [] : await this.#repository.findAll();

    return decisions
      .filter((decision) => decision.isDeleted())
      .sort((left, right) => (right.deletedAt?.getTime() ?? 0) - (left.deletedAt?.getTime() ?? 0));
  }
}
