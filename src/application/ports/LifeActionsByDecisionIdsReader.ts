import type { EntityId, LifeAction } from '../../domain';

export interface LifeActionsByDecisionIdsReader {
  findByDecisionIds(decisionIds: readonly EntityId[]): Promise<readonly LifeAction[]>;
}
