import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseSyncTrustTransport } from './SupabaseSyncTrustTransport';

describe('SupabaseSyncTrustTransport', () => {
  it('adopts the current space with only the device id from the client', async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          space_id: '20000000-0000-4000-8000-000000000001',
          current_key_epoch: 3,
        },
      ],
      error: null,
    }));
    const transport = new SupabaseSyncTrustTransport({ rpc } as unknown as SupabaseClient);

    await expect(
      transport.adoptCurrentSpace('30000000-0000-4000-8000-000000000001'),
    ).resolves.toEqual({
      spaceId: '20000000-0000-4000-8000-000000000001',
      currentKeyEpoch: 3,
    });
    expect(rpc).toHaveBeenCalledWith('lifeos_sync_adopt_current_space', {
      p_device_id: '30000000-0000-4000-8000-000000000001',
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(/session|user|token/i);
  });

  it('revokes only the server-validated current device', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const transport = new SupabaseSyncTrustTransport({ rpc } as unknown as SupabaseClient);

    await expect(transport.revokeCurrentDevice()).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('lifeos_sync_revoke_current_device', {});
  });

  it.each([
    [{ space_id: 'not-a-uuid', current_key_epoch: 1 }],
    [{ space_id: '20000000-0000-4000-8000-000000000001', current_key_epoch: 0 }],
  ])('rejects malformed adoption responses %#', async (row) => {
    const transport = new SupabaseSyncTrustTransport({
      rpc: vi.fn(async () => ({ data: [row], error: null })),
    } as unknown as SupabaseClient);

    await expect(
      transport.adoptCurrentSpace('30000000-0000-4000-8000-000000000001'),
    ).rejects.toMatchObject({ code: 'sync.remote_response_invalid' });
  });

  it('maps adoption SQL failures to the stable public error without preserving server details', async () => {
    const transport = new SupabaseSyncTrustTransport({
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: '42501', message: 'sensitive SQL policy detail' },
      })),
    } as unknown as SupabaseClient);

    const error = await transport
      .adoptCurrentSpace('30000000-0000-4000-8000-000000000001')
      .catch((reason: unknown) => reason);

    expect(error).toMatchObject({
      code: 'sync.remote_operation_failed',
      message: 'Операция доверия устройств не выполнена.',
    });
    expect(error).not.toHaveProperty('cause');
  });

  it('uses a narrow RPC and sends only public/ciphertext first-space fields', async () => {
    const rpc = vi.fn(async () => ({
      data: [{ current_key_epoch: 1 }],
      error: null,
    }));
    const transport = new SupabaseSyncTrustTransport({ rpc } as unknown as SupabaseClient);
    await transport.createFirstSpace({
      spaceId: '20000000-0000-4000-8000-000000000001',
      deviceId: '30000000-0000-4000-8000-000000000001',
      publicKey: encoded(32, 1),
      encryptedDeviceName: encoded(32, 2),
      encryptedDeviceNameNonce: encoded(24, 3),
      platform: 'windows',
      recoveryAuthVerifier: encoded(32, 4),
      recoveryEnvelope: {
        metadata: {
          protocolVersion: 1,
          purpose: 'recovery',
          spaceId: '20000000-0000-4000-8000-000000000001',
          recipientDeviceId: '30000000-0000-4000-8000-000000000001',
          keyEpoch: 1,
        },
        ciphertext: encoded(32, 5),
        nonce: encoded(24, 6),
      },
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('lifeos_sync_create_first_space', expect.any(Object));
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(
      /privateKey|spaceKey|recoveryRoot|service.role/i,
    );
  });

  it('rejects malformed server rows before application use', async () => {
    const transport = new SupabaseSyncTrustTransport({
      rpc: vi.fn(async () => ({ data: [{ current_key_epoch: 0 }], error: null })),
    } as unknown as SupabaseClient);
    await expect(
      transport.createFirstSpace({
        spaceId: 'space',
        deviceId: 'device',
        publicKey: encoded(32, 1),
        encryptedDeviceName: encoded(32, 2),
        encryptedDeviceNameNonce: encoded(24, 3),
        platform: 'windows',
        recoveryAuthVerifier: encoded(32, 4),
        recoveryEnvelope: {
          metadata: {
            protocolVersion: 1,
            purpose: 'recovery',
            spaceId: 'space',
            recipientDeviceId: 'device',
            keyEpoch: 1,
          },
          ciphertext: encoded(32, 5),
          nonce: encoded(24, 6),
        },
      }),
    ).rejects.toMatchObject({ code: 'sync.remote_response_invalid' });
  });

  it('reconstructs recovery AAD with the stable space recipient', async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          current_key_epoch: 3,
          recovery_envelope_ciphertext: `\\x${'07'.repeat(32)}`,
          recovery_envelope_nonce: `\\x${'08'.repeat(24)}`,
        },
      ],
      error: null,
    }));
    const transport = new SupabaseSyncTrustTransport({ rpc } as unknown as SupabaseClient);

    const challenge = await transport.beginRecovery({
      spaceId: '20000000-0000-4000-8000-000000000001',
      authProof: encoded(32, 1),
      deviceId: '30000000-0000-4000-8000-000000000009',
      publicKey: encoded(32, 2),
      platform: 'android',
    });

    expect(challenge.recoveryEnvelope.metadata.recipientDeviceId).toBe(
      '20000000-0000-4000-8000-000000000001',
    );
  });

  it('accepts only a newer recipient-bound rotation envelope', async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          space_id: '20000000-0000-4000-8000-000000000001',
          current_key_epoch: 2,
          recipient_device_id: '30000000-0000-4000-8000-000000000001',
          sender_device_id: '30000000-0000-4000-8000-000000000002',
          sender_public_key: `\\x${'01'.repeat(32)}`,
          encrypted_key: `\\x${'02'.repeat(32)}`,
          nonce: `\\x${'03'.repeat(24)}`,
        },
      ],
      error: null,
    }));
    const transport = new SupabaseSyncTrustTransport({ rpc } as unknown as SupabaseClient);

    const update = await transport.fetchMyRotationEnvelope(1);

    expect(update?.currentKeyEpoch).toBe(2);
    expect(update?.envelope.metadata).toEqual({
      protocolVersion: 1,
      purpose: 'rotation',
      spaceId: '20000000-0000-4000-8000-000000000001',
      recipientDeviceId: '30000000-0000-4000-8000-000000000001',
      keyEpoch: 2,
    });
  });
});

function encoded(length: number, value: number): string {
  let binary = '';
  for (const byte of new Uint8Array(length).fill(value)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
