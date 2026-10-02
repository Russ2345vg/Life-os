import type { SupabaseClient } from '@supabase/supabase-js';
import type { CachedSyncDevice } from '../../../application/sync/ports/SyncDeviceCacheRepository';
import type { SyncCryptoEnvelope } from '../../../application/sync/ports/SyncCryptoService';
import type {
  PendingEnvelope,
  PendingSyncDevice,
  RecoveryChallenge,
  RevocationResult,
  RotationEnvelopeUpdate,
  SyncTrustTransport,
} from '../../../application/sync/ports/SyncTrustTransport';
import { DomainError } from '../../../shared/errors/DomainError';

export class SupabaseSyncTrustTransport implements SyncTrustTransport {
  public constructor(private readonly client: SupabaseClient) {}

  /** Returns the server floor. A pre-migration server continues to use format 1. */
  public async negotiateDataFormat(deviceId: string): Promise<1 | 2> {
    if (!(await this.advertiseDataFormat(deviceId))) return 1;
    let row = firstRow(await this.rpc('lifeos_sync_read_data_format', {}));
    if (readInteger(row, 'supported_data_format') !== 2) throw invalidResponse();
    if (readInteger(row, 'minimum_data_format') === 1 && row.active_devices_ready === true) {
      // An activation may win the race after read; the server rechecks under the space lock.
      await this.rpc('lifeos_sync_raise_data_format', {}).catch(() => undefined);
      row = firstRow(await this.rpc('lifeos_sync_read_data_format', {}));
    }
    const floor = readInteger(row, 'minimum_data_format');
    if (floor !== 1 && floor !== 2) throw invalidResponse();
    return floor;
  }

  private async advertiseDataFormat(deviceId: string): Promise<boolean> {
    const response = await this.client.rpc('lifeos_sync_advertise_data_format', {
      p_device_id: deviceId,
      p_supported_data_format: 2,
    });
    if (response.error === null) {
      const row = firstRow(response.data as unknown);
      if (readInteger(row, 'supported_data_format') !== 2) throw invalidResponse();
      return true;
    }
    if (response.error.code === 'PGRST202' || response.error.code === '42883') return false;
    throw new DomainError(
      'sync.remote_operation_failed',
      'Формат устройства не подтверждён сервером.',
    );
  }

  public async adoptCurrentSpace(deviceId: string) {
    const row = firstRow(
      await this.rpc('lifeos_sync_adopt_current_space', { p_device_id: deviceId }),
    );
    return {
      spaceId: readUuid(row, 'space_id'),
      currentKeyEpoch: readPositiveInteger(row, 'current_key_epoch'),
    };
  }

  public async revokeCurrentDevice(): Promise<void> {
    await this.rpc('lifeos_sync_revoke_current_device', {});
  }

  public async createFirstSpace(input: Parameters<SyncTrustTransport['createFirstSpace']>[0]) {
    const row = firstRow(
      await this.rpc('lifeos_sync_create_first_space', {
        p_space_id: input.spaceId,
        p_device_id: input.deviceId,
        p_public_key_hex: base64UrlToHex(input.publicKey),
        p_device_name_ciphertext_hex: base64UrlToHex(input.encryptedDeviceName),
        p_device_name_nonce_hex: base64UrlToHex(input.encryptedDeviceNameNonce),
        p_platform: input.platform,
        p_recovery_auth_verifier_hex: base64UrlToHex(input.recoveryAuthVerifier),
        p_recovery_envelope_ciphertext_hex: base64UrlToHex(input.recoveryEnvelope.ciphertext),
        p_recovery_envelope_nonce_hex: base64UrlToHex(input.recoveryEnvelope.nonce),
      }),
    );
    if (readInteger(row, 'current_key_epoch') !== 1) throw invalidResponse();
    return { currentKeyEpoch: 1 as const };
  }

