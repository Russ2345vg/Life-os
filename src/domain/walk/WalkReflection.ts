import type { WalkImpact } from './WalkImpact';
import type { WalkStateSnapshot } from './WalkStateSnapshot';

export interface WalkReflectionNotes {
  readonly understood: string | null;
  readonly open: string | null;
  readonly next: string | null;
}

export interface WalkReflectionData {
  readonly result: string | null;
  readonly afterState: WalkStateSnapshot | null;
  readonly impact: WalkImpact | null;
  readonly notes?: WalkReflectionNotes | null;
  readonly updatedAt: Date;
}
