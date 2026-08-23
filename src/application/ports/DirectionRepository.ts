import type { Direction, EntityId } from '../../domain';

export interface DirectionVersionedUpdate {
  readonly direction: Direction;
  readonly expectedVersion: number;
}

export interface DirectionRepository {
  findById(id: EntityId): Promise<Direction | null>;
  findAll(): Promise<readonly Direction[]>;
  findBySphereId(sphereId: EntityId): Promise<readonly Direction[]>;
  create(direction: Direction): Promise<boolean>;
  updateIfVersionMatches(direction: Direction, expectedVersion: number): Promise<boolean>;
  updateManyIfVersionsMatch(updates: readonly DirectionVersionedUpdate[]): Promise<boolean>;
}
