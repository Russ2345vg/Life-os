import { compareHybridLogicalTimestamp } from './HybridLogicalClock';
import type { PilotOperation } from './PilotSyncProtocol';

export interface PilotVersionMetadata {
  readonly eventId: string;
  readonly revision: number;
  readonly baseRevision: number;
  readonly hlcWallTime: number;
  readonly hlcLogical: number;
  readonly deviceId: string;
  readonly operation: PilotOperation;
}

export type PilotConflictDecision =
  | { readonly kind: 'duplicate' }
  | { readonly kind: 'equivalent' }
  | { readonly kind: 'fast_forward'; readonly winner: 'incoming' }
  | { readonly kind: 'stale'; readonly winner: 'local' }
  | { readonly kind: 'conflict'; readonly winner: 'incoming' | 'local' };

export function resolvePilotConflict(
  local: PilotVersionMetadata | null,
  incoming: PilotVersionMetadata,
): PilotConflictDecision {
  if (local === null) return { kind: 'fast_forward', winner: 'incoming' };
  if (local.eventId === incoming.eventId) return { kind: 'duplicate' };
  if (
    local.operation === 'tombstone' &&
    incoming.operation === 'upsert' &&
    incoming.baseRevision < local.revision
  ) {
    return { kind: 'stale', winner: 'local' };
  }
  if (incoming.revision < local.revision) return { kind: 'stale', winner: 'local' };
  const ordering = compareHybridLogicalTimestamp(
    { wallTime: local.hlcWallTime, logical: local.hlcLogical, deviceId: local.deviceId },
    { wallTime: incoming.hlcWallTime, logical: incoming.hlcLogical, deviceId: incoming.deviceId },
  );
  if (incoming.baseRevision === local.revision) {
    return ordering < 0
      ? { kind: 'fast_forward', winner: 'incoming' }
      : { kind: 'stale', winner: 'local' };
  }
  if (incoming.baseRevision === local.baseRevision && incoming.revision === local.revision) {
    return { kind: 'conflict', winner: ordering < 0 ? 'incoming' : 'local' };
  }
  return { kind: 'conflict', winner: ordering < 0 ? 'incoming' : 'local' };
}
