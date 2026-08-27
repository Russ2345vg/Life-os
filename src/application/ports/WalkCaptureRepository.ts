import type { EntityId, WalkCapture } from '../../domain';

export interface WalkCaptureRepository {
  insert(capture: WalkCapture): Promise<void>;
  findById(id: EntityId): Promise<WalkCapture | null>;
  findPending(): Promise<readonly WalkCapture[]>;
  findByWalkId(walkId: EntityId): Promise<readonly WalkCapture[]>;
  updateIfVersionMatches(capture: WalkCapture, expectedVersion: number): Promise<boolean>;
}
