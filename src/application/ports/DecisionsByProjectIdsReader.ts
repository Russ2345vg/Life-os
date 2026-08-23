import type { Decision, EntityId } from '../../domain';

export interface DecisionsByProjectIdsReader {
  findByProjectIds(projectIds: readonly EntityId[]): Promise<readonly Decision[]>;
}
