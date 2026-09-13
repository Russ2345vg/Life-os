import type { PilotConflictDecision } from '../pilot/PilotConflictResolver';
import type { PilotEntityType, PilotOperation, PilotSyncPayload } from '../pilot/PilotSyncProtocol';
import type { PilotCryptoEnvelope } from './SyncCryptoService';
import type { PilotRemoteEvent } from './PilotSyncTransport';

export interface PilotInstallationState {
  readonly setupState:
    'not_configured' | 'recovery_unconfirmed' | 'configured' | 'rotation_pending';
  readonly membershipStatus: 'pending' | 'active' | 'revoked' | null;
  readonly spaceId: string | null;
  readonly deviceId: string;
  readonly currentKeyEpoch: number | null;
}

export interface PilotOutboxItem {
  readonly eventId: string;
  readonly transportObjectId: string;
  readonly baseRevision: number;
  readonly proposedRevision: number;
  readonly operation: PilotOperation;
  readonly keyEpoch: number;
  readonly hlcWallTime: number;
  readonly hlcLogical: number;
  readonly serializedPayload: string;
  readonly encryptedPayload: string | null;
  readonly encryptedNonce: string | null;
}

export interface PilotLocalVersion {
  readonly eventId: string;
  readonly revision: number;
  readonly baseRevision: number;
  readonly modifiedByDevice: string | null;
  readonly deleted: boolean;
  readonly hlcWallTime: number;
  readonly hlcLogical: number;
}

export interface PilotLocalStateView {
  readonly meta: PilotLocalVersion | null;
  readonly record: Readonly<Record<string, unknown>> | null;
}

export interface PilotSyncStore {
  installation(): Promise<PilotInstallationState | null>;
  counts(): Promise<{
    readonly pending: number;
    readonly conflicts: number;
    readonly quarantined: number;
  }>;
  prepareOutboxForInstallation(input: {
    readonly deviceId: string;
    readonly keyEpoch: number;
  }): Promise<void>;
  rematerializeOutboxEvent(
    eventId: string,
    input: { readonly deviceId: string; readonly keyEpoch: number },
  ): Promise<PilotOutboxItem>;
  lease(limit?: number, leaseMs?: number): Promise<readonly PilotOutboxItem[]>;
  saveEncrypted(eventId: string, envelope: PilotCryptoEnvelope): Promise<PilotOutboxItem>;
  acknowledgePush(eventId: string, sequence: number, isCurrentWinner: boolean): Promise<void>;
  retry(eventId: string, errorCode: string): Promise<void>;
  quarantineOutbox(eventId: string, errorCode: string): Promise<void>;
  localState(
    entityType: PilotEntityType,
    objectId: string,
    incomingRecord?: Readonly<Record<string, unknown>> | null,
  ): Promise<PilotLocalStateView>;
  hasSameSemanticContent(
    entityType: PilotEntityType,
    local: Readonly<Record<string, unknown>>,
    incoming: Readonly<Record<string, unknown>>,
  ): Promise<boolean>;
  hasApplied(eventId: string): Promise<boolean>;
  cursor(spaceId: string): Promise<number>;
  advanceAppliedDuplicate(spaceId: string, sequence: number): Promise<void>;
  deferRemoteEvent(spaceId: string, event: PilotRemoteEvent): Promise<void>;
  deferredRemoteEvents(spaceId: string): Promise<readonly PilotRemoteEvent[]>;
  removeDeferredRemoteEvent(spaceId: string, sequence: number): Promise<void>;
  applyPulled(
    spaceId: string,
    sequence: number,
    payload: PilotSyncPayload,
    transportObjectId: string,
    decision: PilotConflictDecision,
  ): Promise<void>;
  quarantine(sequence: number, reason: string, encryptedPayload: string): Promise<void>;
}
