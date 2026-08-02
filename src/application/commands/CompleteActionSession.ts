import {
  SessionResultNote,
  type ActionSession,
  type EntityId,
  type SessionCompletionKind,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';

export interface CompleteActionSessionInput {
  readonly sessionId: EntityId;
  readonly completionKind: SessionCompletionKind;
  readonly resultNote?: string;
}

export class CompleteActionSession {
  readonly #repository: ActionSessionRepository;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;

  public constructor(repository: ActionSessionRepository, clock: Clock, idGenerator: IdGenerator) {
    this.#repository = repository;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
  }

  public async execute(
    input: CompleteActionSessionInput,
  ): Promise<Result<ActionSession, DomainError>> {
    const session = await this.#repository.findById(input.sessionId);

    if (session === null) {
      return failure(new DomainError('session.not_found', 'Сессия не найдена.'));
    }

    const initialVersion = session.version;

    try {
      const completedAt = this.#clock.now();
      const eventId = this.#idGenerator.generate();
      const resultNote = createResultNote(input.resultNote);

      session.complete({
        completedAt,
        completionKind: input.completionKind,
        eventId,
        ...(resultNote === undefined ? {} : { resultNote }),
      });

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

function createResultNote(value: string | undefined): SessionResultNote | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  return SessionResultNote.create(value);
}
