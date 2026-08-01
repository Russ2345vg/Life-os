import { DECISION_KIND, type DayDate, type Decision } from '../../domain';
import type { DecisionRepository } from '../ports/DecisionRepository';

export class GetDecisionsForDate {
  readonly #repository: DecisionRepository;

  public constructor(repository: DecisionRepository) {
    this.#repository = repository;
  }

  public async execute(date: DayDate): Promise<readonly Decision[]> {
    const decisions = await this.#repository.findByDate(date);

    return [...decisions].sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === DECISION_KIND.main ? -1 : 1;
      }

      if (left.kind === DECISION_KIND.main) {
        return (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER);
      }

      return 0;
    });
  }
}
