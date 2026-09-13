import type { CachedSyncDevice } from './SyncDeviceCacheRepository';
import type { SyncCryptoEnvelope, SyncRecoveryEnvelope } from './SyncCryptoService';
import type { SyncPlatform } from './SyncInstallationRepository';

export interface PendingSyncDevice {
  readonly deviceId: string;
  readonly publicKey: string;
  readonly platform: SyncPlatform;
  readonly createdAt: string;
}

export type PendingEnvelope = SyncCryptoEnvelope;

export interface RecoveryChallenge {
  readonly currentKeyEpoch: number;
  readonly recoveryEnvelope: SyncRecoveryEnvelope;
}

export interface RotationEnvelopeUpdate {
  readonly currentKeyEpoch: number;
  readonly envelope: SyncCryptoEnvelope;
}

export interface RevocationResult {
  readonly newKeyEpoch: number;
  readonly recipients: readonly { readonly deviceId: string; readonly publicKey: string }[];
}

export interface SyncTrustTransport {
  createFirstSpace(input: {
    readonly spaceId: string;
    readonly deviceId: string;
    readonly publicKey: string;
    readonly encryptedDeviceName: string;
    readonly encryptedDeviceNameNonce: string;
    readonly platform: SyncPlatform;
    readonly recoveryAuthVerifier: string;
    readonly recoveryEnvelope: SyncRecoveryEnvelope;
  }): Promise<{ readonly currentKeyEpoch: 1 }>;
  createPairingInvite(secretHashHex: string): Promise<{
    readonly inviteId: string;
    readonly expiresAt: string;
  }>;
  cancelPairingInvite(inviteId: string): Promise<void>;
  claimPairingInvite(input: {
    readonly inviteId: string;
    readonly secretHex: string;
    readonly deviceId: string;
    readonly publicKey: string;
    readonly platform: SyncPlatform;
  }): Promise<{ readonly spaceId: string; readonly currentKeyEpoch: number }>;
  listPendingPairingDevices(): Promise<readonly PendingSyncDevice[]>;
  publishKeyEnvelope(envelope: SyncCryptoEnvelope): Promise<void>;
  fetchPendingEnvelope(): Promise<PendingEnvelope | null>;
  acknowledgePairing(input: {
    readonly deviceId: string;
    readonly envelopeSha256Hex: string;
    readonly encryptedDeviceName: string;
    readonly encryptedDeviceNameNonce: string;
  }): Promise<void>;
  beginRecovery(input: {
    readonly spaceId: string;
    readonly authProof: string;
    readonly deviceId: string;
    readonly publicKey: string;
    readonly platform: SyncPlatform;
  }): Promise<RecoveryChallenge>;
  completeRecovery(input: {
    readonly deviceId: string;
    readonly authProof: string;
    readonly recoveryEnvelopeSha256Hex: string;
    readonly encryptedDeviceName: string;
    readonly encryptedDeviceNameNonce: string;
  }): Promise<void>;
  listDevices(spaceId: string): Promise<readonly CachedSyncDevice[]>;
  fetchMyRotationEnvelope(afterKeyEpoch: number): Promise<RotationEnvelopeUpdate | null>;
  updateMyDeviceName(input: {
    readonly ciphertext: string;
    readonly nonce: string;
    readonly keyEpoch: number;
  }): Promise<void>;
  revokeDeviceAndAdvanceEpoch(deviceId: string, expectedEpoch: number): Promise<RevocationResult>;
  finalizeKeyEpochRotation(input: {
    readonly expectedEpoch: number;
    readonly recoveryEnvelope: SyncRecoveryEnvelope;
  }): Promise<void>;
}