  public async createPairingInvite(secretHashHex: string) {
    const row = firstRow(
      await this.rpc('lifeos_sync_create_pairing_invite', { p_secret_hash_hex: secretHashHex }),
    );
    return { inviteId: readString(row, 'invite_id'), expiresAt: readIsoDate(row, 'expires_at') };
  }

  public async cancelPairingInvite(inviteId: string): Promise<void> {
    await this.rpc('lifeos_sync_cancel_pairing_invite', { p_invite_id: inviteId });
  }

  public async claimPairingInvite(input: Parameters<SyncTrustTransport['claimPairingInvite']>[0]) {
    const row = firstRow(
      await this.rpc('lifeos_sync_claim_pairing_invite', {
        p_invite_id: input.inviteId,
        p_secret_hex: input.secretHex,
        p_device_id: input.deviceId,
        p_public_key_hex: base64UrlToHex(input.publicKey),
        p_platform: input.platform,
      }),
    );
    return {
      spaceId: readString(row, 'space_id'),
      currentKeyEpoch: readPositiveInteger(row, 'current_key_epoch'),
    };
  }

  public async listPendingPairingDevices(): Promise<readonly PendingSyncDevice[]> {
    return rows(await this.rpc('lifeos_sync_list_my_pending_pairing_devices', {})).map((row) => ({
      deviceId: readString(row, 'device_id'),
      publicKey: byteaToBase64Url(readString(row, 'public_key')),
      platform: readPlatform(row, 'platform'),
      createdAt: readIsoDate(row, 'created_at'),
    }));
  }

  public async publishKeyEnvelope(envelope: SyncCryptoEnvelope): Promise<void> {
    await this.rpc('lifeos_sync_publish_key_envelope', {
      p_recipient_device_id: envelope.metadata.recipientDeviceId,
      p_key_epoch: envelope.metadata.keyEpoch,
      p_purpose: envelope.metadata.purpose,
      p_ciphertext_hex: base64UrlToHex(envelope.ciphertext),
      p_nonce_hex: base64UrlToHex(envelope.nonce),
    });
  }

  public async fetchPendingEnvelope(): Promise<PendingEnvelope | null> {
    const result = rows(await this.rpc('lifeos_sync_fetch_my_pending_envelope', {}));
    if (result.length === 0) return null;
    if (result.length !== 1) throw invalidResponse();
    const row = result[0]!;
    const purpose = readString(row, 'envelope_purpose');
    if (purpose !== 'pairing') throw invalidResponse();
    return {
      metadata: {
        protocolVersion: 1,
        purpose,
        spaceId: readString(row, 'space_id'),
        recipientDeviceId: readString(row, 'recipient_device_id'),
        keyEpoch: readPositiveInteger(row, 'key_epoch'),
      },
      senderPublicKey: byteaToBase64Url(readString(row, 'sender_public_key')),
      ciphertext: byteaToBase64Url(readString(row, 'encrypted_key')),
      nonce: byteaToBase64Url(readString(row, 'nonce')),
    };
  }

  public async acknowledgePairing(input: Parameters<SyncTrustTransport['acknowledgePairing']>[0]) {
    await this.advertiseDataFormat(input.deviceId);
    await this.rpc('lifeos_sync_acknowledge_pairing', {
      p_device_id: input.deviceId,
      p_envelope_sha256_hex: input.envelopeSha256Hex,
      p_device_name_ciphertext_hex: base64UrlToHex(input.encryptedDeviceName),
      p_device_name_nonce_hex: base64UrlToHex(input.encryptedDeviceNameNonce),
    });
  }

