import type { AttachmentState } from './attachments/AttachmentContracts';

export interface SyncAttachmentStatus {
  readonly attachmentId: string;
  readonly parentObjectId: string;
  readonly entityType: 'goal' | 'walk';
  readonly state: AttachmentState;
  readonly localAvailable: boolean;
}

/** Metadata-only projection; never contains content, encrypted blobs or secrets. */
export interface SyncStatusSnapshot {
  readonly cursor?: number | null;
  readonly setupIssue?: 'pending' | 'revoked' | 'rotation-pending' | null;
  readonly configured: boolean;
  readonly pending: number;
  readonly conflicts: number;
  readonly quarantined: number;
  readonly deferred: number;
  readonly attachments: readonly SyncAttachmentStatus[];
  readonly pendingBackups: number;
  readonly failedBackups: number;
}

export interface SyncStatusSource {
  read(): Promise<SyncStatusSnapshot>;
  subscribe(listener: (stores: readonly string[]) => void): () => void;
}
