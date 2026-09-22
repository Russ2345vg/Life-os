import type { PilotEntityType } from '../pilot';
import type { DurableAttachment, SyncBinaryMetadata } from '../attachments/AttachmentContracts';

export type RecoverySnapshotKind = 'manual' | 'daily' | 'weekly' | 'pre-restore' | 'pre-sign-out';
export interface RecoveryItem {
  readonly entityType: PilotEntityType;
  readonly record: Readonly<Record<string, unknown>>;
}
export interface RecoveryState {
  readonly schemaVersion: 1;
  readonly items: readonly RecoveryItem[];
}
export interface RecoveryHistoryItem {
  readonly label?: string | null;
  readonly resolvedAt?: string | null;
  readonly id: string;
  readonly entityType: PilotEntityType;
  readonly objectId: string;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly recoverable: boolean;
}
export interface RecoverySnapshot {
  readonly snapshotId: string;
  readonly kind: RecoverySnapshotKind;
  readonly spaceId: string;
  readonly createdAt: string;
  readonly metadata: SyncBinaryMetadata;
  readonly encryptedBlob: string;
  readonly sha256: string;
  readonly verifiedAt: string | null;
  readonly cloudVerifiedAt: string | null;
  readonly retainedUntil: string | null;
  readonly nextAttemptAt: string;
  readonly retryCount: number;
}
export interface RestorePreview {
  readonly snapshot: RecoverySnapshot;
  readonly currentFingerprint: string;
  readonly schemaCompatible: boolean;
  readonly entityCounts: Readonly<Record<string, number>>;
  readonly added: number;
  readonly changed: number;
  readonly deleted: number;
  readonly attachments: number;
  readonly availableAttachments: number;
}
export interface RecoveryDataStore {
  normalize?(state: RecoveryState): RecoveryState;
  context(): Promise<{ readonly spaceId: string; readonly keyEpoch: number }>;
  readState(): Promise<RecoveryState>;
  validate(state: unknown): asserts state is RecoveryState;
  apply(
    state: RecoveryState,
    expected: string,
    exact: boolean,
    history?: { readonly kind: 'conflicts' | 'deleted'; readonly id: string },
  ): Promise<void>;
  history(kind: 'conflicts' | 'deleted'): Promise<readonly RecoveryHistoryItem[]>;
  inspect(kind: 'conflicts' | 'deleted', id: string): Promise<RecoveryItem>;
  snapshots(): Promise<readonly RecoverySnapshot[]>;
  saveSnapshot(snapshot: RecoverySnapshot): Promise<void>;
  attachments(): Promise<readonly DurableAttachment[]>;
}
export interface SyncRecovery {
  listHistory(kind: 'conflicts' | 'deleted'): Promise<readonly RecoveryHistoryItem[]>;
  inspect(kind: 'conflicts' | 'deleted', id: string): Promise<RecoveryItem>;
  restoreHistory(kind: 'conflicts' | 'deleted', id: string): Promise<void>;
  listSnapshots(): Promise<readonly RecoverySnapshot[]>;
  createSnapshot(kind?: RecoverySnapshotKind): Promise<RecoverySnapshot>;
  ensureCloudVerified(snapshotId: string): Promise<RecoverySnapshot>;
  preview(snapshotId: string): Promise<RestorePreview>;
  restore(preview: RestorePreview): Promise<void>;
  listAttachments(): Promise<readonly DurableAttachment[]>;
  retryAttachment(id: string): Promise<void>;
  runMaintenance(): Promise<void>;
}
