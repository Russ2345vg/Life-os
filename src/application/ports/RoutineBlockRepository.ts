import type { EntityId, RoutineBlock } from '../../domain';

export interface RoutineBlockRepository {
  findById(id: EntityId): Promise<RoutineBlock | null>;
  findAll(): Promise<readonly RoutineBlock[]>;
  save(block: RoutineBlock): Promise<void>;
  saveIfVersionMatches(block: RoutineBlock, expectedVersion: number): Promise<boolean>;
  deleteIfVersionMatches(id: EntityId, expectedVersion: number): Promise<boolean>;
}
