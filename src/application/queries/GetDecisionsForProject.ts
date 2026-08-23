import type { Decision, EntityId } from '../../domain';
import type { DecisionsByProjectReader } from '../ports/DecisionsByProjectReader';

export class GetDecisionsForProject {
  public constructor(readonly repository: DecisionsByProjectReader) {}

  public async execute(projectId: EntityId): Promise<readonly Decision[]> {
    return this.repository.findByProjectId(projectId);
  }
}
