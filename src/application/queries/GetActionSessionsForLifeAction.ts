import type { ActionSession, EntityId } from '../../domain';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';

export class GetActionSessionsForLifeAction {
  readonly #repository: ActionSessionRepository;

  public constructor(repository: ActionSessionRepository) {
    this.#repository = repository;
  }

  public async execute(lifeActionId: EntityId): Promise<readonly ActionSession[]> {
    const sessions = await this.#repository.findByLifeActionId(lifeActionId);

    return [...sessions]
      .filter((session) => session.lifeActionId.equals(lifeActionId))
      .sort((left, right) => {
        const startedAtDifference = left.startedAt.getTime() - right.startedAt.getTime();

        if (startedAtDifference !== 0) {
          return startedAtDifference;
        }

        const leftId = left.id.toString();
        const rightId = right.id.toString();

        if (leftId < rightId) {
          return -1;
        }

        if (leftId > rightId) {
          return 1;
        }

        return 0;
      });
  }
}
