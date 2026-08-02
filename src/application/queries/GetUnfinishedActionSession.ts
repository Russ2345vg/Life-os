import type { ActionSession } from '../../domain';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';

export class GetUnfinishedActionSession {
  readonly #repository: ActionSessionRepository;

  public constructor(repository: ActionSessionRepository) {
    this.#repository = repository;
  }

  public async execute(): Promise<ActionSession | null> {
    return this.#repository.findUnfinished();
  }
}
