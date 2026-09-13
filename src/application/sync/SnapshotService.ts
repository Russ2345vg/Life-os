export type SnapshotVerificationReason =
  'ok' | 'not_found' | 'invalid_format' | 'incomplete' | 'checksum_mismatch';

export interface LocalSnapshotReference {
  readonly snapshotId: string;
  readonly createdAt: string;
  readonly databaseName: string;
  readonly databaseVersion: number;
  readonly recordCount: number;
  readonly sha256: string;
}

export interface SnapshotVerification {
  readonly valid: boolean;
  readonly reason: SnapshotVerificationReason;
  readonly snapshot: LocalSnapshotReference | null;
}

export interface SnapshotService {
  createPreSyncSnapshot(): Promise<LocalSnapshotReference>;
  verifySnapshot(snapshotId: string): Promise<SnapshotVerification>;
}

export interface LocalSnapshotCiphertext {
  readonly ciphertext: string;
  readonly nonce: string;
}

export interface SnapshotPayloadCrypto {
  encryptLocalSnapshot(snapshotId: string, plaintext: string): Promise<LocalSnapshotCiphertext>;
  decryptLocalSnapshot(snapshotId: string, envelope: LocalSnapshotCiphertext): Promise<string>;
}
