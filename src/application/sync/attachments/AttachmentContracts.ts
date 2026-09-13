export interface AttachmentReference {
  readonly attachmentId: string;
  readonly blobVersion: number;
  readonly keyEpoch: number;
}
export interface SyncBinaryMetadata {
  readonly protocolVersion: 1;
  readonly purpose: 'attachment' | 'snapshot';
  readonly spaceId: string;
  readonly objectId: string;
  readonly keyEpoch: number;
  readonly blobVersion: number;
  readonly snapshotKind: string;
  readonly schemaVersion: number;
}
export interface SyncBinaryEnvelope {
  readonly metadata: SyncBinaryMetadata;
  readonly ciphertext: string;
  readonly nonce: string;
}
export interface SyncBinaryCrypto {
  encryptBinary(metadata: SyncBinaryMetadata, plaintext: string): Promise<SyncBinaryEnvelope>;
  decryptBinary(envelope: SyncBinaryEnvelope): Promise<string>;
}
export interface EncryptedBlobTransport {
  upload(
    bucket: 'lifeos-attachments' | 'lifeos-snapshots',
    path: string,
    bytes: string,
  ): Promise<void>;
  download(bucket: 'lifeos-attachments' | 'lifeos-snapshots', path: string): Promise<string>;
  listSnapshots(spaceId: string): Promise<readonly string[]>;
}
export interface LocalSyncImage {
  readonly dataUrl: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}
export type AttachmentState =
  | 'pending-upload'
  | 'uploading'
  | 'retry-upload'
  | 'uploaded'
  | 'pending-download'
  | 'downloading'
  | 'retry-download'
  | 'available-local'
  | 'quarantined'
  | 'tombstoned';
export interface DurableAttachment extends AttachmentReference {
  readonly cloudVerifiedAt?: string | null;
  readonly spaceId: string;
  readonly parentObjectId: string;
  readonly entityType: 'goal' | 'walk';
  readonly localImage: LocalSyncImage | null;
  readonly localUri: string;
  readonly state: AttachmentState;
  readonly retryCount: number;
  readonly nextAttemptAt: string;
  readonly leaseUntil: string | null;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
  readonly encryptedBlob: string | null;
  readonly integrity: string | null;
  readonly lastErrorCode: string | null;
}

export function attachmentReference(value: unknown): AttachmentReference | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value !== 'object' ||
    !('attachmentId' in value) ||
    !('blobVersion' in value) ||
    !('keyEpoch' in value) ||
    typeof value.attachmentId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.attachmentId,
    ) ||
    !Number.isSafeInteger(value.blobVersion) ||
    Number(value.blobVersion) < 1 ||
    !Number.isSafeInteger(value.keyEpoch) ||
    Number(value.keyEpoch) < 1
  ) {
    throw new Error('Invalid protected attachment reference.');
  }
  return {
    attachmentId: value.attachmentId,
    blobVersion: Number(value.blobVersion),
    keyEpoch: Number(value.keyEpoch),
  };
}

export function binaryMetadata(spaceId: string, ref: AttachmentReference): SyncBinaryMetadata {
  return {
    protocolVersion: 1,
    purpose: 'attachment',
    spaceId,
    objectId: ref.attachmentId,
    keyEpoch: ref.keyEpoch,
    blobVersion: ref.blobVersion,
    snapshotKind: '',
    schemaVersion: 1,
  };
}
export function binaryPath(metadata: SyncBinaryMetadata): string {
  return `${metadata.spaceId}/${metadata.objectId}/${metadata.blobVersion}`;
}
