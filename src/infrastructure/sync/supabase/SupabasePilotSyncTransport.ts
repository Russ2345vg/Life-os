import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  PilotPushAcknowledgement,
  PilotRemoteEvent,
  PilotSyncTransport,
} from '../../../application/sync/ports/PilotSyncTransport';
import type { PilotCryptoMetadata } from '../../../application/sync/ports/SyncCryptoService';
import { DomainError } from '../../../shared/errors/DomainError';

export class SupabasePilotSyncTransport implements PilotSyncTransport {
  #hintTopic: string | null = null;
  #hintChannel: ReturnType<SupabaseClient['channel']> | null = null;

  public constructor(private readonly client: SupabaseClient) {}

  public async push(
    envelope: Parameters<PilotSyncTransport['push']>[0],
  ): Promise<PilotPushAcknowledgement> {
    const row = firstRow(
      await this.rpc('lifeos_sync_push_pilot_event', {
        p_event_id: envelope.metadata.eventId,
        p_object_id: envelope.metadata.objectId,
        p_origin_device_id: envelope.metadata.originDeviceId,
        p_base_revision: envelope.metadata.baseRevision,
        p_revision: envelope.metadata.revision,
        p_key_epoch: envelope.metadata.keyEpoch,
        p_operation: envelope.metadata.operation,
        p_hlc_wall_time: envelope.metadata.hlcWallTime,
        p_hlc_logical: envelope.metadata.hlcLogical,
        p_ciphertext_hex: base64UrlToHex(envelope.ciphertext),
        p_nonce_hex: base64UrlToHex(envelope.nonce),
      }),
    );
    return {
      sequence: readNonNegativeInteger(row, 'sequence'),
      isCurrentWinner: readBoolean(row, 'is_current_winner'),
    };
  }

  public async pull(afterSequence: number, limit: number): Promise<readonly PilotRemoteEvent[]> {
    return rows(
      await this.rpc('lifeos_sync_pull_pilot_events', {
        p_after_sequence: afterSequence,
        p_limit: limit,
      }),
    ).map((row) => ({
      sequence: readNonNegativeInteger(row, 'sequence'),
      metadata: metadataFromRow(row),
      ciphertext: byteaToBase64Url(readString(row, 'ciphertext')),
      nonce: byteaToBase64Url(readString(row, 'nonce')),
    }));
  }

  public async acknowledge(lastSequence: number): Promise<void> {
    await this.rpc('lifeos_sync_ack_pilot_cursor', { p_last_sequence: lastSequence });
  }

  public async ensureHintSubscription(
    spaceId: string,
    keyEpoch: number,
    onHint: () => void,
  ): Promise<void> {
    const topic = `lifeos-sync:${spaceId}:${keyEpoch}`;
    if (this.#hintTopic === topic && this.#hintChannel !== null) return;
    await this.closeHints();
    await this.client.realtime.setAuth();
    const channel = this.client
      .channel(topic, { config: { private: true } })
      .on('broadcast', { event: 'pilot_changed' }, () => onHint());
    try {
      await subscribe(channel);
    } catch (error: unknown) {
      await this.client.removeChannel(channel);
      throw error;
    }
    this.#hintTopic = topic;
    this.#hintChannel = channel;
  }

  public async closeHints(): Promise<void> {
    const channel = this.#hintChannel;
    this.#hintChannel = null;
    this.#hintTopic = null;
    if (channel !== null) await this.client.removeChannel(channel);
  }

  private async rpc(name: string, parameters: Record<string, unknown>): Promise<unknown> {
    const response = await this.client.rpc(name, parameters);
    if (response.error !== null) {
      const code = classifyRpcError(response.error);
      throw new DomainError(code, 'Пилотная синхронизация не выполнена.', {
        cause: response.error,
      });
    }
    return response.data as unknown;
  }
}

function classifyRpcError(error: unknown): string {
  if (!isRecord(error)) return 'sync.pilot_transport_failed';
  const code = error.code;
  if (code === '42501' || code === '401' || code === '403') return 'sync.pilot_transport_denied';
  if (code === '22023' || code === 'P0001' || code === '23514') return 'sync.pilot_event_rejected';
  return 'sync.pilot_transport_failed';
}

function subscribe(channel: ReturnType<SupabaseClient['channel']>): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(
      () => reject(new Error('Pilot Realtime subscription timed out.')),
      10_000,
    );
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        globalThis.clearTimeout(timer);
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        globalThis.clearTimeout(timer);
        reject(new Error('Pilot Realtime subscription failed.'));
      }
    });
  });
}

function metadataFromRow(row: Record<string, unknown>): PilotCryptoMetadata {
  const operation = readString(row, 'operation');
  if (operation !== 'upsert' && operation !== 'tombstone') throw invalidResponse();
  return {
    protocolVersion: 1,
    purpose: 'pilot_event',
    spaceId: readString(row, 'space_id'),
    eventId: readString(row, 'event_id'),
    objectId: readString(row, 'object_id'),
    originDeviceId: readString(row, 'device_id'),
    keyEpoch: readPositiveInteger(row, 'key_epoch'),
    operation,
    baseRevision: readNonNegativeInteger(row, 'base_revision'),
    revision: readPositiveInteger(row, 'revision'),
    hlcWallTime: readNonNegativeInteger(row, 'hlc_wall_time'),
    hlcLogical: readNonNegativeInteger(row, 'hlc_logical'),
  };
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
function readBoolean(row: Record<string, unknown>, key: string): boolean {
  const value = row[key];
  if (typeof value !== 'boolean') throw invalidResponse();
  return value;
}
function readNonNegativeInteger(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw invalidResponse();
  return value;
}
function readPositiveInteger(row: Record<string, unknown>, key: string): number {
  const value = readNonNegativeInteger(row, key);
  if (value < 1) throw invalidResponse();
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
  for (let index = 2; index < value.length; index += 2)
    binary += String.fromCharCode(Number.parseInt(value.slice(index, index + 2), 16));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function invalidResponse(): DomainError {
  return new DomainError(
    'sync.pilot_response_invalid',
    'Сервер вернул недопустимое пилот-событие.',
  );
}
