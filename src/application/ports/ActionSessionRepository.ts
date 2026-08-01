import type { ActionSession, EntityId } from '../../domain';

export interface ActionSessionRepository {
  findById(id: EntityId): Promise<ActionSession | null>;
  findByLifeActionId(lifeActionId: EntityId): Promise<readonly ActionSession[]>;
  save(session: ActionSession): Promise<void>;
}
