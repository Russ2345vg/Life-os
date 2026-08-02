import type { ActionSession, EntityId } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';

export class GetActionSessionById {
  readonly #repository: ActionSessionRepository;

  public constructor(repository: ActionSessionRepository) {
    this.#repository = repository;
  }

  public async execute(sessionId: EntityId): Promise<Result<ActionSession, DomainError>> {
    const session = await this.#repository.findById(sessionId);

    if (session === null) {
      return failure(new DomainError('session.not_found', 'Action session not found.'));
    }

    return success(session);
  }
}
