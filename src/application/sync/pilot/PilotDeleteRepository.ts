import type { PilotEntityType } from './PilotSyncProtocol';

export interface PilotDeleteRepository {
  delete(entityType: PilotEntityType, objectId: string): Promise<boolean>;
}
