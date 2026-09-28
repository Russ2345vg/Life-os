import type { ActionSession, EntityId } from '../../domain';

export interface ActionSessionRepository {
  all(): Promise<readonly ActionSession[]>;
  findById(id: EntityId): Promise<ActionSession | null>;
}
