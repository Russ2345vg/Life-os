import type { ActionSessionRepository } from '../../application';
import type { ActionSession, EntityId } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';

export class InMemoryActionSessionRepository implements ActionSessionRepository {
  readonly #sessionsById = new Map<string, ActionSession>();

  public async findById(id: EntityId): Promise<ActionSession | null> {
    return this.#sessionsById.get(id.toString()) ?? null;
  }

  public async findByLifeActionId(lifeActionId: EntityId): Promise<readonly ActionSession[]> {
    return [...this.#sessionsById.values()].filter((session) =>
      session.lifeActionId.equals(lifeActionId),
    );
  }

  public async findAll(): Promise<readonly ActionSession[]> {
    return [...this.#sessionsById.values()];
  }

  public async findUnfinished(): Promise<ActionSession | null> {
    const unfinishedSessions = [...this.#sessionsById.values()].filter(
      (session) => session.isRunning() || session.isPaused(),
    );

    if (unfinishedSessions.length > 1) {
      throw new DomainError(
        'session.multiple_unfinished_detected',
        'Обнаружено несколько незавершённых сессий.',
      );
    }

    return unfinishedSessions[0] ?? null;
  }

  public async save(session: ActionSession): Promise<void> {
    this.#sessionsById.set(session.id.toString(), session);
  }
}
