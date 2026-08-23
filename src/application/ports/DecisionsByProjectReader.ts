import type { Decision, EntityId } from '../../domain';

export interface DecisionsByProjectReader {
  findByProjectId(projectId: EntityId): Promise<readonly Decision[]>;
}
