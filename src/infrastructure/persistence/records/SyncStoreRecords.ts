import type { PilotRemoteEvent } from '../../../application/sync/ports/PilotSyncTransport';

export interface SyncOutboxRecord {
  readonly logicalObjectId?: string;
  readonly eventId: string;
  readonly entityType: string;
  readonly objectId: string;
  readonly transportObjectId: string;
  readonly baseRevision: number;
  readonly proposedRevision: number;
  readonly operation: 'upsert' | 'tombstone';
  readonly keyEpoch: number;
  readonly hlcWallTime: number;
  readonly hlcLogical: number;
  readonly serializedPayload: string;
  readonly encryptedPayload: string | null;
  readonly encryptedNonce: string | null;
  readonly state: 'pending' | 'sending' | 'quarantined';
  readonly retryCount: number;
  readonly nextAttemptAt: string;
  readonly leaseUntil: string | null;
  readonly lastErrorCode: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SyncObjectMetaRecord {
  readonly retainedRecord?: Readonly<Record<string, unknown>> | null;
  readonly logicalObjectId?: string;
  readonly objectId: string;
  readonly transportObjectId: string;
  readonly eventId: string;
  readonly entityType: string;
  readonly schemaVersion: number;
  readonly revision: number;
  readonly baseRevision: number;
  readonly lastSyncedRevision: number;
  readonly modifiedAt: string;
  readonly modifiedByDevice: string | null;
  readonly keyEpoch: number | null;
  readonly deleted: boolean;
  readonly hlcWallTime: number;
  readonly hlcLogical: number;
  readonly syncStatus: 'local_only' | 'pending' | 'synced' | 'attention';
}

export interface SyncCursorRecord {
  readonly spaceId: string;
  readonly lastSequence: number;
  readonly updatedAt: string;
}

export interface SyncConflictRecord {
  readonly payloadIdentity?: 'local' | 'logical';
  readonly conflictId: string;
  readonly spaceId: string;
  readonly entityType: string;
  readonly objectId: string;
  readonly winningRevision: number;
  readonly losingRevision: number;
  readonly winningEventId: string;
  readonly winningDeviceId: string;
  readonly losingDeviceId: string;
  readonly losingPayload: Readonly<Record<string, unknown>> | null;
  readonly resolutionStatus: 'unresolved' | 'resolved';
  readonly createdAt: string;
  readonly resolvedAt: string | null;
}

export interface SyncDeviceCacheRecord {
  readonly deviceId: string;
  readonly spaceId: string;
  readonly encryptedName: string | null;
  readonly encryptedNameNonce: string | null;
  readonly encryptedNameKeyEpoch: number | null;
  readonly displayName: string;
  readonly platform: 'windows' | 'android';
  readonly publicKey: string;
  readonly status: 'pending' | 'active' | 'revoked';
  readonly createdAt: string;
  readonly activatedAt: string | null;
  readonly lastSeenAt: string | null;
  readonly revokedAt: string | null;
  readonly updatedAt: string;
}

export interface SyncAttachmentQueueRecord {
  readonly attachmentId: string;
  readonly parentObjectId: string;
  readonly entityType: string;
  readonly localUri: string;
  readonly state: 'pending' | 'transferring' | 'complete' | 'quarantined';
  readonly retryCount: number;
  readonly updatedAt: string;
}

export interface SyncSnapshotMetaRecord {
  readonly snapshotId: string;
  readonly kind: 'pre_sync';
  readonly formatVersion: 1;
  readonly databaseName: string;
  readonly databaseVersion: number;
  readonly createdAt: string;
  readonly recordCount: number;
  readonly sha256: string;
  readonly payload: unknown | null;
  readonly serializedPayload: string | null;
  readonly encryptedPayload: string | null;
  readonly encryptedNonce: string | null;
  readonly verifiedAt: string | null;
  readonly status: 'pending' | 'verified';
}

export interface SyncSettingsRecord {
  readonly id: 'sync';
  readonly enabled: false;
  readonly deviceId: string;
  readonly deviceName: string;
  readonly platform: 'windows' | 'android';
  readonly publicKey: string;
  readonly createdAt: string;
  readonly spaceId: string | null;
  readonly membershipStatus: 'pending' | 'active' | 'revoked' | null;
  readonly currentKeyEpoch: number | null;
  readonly recoveryConfirmedAt: string | null;
  readonly snapshotId: string | null;
  readonly setupState:
    'not_configured' | 'recovery_unconfirmed' | 'configured' | 'rotation_pending';
  readonly pendingRevokedDeviceId: string | null;
  readonly updatedAt: string;
}

export interface SyncQuarantineRecord {
  readonly quarantineId: string;
  readonly entityType: string;
  readonly objectId: string | null;
  readonly reason: string;
  readonly encryptedPayload: string | null;
  readonly sequence: number | null;
  readonly state: 'attention' | 'deferred';
  readonly createdAt: string;
  readonly spaceId?: string | null;
  readonly deferredEvent?: PilotRemoteEvent | null;
}

export interface SyncAppliedEventRecord {
  readonly eventId: string;
  readonly objectId: string;
  readonly revision: number;
  readonly sequence: number;
  readonly appliedAt: string;
}

export interface SyncPilotClockRecord {
  readonly id: 'pilot-clock';
  readonly wallTime: number;
  readonly logical: number;
  readonly updatedAt: string;
}

export interface SyncPilotBootstrapRecord {
  readonly id: 'pilot-bootstrap';
  readonly snapshotId: string;
  readonly status: 'complete';
  readonly completedAt: string;
}

export interface SyncStructuredBootstrapRecord {
  readonly id: 'structured-bootstrap';
  readonly snapshotId: string;
  readonly status: 'in_progress' | 'complete';
  readonly completedAt: string | null;
  readonly updatedAt: string;
}

export interface SyncStructuredBootstrapTypeRecord {
  readonly id: string;
  readonly entityType: string;
  readonly snapshotId: string;
  readonly status: 'complete';
  readonly completedAt: string;
}
