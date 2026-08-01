import type { ActionSessionRepository } from '../../application';
import type { ActionSession, EntityId } from '../../domain';

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

  public async save(session: ActionSession): Promise<void> {
    this.#sessionsById.set(session.id.toString(), session);
  }
}
