import type { Direction } from '../../domain';
import type { DirectionRepository } from '../ports/DirectionRepository';

export class GetDirections {
  public constructor(readonly repository: DirectionRepository) {}
  public execute(): Promise<readonly Direction[]> {
    return this.repository.findAll();
  }
}
