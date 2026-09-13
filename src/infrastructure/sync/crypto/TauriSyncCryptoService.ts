import { invoke } from '@tauri-apps/api/core';
import type {
  SyncBinaryMetadata,
  SyncBinaryEnvelope,
} from '../../../application/sync/attachments/AttachmentContracts';
import type {
  PreparedFirstSpace,
  PilotCryptoEnvelope,
  PilotCryptoMetadata,
  PreparedRotation,
  RecoveryAuthorization,
  SyncCryptoEnvelope,
  SyncCryptoService,
  SyncRecoveryEnvelope,
} from '../../../application/sync/ports/SyncCryptoService';
import type { SyncPlatform } from '../../../application/sync/ports/SyncInstallationRepository';
import type { TauriInvoke } from '../supabase/TauriSupabaseAuthStorage';

export class TauriSyncCryptoService implements SyncCryptoService {
  public constructor(private readonly invokeCommand: TauriInvoke = invoke) {}

  public encryptBinary(
    metadata: SyncBinaryMetadata,
    plaintext: string,
  ): Promise<SyncBinaryEnvelope> {
    return this.invokeCommand('sync_encrypt_binary', { metadata, plaintext });
  }

  public decryptBinary(envelope: SyncBinaryEnvelope): Promise<string> {
    return this.invokeCommand('sync_decrypt_binary', { envelope });
  }

  public ensureDeviceIdentity(deviceId: string, allowCreate: boolean) {
    return this.invokeCommand<{ readonly publicKey: string }>('sync_prepare_device_identity', {
      deviceId,
      allowCreate,
    });
  }

  public prepareFirstSpace(input: {
    readonly deviceId: string;
    readonly spaceId: string;
    readonly deviceName: string;
  }): Promise<PreparedFirstSpace> {
    return this.invokeCommand('sync_prepare_first_space', input);
  }

  public exportRecoveryMaterial(spaceId: string): Promise<string> {
    return this.invokeCommand('sync_export_recovery_material', { spaceId });
  }

  public requireRecoveryMaterial(spaceId: string): Promise<void> {
    return this.invokeCommand('sync_require_recovery_material', { spaceId });
  }

  public renderPairingQr(payload: string): Promise<string> {
    return this.invokeCommand('sync_render_pairing_qr', { payload });
  }

  public wrapKeyRing(input: {
    readonly spaceId: string;
    readonly senderDeviceId: string;
    readonly recipientDeviceId: string;
    readonly recipientPublicKey: string;
    readonly keyEpoch: number;
    readonly purpose: 'pairing' | 'rotation';
  }): Promise<SyncCryptoEnvelope> {
    return this.invokeCommand('sync_wrap_key_ring', { input });
  }

  public unwrapAndStoreKeyRing(deviceId: string, envelope: SyncCryptoEnvelope): Promise<void> {
    return this.invokeCommand('sync_unwrap_and_store_key_ring', { deviceId, envelope });
  }

  public prepareRecoveryAuthorization(recoveryMaterial: string): Promise<RecoveryAuthorization> {
    return this.invokeCommand('sync_prepare_recovery_authorization', { recoveryMaterial });
  }

  public recoverAndStoreKeyRing(input: {
    readonly recoveryMaterial: string;
    readonly envelope: SyncRecoveryEnvelope;
  }): Promise<void> {
    return this.invokeCommand('sync_recover_and_store_key_ring', { input });
  }

  public encryptDeviceName(input: {
    readonly spaceId: string;
    readonly deviceId: string;
    readonly keyEpoch: number;
    readonly deviceName: string;
  }): Promise<SyncRecoveryEnvelope> {
    return this.invokeCommand('sync_encrypt_device_name', { input });
  }

  public decryptDeviceName(envelope: SyncRecoveryEnvelope): Promise<string> {
    return this.invokeCommand('sync_decrypt_device_name', { envelope });
  }

  public encryptPilotPayload(input: {
    readonly metadata: PilotCryptoMetadata;
    readonly plaintext: string;
  }): Promise<PilotCryptoEnvelope> {
    return this.invokeCommand('sync_encrypt_pilot_payload', { input });
  }

  public decryptPilotPayload(envelope: PilotCryptoEnvelope): Promise<string> {
    return this.invokeCommand('sync_decrypt_pilot_payload', { envelope });
  }

  public encryptLocalSnapshot(snapshotId: string, plaintext: string) {
    return this.invokeCommand<{ readonly ciphertext: string; readonly nonce: string }>(
      'sync_encrypt_local_snapshot',
      { snapshotId, plaintext },
    );
  }

  public decryptLocalSnapshot(
    snapshotId: string,
    envelope: { readonly ciphertext: string; readonly nonce: string },
  ): Promise<string> {
    return this.invokeCommand('sync_decrypt_local_snapshot', { snapshotId, envelope });
  }

  public prepareRotation(input: {
    readonly spaceId: string;
    readonly senderDeviceId: string;
    readonly nextEpoch: number;
    readonly recipients: readonly { readonly deviceId: string; readonly publicKey: string }[];
  }): Promise<PreparedRotation> {
    return this.invokeCommand('sync_prepare_rotation', {
      spaceId: input.spaceId,
      senderDeviceId: input.senderDeviceId,
      nextEpoch: input.nextEpoch,
      recipients: input.recipients,
    });
  }

  public async platform(): Promise<SyncPlatform> {
    const value = await this.invokeCommand<string>('sync_platform');
    if (value !== 'windows' && value !== 'android') throw new Error('Unsupported LifeOS platform.');
    return value;
  }
}
