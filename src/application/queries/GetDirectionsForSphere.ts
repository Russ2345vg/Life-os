import type { Direction, EntityId } from '../../domain';
import type { DirectionRepository } from '../ports/DirectionRepository';

export class GetDirectionsForSphere {
  public constructor(readonly repository: DirectionRepository) {}
  public execute(sphereId: EntityId): Promise<readonly Direction[]> {
    return this.repository.findBySphereId(sphereId);
  }
}
