import type { AttachmentState } from './attachments/AttachmentContracts';
import type { AccountSetupState } from './ports/SyncInstallationRepository';

export interface SyncAttachmentStatus {
  readonly attachmentId: string;
  readonly parentObjectId: string;
  readonly entityType: 'goal' | 'walk' | 'memory_event';
  readonly state: AttachmentState;
  readonly localAvailable: boolean;
}

/** Metadata-only projection; never contains content, encrypted blobs or secrets. */
export interface SyncStatusSnapshot {
  readonly accountState: AccountSetupState;
  readonly accountEmail: string | null;
  readonly cursor?: number | null;
  readonly setupIssue?:
    'pending' | 'revoked' | 'rotation-pending' | 'client-update-required' | null;
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
