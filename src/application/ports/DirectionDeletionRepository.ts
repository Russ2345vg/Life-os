import type { PilotEntityType } from '../sync/pilot/PilotSyncProtocol';

export interface DirectionDependency {
  readonly entityType: PilotEntityType;
  readonly objectId: string;
  readonly label: string;
  readonly relation: 'live' | 'historical';
}

export interface DirectionDeletionResult {
  readonly kind: 'deleted' | 'archived' | 'blocked' | 'not_found' | 'version_conflict';
  readonly live: readonly DirectionDependency[];
  readonly historical: readonly DirectionDependency[];
}

export interface DirectionDeletionRepository {
  inspect(id: string, today: string): Promise<DirectionDeletionResult>;
  remove(
    id: string,
    expectedVersion: number,
    today: string,
    now: Date,
  ): Promise<DirectionDeletionResult>;
}
