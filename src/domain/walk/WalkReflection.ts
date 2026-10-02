import type { WalkImpact } from './WalkImpact';
import type { WalkStateSnapshot } from './WalkStateSnapshot';

export interface WalkReflectionData {
  readonly result: string | null;
  readonly afterState: WalkStateSnapshot | null;
  readonly impact: WalkImpact | null;
  readonly updatedAt: Date;
}
