import type { ActionSession, EntityId } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';

export interface PauseActionSessionInput {
  readonly sessionId: EntityId;
}

export class PauseActionSession {
  readonly #repository: ActionSessionRepository;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;

  public constructor(repository: ActionSessionRepository, clock: Clock, idGenerator: IdGenerator) {
    this.#repository = repository;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
  }

  public async execute(
    input: PauseActionSessionInput,
  ): Promise<Result<ActionSession, DomainError>> {
    const session = await this.#repository.findById(input.sessionId);

    if (session === null) {
      return failure(new DomainError('session.not_found', 'Сессия не найдена.'));
    }

    const initialVersion = session.version;

    try {
      session.pause(this.#clock.now(), this.#idGenerator.generate());

      if (session.version !== initialVersion) {
        await this.#repository.save(session);
      }

      return success(session);
    } catch (error: unknown) {
      if (error instanceof DomainError) {
        return failure(error);
      }

      throw error;
    }
  }
}
