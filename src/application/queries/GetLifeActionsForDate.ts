import { LIFE_ACTION_STATUS, type DayDate, type LifeAction } from '../../domain';
import type { LifeActionRepository } from '../ports/LifeActionRepository';

const STATUS_ORDER = {
  [LIFE_ACTION_STATUS.inProgress]: 0,
  [LIFE_ACTION_STATUS.ready]: 1,
  [LIFE_ACTION_STATUS.completed]: 2,
  [LIFE_ACTION_STATUS.cancelled]: 3,
  [LIFE_ACTION_STATUS.draft]: 4,
} as const;

export class GetLifeActionsForDate {
  readonly #repository: LifeActionRepository;

  public constructor(repository: LifeActionRepository) {
    this.#repository = repository;
  }

  public async execute(date: DayDate): Promise<readonly LifeAction[]> {
    const lifeActions = await this.#repository.findByDate(date);

    return [...lifeActions].sort((left, right) => {
      const statusDifference = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];

      if (statusDifference !== 0) {
        return statusDifference;
      }

      return left.createdAt.getTime() - right.createdAt.getTime();
    });
  }
}
