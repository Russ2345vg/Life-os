import type { ActionSession, EntityId } from '../../domain';

export interface ActionSessionsByLifeActionIdsReader {
  findByLifeActionIds(lifeActionIds: readonly EntityId[]): Promise<readonly ActionSession[]>;
}
