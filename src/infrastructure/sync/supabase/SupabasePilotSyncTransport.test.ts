import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { PilotCryptoEnvelope } from '../../../application/sync/ports/SyncCryptoService';
import { SupabasePilotSyncTransport } from './SupabasePilotSyncTransport';

const envelope: PilotCryptoEnvelope = {
  metadata: {
    protocolVersion: 1,
    purpose: 'pilot_event',
    spaceId: 'space-1',
    eventId: 'event-1',
    objectId: 'object-1',
    originDeviceId: 'device-1',
    keyEpoch: 3,
    operation: 'upsert',
    baseRevision: 0,
    revision: 1,
    hlcWallTime: 100,
    hlcLogical: 0,
  },
  ciphertext: encoded(32, 1),
  nonce: encoded(24, 2),
};

describe('SupabasePilotSyncTransport', () => {
  it('pushes only opaque ordering metadata and ciphertext through a narrow RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: [{ sequence: 7, is_current_winner: true }],
      error: null,
    }));
    const transport = new SupabasePilotSyncTransport({ rpc } as unknown as SupabaseClient);
    await expect(transport.push(envelope)).resolves.toEqual({ sequence: 7, isCurrentWinner: true });
    expect(rpc).toHaveBeenCalledWith(
      'lifeos_sync_push_pilot_event',
      expect.objectContaining({
        p_event_id: 'event-1',
        p_object_id: 'object-1',
        p_origin_device_id: 'device-1',
        p_operation: 'upsert',
      }),
    );
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(
      /entityType|title|description|plaintext|service.role/i,
    );
  });

  it('pulls a bounded ordered page and validates transport metadata', async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          sequence: 8,
          space_id: 'space-1',
          event_id: 'event-2',
          object_id: 'object-1',
          device_id: 'device-2',
          key_epoch: 3,
          operation: 'tombstone',
          base_revision: 1,
          revision: 2,
          hlc_wall_time: 200,
          hlc_logical: 0,
          ciphertext: `\\x${'03'.repeat(32)}`,
          nonce: `\\x${'04'.repeat(24)}`,
        },
      ],
      error: null,
    }));
    const transport = new SupabasePilotSyncTransport({ rpc } as unknown as SupabaseClient);
    const events = await transport.pull(7, 100);
    expect(events[0]).toMatchObject({
      sequence: 8,
      metadata: { operation: 'tombstone', revision: 2 },
    });
    expect(rpc).toHaveBeenCalledWith('lifeos_sync_pull_pilot_events', {
      p_after_sequence: 7,
      p_limit: 100,
    });
  });

  it('uses a private epoch-scoped Realtime channel only as a wake-up hint', async () => {
    let broadcast: (() => void) | undefined;
    const channelValue = {
      on: vi.fn((_kind, _filter, callback: () => void) => {
        broadcast = callback;
        return channelValue;
      }),
      subscribe: vi.fn((callback: (status: string) => void) => {
        callback('SUBSCRIBED');
        return channelValue;
      }),
    };
    const channel = vi.fn(() => channelValue);
    const setAuth = vi.fn(async () => undefined);
    const removeChannel = vi.fn(async () => 'ok');
    const transport = new SupabasePilotSyncTransport({
      channel,
      realtime: { setAuth },
      removeChannel,
    } as unknown as SupabaseClient);
    const onHint = vi.fn();

    await transport.ensureHintSubscription('space-1', 3, onHint);
    broadcast?.();
    await transport.closeHints();

    expect(channel).toHaveBeenCalledWith('lifeos-sync:space-1:3', { config: { private: true } });
    expect(onHint).toHaveBeenCalledOnce();
    expect(removeChannel).toHaveBeenCalledWith(channelValue);
  });
});

function encoded(length: number, value: number): string {
  let binary = '';
  for (const byte of new Uint8Array(length).fill(value)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
