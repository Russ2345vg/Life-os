import type { SyncPlatform } from './SyncInstallationRepository';
import type { SnapshotPayloadCrypto } from '../SnapshotService';

export interface SyncEnvelopeMetadata {
  readonly protocolVersion: 1;
  readonly purpose: 'pairing' | 'rotation' | 'recovery' | 'device_name';
  readonly spaceId: string;
  readonly recipientDeviceId: string;
  readonly keyEpoch: number;
}

export interface SyncCryptoEnvelope {
  readonly metadata: SyncEnvelopeMetadata;
  readonly senderPublicKey: string;
  readonly ciphertext: string;
  readonly nonce: string;
}

export interface SyncRecoveryEnvelope {
  readonly metadata: SyncEnvelopeMetadata;
  readonly ciphertext: string;
  readonly nonce: string;
}

export interface PilotCryptoMetadata {
  readonly protocolVersion: 1;
  readonly purpose: 'pilot_event';
  readonly spaceId: string;
  readonly eventId: string;
  readonly objectId: string;
  readonly originDeviceId: string;
  readonly keyEpoch: number;
  readonly operation: 'upsert' | 'tombstone';
  readonly baseRevision: number;
  readonly revision: number;
  readonly hlcWallTime: number;
  readonly hlcLogical: number;
}

export interface PilotCryptoEnvelope {
  readonly metadata: PilotCryptoMetadata;
  readonly ciphertext: string;
  readonly nonce: string;
}

export interface PreparedFirstSpace {
  readonly publicKey: string;
  readonly encryptedDeviceName: string;
  readonly encryptedDeviceNameNonce: string;
  readonly recoveryAuthVerifier: string;
  readonly recoveryEnvelope: SyncRecoveryEnvelope;
  readonly recoveryMaterial: string;
}

export interface RotationRecipient {
  readonly deviceId: string;
  readonly publicKey: string;
}

export interface PreparedRotation {
  readonly keyEpoch: number;
  readonly envelopes: readonly SyncCryptoEnvelope[];
  readonly recoveryEnvelope: SyncRecoveryEnvelope;
}

export interface RecoveryAuthorization {
  readonly spaceId: string;
  readonly authProof: string;
}

export interface SyncCryptoService extends SnapshotPayloadCrypto {
  ensureDeviceIdentity(
    deviceId: string,
    allowCreate: boolean,
  ): Promise<{ readonly publicKey: string }>;
  prepareFirstSpace(input: {
    readonly deviceId: string;
    readonly spaceId: string;
    readonly deviceName: string;
  }): Promise<PreparedFirstSpace>;
  exportRecoveryMaterial(spaceId: string): Promise<string>;
  requireRecoveryMaterial(spaceId: string): Promise<void>;
  renderPairingQr(payload: string): Promise<string>;
  wrapKeyRing(input: {
    readonly spaceId: string;
    readonly senderDeviceId: string;
    readonly recipientDeviceId: string;
    readonly recipientPublicKey: string;
    readonly keyEpoch: number;
    readonly purpose: 'pairing' | 'rotation';
  }): Promise<SyncCryptoEnvelope>;
  unwrapAndStoreKeyRing(deviceId: string, envelope: SyncCryptoEnvelope): Promise<void>;
  prepareRecoveryAuthorization(recoveryMaterial: string): Promise<RecoveryAuthorization>;
  recoverAndStoreKeyRing(input: {
    readonly recoveryMaterial: string;
    readonly envelope: SyncRecoveryEnvelope;
  }): Promise<void>;
  encryptDeviceName(input: {
    readonly spaceId: string;
    readonly deviceId: string;
    readonly keyEpoch: number;
    readonly deviceName: string;
  }): Promise<SyncRecoveryEnvelope>;
  decryptDeviceName(envelope: SyncRecoveryEnvelope): Promise<string>;
  encryptPilotPayload(input: {
    readonly metadata: PilotCryptoMetadata;
    readonly plaintext: string;
  }): Promise<PilotCryptoEnvelope>;
  decryptPilotPayload(envelope: PilotCryptoEnvelope): Promise<string>;
  prepareRotation(input: {
    readonly spaceId: string;
    readonly senderDeviceId: string;
    readonly nextEpoch: number;
    readonly recipients: readonly RotationRecipient[];
  }): Promise<PreparedRotation>;
  platform(): Promise<SyncPlatform>;
}