  public async beginRecovery(
    input: Parameters<SyncTrustTransport['beginRecovery']>[0],
  ): Promise<RecoveryChallenge> {
    const row = firstRow(
      await this.rpc('lifeos_sync_begin_recovery', {
        p_space_id: input.spaceId,
        p_auth_proof_hex: base64UrlToHex(input.authProof),
        p_device_id: input.deviceId,
        p_public_key_hex: base64UrlToHex(input.publicKey),
        p_platform: input.platform,
      }),
    );
    const currentKeyEpoch = readPositiveInteger(row, 'current_key_epoch');
    return {
      currentKeyEpoch,
      recoveryEnvelope: {
        metadata: {
          protocolVersion: 1,
          purpose: 'recovery',
          spaceId: input.spaceId,
          recipientDeviceId: input.spaceId,
          keyEpoch: currentKeyEpoch,
        },
        ciphertext: byteaToBase64Url(readString(row, 'recovery_envelope_ciphertext')),
        nonce: byteaToBase64Url(readString(row, 'recovery_envelope_nonce')),
      },
    };
  }

  public async completeRecovery(input: Parameters<SyncTrustTransport['completeRecovery']>[0]) {
    await this.advertiseDataFormat(input.deviceId);
    await this.rpc('lifeos_sync_complete_recovery', {
      p_device_id: input.deviceId,
      p_auth_proof_hex: base64UrlToHex(input.authProof),
      p_recovery_envelope_sha256_hex: input.recoveryEnvelopeSha256Hex,
      p_device_name_ciphertext_hex: base64UrlToHex(input.encryptedDeviceName),
      p_device_name_nonce_hex: base64UrlToHex(input.encryptedDeviceNameNonce),
    });
  }

  public async listDevices(spaceId: string): Promise<readonly CachedSyncDevice[]> {
    return rows(await this.rpc('lifeos_sync_list_devices', {})).map((row) => ({
      deviceId: readString(row, 'device_id'),
      spaceId,
      encryptedName: readNullableBytea(row, 'device_name_ciphertext'),
      encryptedNameNonce: readNullableBytea(row, 'device_name_nonce'),
      encryptedNameKeyEpoch: readNullablePositiveInteger(row, 'device_name_key_epoch'),
      displayName:
        readPlatform(row, 'platform') === 'android' ? 'Android устройство' : 'Windows устройство',
      platform: readPlatform(row, 'platform'),
      publicKey: byteaToBase64Url(readString(row, 'public_key')),
      status: readStatus(row, 'status'),
      createdAt: readIsoDate(row, 'created_at'),
      activatedAt: readNullableDate(row, 'activated_at'),
      lastSeenAt: readNullableDate(row, 'last_seen_at'),
      revokedAt: readNullableDate(row, 'revoked_at'),
      updatedAt: new Date().toISOString(),
    }));
  }

  public async fetchMyRotationEnvelope(
    afterKeyEpoch: number,
  ): Promise<RotationEnvelopeUpdate | null> {
    const result = rows(
      await this.rpc('lifeos_sync_fetch_my_rotation_envelope', {
        p_after_key_epoch: afterKeyEpoch,
      }),
    );
    if (result.length === 0) return null;
    if (result.length !== 1) throw invalidResponse();
    const row = result[0]!;
    const currentKeyEpoch = readPositiveInteger(row, 'current_key_epoch');
    if (currentKeyEpoch <= afterKeyEpoch) throw invalidResponse();
    return {
      currentKeyEpoch,
      envelope: {
        metadata: {
          protocolVersion: 1,
          purpose: 'rotation',
          spaceId: readString(row, 'space_id'),
          recipientDeviceId: readString(row, 'recipient_device_id'),
          keyEpoch: currentKeyEpoch,
        },
        senderPublicKey: byteaToBase64Url(readString(row, 'sender_public_key')),
        ciphertext: byteaToBase64Url(readString(row, 'encrypted_key')),
        nonce: byteaToBase64Url(readString(row, 'nonce')),
      },
    };
  }

  public async updateMyDeviceName(input: Parameters<SyncTrustTransport['updateMyDeviceName']>[0]) {
    await this.rpc('lifeos_sync_update_my_device_name', {
      p_ciphertext_hex: base64UrlToHex(input.ciphertext),
      p_nonce_hex: base64UrlToHex(input.nonce),
      p_key_epoch: input.keyEpoch,
    });
  }

