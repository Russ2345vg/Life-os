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
import type { JournalUnitOfWork } from '../ports/JournalUnitOfWork';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import { createWorkSessionJournalEntries } from '../journal/createJournalEntries';

export interface CompleteActionSessionInput {
  readonly sessionId: EntityId;
  readonly completionKind: SessionCompletionKind;
  readonly resultNote?: string;
}

export class CompleteActionSession {
  readonly #repository: ActionSessionRepository;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;
  readonly #lifeActionRepository: LifeActionRepository | null;
  readonly #journalUnitOfWork: JournalUnitOfWork | null;

  public constructor(
    repository: ActionSessionRepository,
    clock: Clock,
    idGenerator: IdGenerator,
    lifeActionRepository?: LifeActionRepository,
    journalUnitOfWork?: JournalUnitOfWork,
  ) {
    this.#repository = repository;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
    this.#lifeActionRepository = lifeActionRepository ?? null;
    this.#journalUnitOfWork = journalUnitOfWork ?? null;
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
        if (this.#journalUnitOfWork === null) {
          await this.#repository.save(session);
        } else {
          const lifeAction =
            this.#lifeActionRepository === null
              ? null
              : await this.#lifeActionRepository.findById(session.lifeActionId);
          await this.#journalUnitOfWork.commit({
            workSessions: [{ workSession: session, expectedVersion: initialVersion }],
            journalEntries: createWorkSessionJournalEntries(session, lifeAction),
          });
        }
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
