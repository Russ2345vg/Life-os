import { DomainError } from '../../../shared/errors/DomainError';
import { SYNC_ENTITY_TYPES, type SyncEntityType } from '../SyncRegistry';
import type { HybridLogicalTimestamp } from './HybridLogicalClock';

export const PILOT_SYNC_PROTOCOL_VERSION = 1;
export const PILOT_SYNC_MAX_PAYLOAD_BYTES = 256 * 1024;
export type PilotEntityType = SyncEntityType;
export type PilotOperation = 'upsert' | 'tombstone';

export interface PilotSyncPayload {
  readonly protocolVersion: 1;
  readonly schemaVersion: 1;
  readonly entityType: PilotEntityType;
  readonly operation: PilotOperation;
  readonly objectId: string;
  readonly eventId: string;
  readonly originDeviceId: string;
  readonly keyEpoch: number;
  readonly baseRevision: number;
  readonly revision: number;
  readonly hlc: HybridLogicalTimestamp;
  readonly record: Readonly<Record<string, unknown>> | null;
}

export function serializePilotSyncPayload(payload: PilotSyncPayload): string {
  assertPilotSyncPayload(payload);
  const serialized = JSON.stringify(sortJsonValue(payload));
  if (new TextEncoder().encode(serialized).byteLength > PILOT_SYNC_MAX_PAYLOAD_BYTES) {
    throw invalidPayload('Пилот-событие превышает допустимый размер.');
  }
  return serialized;
}

export function parsePilotSyncPayload(serialized: string): PilotSyncPayload {
  if (new TextEncoder().encode(serialized).byteLength > PILOT_SYNC_MAX_PAYLOAD_BYTES) {
    throw invalidPayload('Пилот-событие превышает допустимый размер.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error: unknown) {
    throw new DomainError(
      'sync.pilot_payload_invalid',
      'Пилот-событие содержит некорректный JSON.',
      { cause: error },
    );
  }
  assertPilotSyncPayload(parsed);
  return parsed;
}

export function assertPilotSyncPayload(value: unknown): asserts value is PilotSyncPayload {
  if (!isRecord(value)) throw invalidPayload('Пилот-событие должно быть объектом.');
  if (value.protocolVersion !== PILOT_SYNC_PROTOCOL_VERSION || value.schemaVersion !== 1) {
    throw invalidPayload('Версия пилот-протокола не поддерживается.');
  }
  if (typeof value.entityType !== 'string')
    throw invalidPayload('Тип сущности не поддерживается Sync Registry.');
  if (!isSyncEntityType(value.entityType)) {
    throw new DomainError(
      'sync.client_update_required',
      'Обновите LifeOS для синхронизации нового типа данных.',
    );
  }
  if (value.operation !== 'upsert' && value.operation !== 'tombstone') {
    throw invalidPayload('Операция пилот-события не поддерживается.');
  }
  for (const field of ['objectId', 'eventId', 'originDeviceId'] as const) {
    if (typeof value[field] !== 'string' || value[field].length === 0)
      throw invalidPayload(`Поле ${field} обязательно.`);
  }
  for (const field of ['keyEpoch', 'baseRevision', 'revision'] as const) {
    if (!Number.isSafeInteger(value[field]) || Number(value[field]) < 0)
      throw invalidPayload(`Поле ${field} некорректно.`);
  }
  if (Number(value.keyEpoch) < 1 || Number(value.revision) !== Number(value.baseRevision) + 1) {
    throw invalidPayload('Эпоха или цепочка ревизий пилот-события некорректна.');
  }
  if (
    !isRecord(value.hlc) ||
    !Number.isSafeInteger(value.hlc.wallTime) ||
    !Number.isSafeInteger(value.hlc.logical) ||
    Number(value.hlc.wallTime) < 0 ||
    Number(value.hlc.logical) < 0
  ) {
    throw invalidPayload('HLC пилот-события некорректен.');
  }
  if (value.operation === 'tombstone') {
    if (value.record !== null) throw invalidPayload('Tombstone не должен содержать запись.');
    return;
  }
  if (!isRecord(value.record)) throw invalidPayload('Upsert должен содержать запись.');
  if (
    value.record.id !== value.objectId ||
    value.record.coverImage !== undefined ||
    value.record.photo !== undefined
  ) {
    throw invalidPayload('Идентификатор записи не совпадает или вложение не исключено.');
  }
  if (value.entityType === 'goal' && 'projectId' in value.record) {
    throw invalidPayload('Goal использует реальную связь с Direction, а не Project.');
  }
}

function isSyncEntityType(value: string): value is PilotEntityType {
  return (SYNC_ENTITY_TYPES as readonly string[]).includes(value);
}

export function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortJsonValue(value[key])]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidPayload(message: string): DomainError {
  return new DomainError('sync.pilot_payload_invalid', message);
}