  public async revokeDeviceAndAdvanceEpoch(
    deviceId: string,
    expectedEpoch: number,
  ): Promise<RevocationResult> {
    const result = rows(
      await this.rpc('lifeos_sync_revoke_device_and_advance_epoch', {
        p_target_device_id: deviceId,
        p_expected_epoch: expectedEpoch,
      }),
    );
    if (result.length === 0) throw invalidResponse();
    const newKeyEpoch = readPositiveInteger(result[0]!, 'new_key_epoch');
    return {
      newKeyEpoch,
      recipients: result.map((row) => ({
        deviceId: readString(row, 'device_id'),
        publicKey: byteaToBase64Url(readString(row, 'public_key')),
      })),
    };
  }

  public async finalizeKeyEpochRotation(
    input: Parameters<SyncTrustTransport['finalizeKeyEpochRotation']>[0],
  ) {
    await this.rpc('lifeos_sync_finalize_key_epoch_rotation', {
      p_expected_epoch: input.expectedEpoch,
      p_recovery_envelope_ciphertext_hex: base64UrlToHex(input.recoveryEnvelope.ciphertext),
      p_recovery_envelope_nonce_hex: base64UrlToHex(input.recoveryEnvelope.nonce),
    });
  }

  private async rpc(name: string, parameters: Record<string, unknown>): Promise<unknown> {
    const response = await this.client.rpc(name, parameters);
    if (response.error !== null) {
      throw new DomainError(
        'sync.remote_operation_failed',
        'Операция доверия устройств не выполнена.',
      );
    }
    return response.data as unknown;
  }
}

function rows(value: unknown): readonly Record<string, unknown>[] {
  if (!Array.isArray(value) || !value.every(isRecord)) throw invalidResponse();
  return value;
}

function firstRow(value: unknown): Record<string, unknown> {
  const result = rows(value);
  if (result.length !== 1) throw invalidResponse();
  return result[0]!;
}

function readString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || value.length === 0) throw invalidResponse();
  return value;
}

function readUuid(row: Record<string, unknown>, key: string): string {
  const value = readString(row, key);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw invalidResponse();
  }
  return value;
}

function readInteger(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) throw invalidResponse();
  return value;
}

function readPositiveInteger(row: Record<string, unknown>, key: string): number {
  const value = readInteger(row, key);
  if (value < 1) throw invalidResponse();
  return value;
}

function readIsoDate(row: Record<string, unknown>, key: string): string {
  const value = readString(row, key);
  if (Number.isNaN(Date.parse(value))) throw invalidResponse();
  return value;
}

function readNullableDate(row: Record<string, unknown>, key: string): string | null {
  return row[key] === null ? null : readIsoDate(row, key);
}

function readNullableBytea(row: Record<string, unknown>, key: string): string | null {
  return row[key] === null ? null : byteaToBase64Url(readString(row, key));
}

function readNullablePositiveInteger(row: Record<string, unknown>, key: string): number | null {
  return row[key] === null ? null : readPositiveInteger(row, key);
}

function readPlatform(row: Record<string, unknown>, key: string): 'windows' | 'android' {
  const value = readString(row, key);
  if (value !== 'windows' && value !== 'android') throw invalidResponse();
  return value;
}

function readStatus(row: Record<string, unknown>, key: string): 'pending' | 'active' | 'revoked' {
  const value = readString(row, key);
  if (value !== 'pending' && value !== 'active' && value !== 'revoked') throw invalidResponse();
  return value;
}

function base64UrlToHex(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return [...binary]
    .map((character) => character.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('');
}

function byteaToBase64Url(value: string): string {
  if (!/^\\x[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) throw invalidResponse();
  let binary = '';
  for (let index = 2; index < value.length; index += 2) {
    binary += String.fromCharCode(Number.parseInt(value.slice(index, index + 2), 16));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidResponse(): DomainError {
  return new DomainError('sync.remote_response_invalid', 'Сервер вернул недопустимый ответ.');
}
