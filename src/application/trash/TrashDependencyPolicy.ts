import type { TrashItemType } from './TrashItem';

/** Adapters reuse the authoritative relationship registry, without cascading deletion. */
export interface TrashDependencyPolicy {
  assertCanMove(type: TrashItemType, id: string): Promise<void>;
  assertCanRestore(type: TrashItemType, id: string): Promise<void>;
}
