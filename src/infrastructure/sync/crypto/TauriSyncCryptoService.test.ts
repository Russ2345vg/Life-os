import { describe, expect, it } from 'vitest';
import type { TauriInvoke } from '../supabase/TauriSupabaseAuthStorage';
import { TauriSyncCryptoService } from './TauriSyncCryptoService';

describe('TauriSyncCryptoService', () => {
  it('passes only public workflow inputs to high-level native commands', async () => {
    const calls: Array<readonly [string, Record<string, unknown> | undefined]> = [];
    const invoke: TauriInvoke = async <T>(command: string, args?: Record<string, unknown>) => {
      calls.push([command, args]);
      return { publicKey: 'public' } as T;
    };
    const service = new TauriSyncCryptoService(invoke);
    await service.ensureDeviceIdentity('10000000-0000-4000-8000-000000000001', true);
    expect(calls).toEqual([
      [
        'sync_prepare_device_identity',
        { deviceId: '10000000-0000-4000-8000-000000000001', allowCreate: true },
      ],
    ]);
    expect(JSON.stringify(calls)).not.toMatch(/privateKey|spaceKey|recoveryRoot/);
  });

  it('encrypts and decrypts pilot payloads through native commands without accepting key bytes', async () => {
    const calls: Array<readonly [string, Record<string, unknown> | undefined]> = [];
    const metadata = {
      protocolVersion: 1 as const,
      purpose: 'pilot_event' as const,
      spaceId: 'space-1',
      eventId: 'event-1',
      objectId: 'object-1',
      originDeviceId: 'device-1',
      keyEpoch: 3,
      operation: 'upsert' as const,
      baseRevision: 0,
      revision: 1,
      hlcWallTime: 100,
      hlcLogical: 0,
    };
    const envelope = { metadata, ciphertext: 'ciphertext', nonce: 'nonce' };
    const invoke: TauriInvoke = async <T>(command: string, args?: Record<string, unknown>) => {
      calls.push([command, args]);
      return (command === 'sync_encrypt_pilot_payload' ? envelope : 'synthetic') as T;
    };
    const service = new TauriSyncCryptoService(invoke);
    await service.encryptPilotPayload({ metadata, plaintext: 'synthetic' });
    await service.decryptPilotPayload(envelope);
    expect(calls.map(([command]) => command)).toEqual([
      'sync_encrypt_pilot_payload',
      'sync_decrypt_pilot_payload',
    ]);
    expect(JSON.stringify(calls)).not.toMatch(/privateKey|spaceKey|recoveryRoot/);
  });
});
