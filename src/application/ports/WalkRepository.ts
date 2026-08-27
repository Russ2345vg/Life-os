import type { DayDate, EntityId, Walk } from '../../domain';

export type StartWalkPersistenceResult = 'saved' | 'versionConflict' | 'runningExists';

export interface WalkRepository {
  findById(id: EntityId): Promise<Walk | null>;
  findAll(): Promise<readonly Walk[]>;
  findByDate(date: DayDate): Promise<readonly Walk[]>;
  findRunning(): Promise<Walk | null>;
  findActive(): Promise<Walk | null>;
  save(walk: Walk): Promise<void>;
  startIfVersionMatches(walk: Walk, expectedVersion: number): Promise<StartWalkPersistenceResult>;
  updateIfVersionMatches(walk: Walk, expectedVersion: number): Promise<boolean>;
  deleteIfVersionMatches(id: EntityId, expectedVersion: number): Promise<boolean>;
}
