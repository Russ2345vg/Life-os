import type { Clock, IdGenerator } from '../../application';
import type {
  LocalSnapshotReference,
  SnapshotService,
  SnapshotVerification,
  SnapshotPayloadCrypto,
} from '../../application/sync/SnapshotService';
import { DomainError } from '../../shared/errors/DomainError';
import { executeIndexedDbRequest } from '../persistence/indexed-db/IndexedDbRequest';
import {
  LIFE_OS_STORE,
  LIFE_OS_SYNC_STORE,
  type LifeOsIndexedDb,
} from '../persistence/indexed-db/LifeOsIndexedDb';
import type { SyncSnapshotMetaRecord } from '../persistence/records';
import { projectMeaningfulLocalSettings } from './LifeOsLocalStoragePolicy';

const SNAPSHOT_FORMAT_VERSION = 1;
const LOCAL_SETTINGS_STORAGE_KEY = 'lifeos.local-settings.v1';

interface SnapshotLocalStorage {
  getItem(key: string): string | null;
}

interface SnapshotStorePayload {
  readonly name: string;
  readonly records: readonly unknown[];
}

interface SnapshotPayload {
  readonly formatVersion: 1;
  readonly createdAt: string;
  readonly database: Readonly<{ name: string; version: number }>;
  readonly stores: readonly SnapshotStorePayload[];
  readonly localSettings: ReturnType<typeof projectMeaningfulLocalSettings>;
}

export class IndexedDbSnapshotService implements SnapshotService {
  readonly #database: LifeOsIndexedDb;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;
  readonly #localStorage: SnapshotLocalStorage | null;
  readonly #crypto: Crypto | null;
  readonly #snapshotCrypto: SnapshotPayloadCrypto | null;

  public constructor(
    database: LifeOsIndexedDb,
    clock: Clock,
    idGenerator: IdGenerator,
    localStorage: SnapshotLocalStorage | null = resolveLocalStorage(),
    crypto: Crypto | null = globalThis.crypto ?? null,
    snapshotCrypto: SnapshotPayloadCrypto | null = null,
  ) {
    this.#database = database;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
    this.#localStorage = localStorage;
    this.#crypto = crypto;
    this.#snapshotCrypto = snapshotCrypto;
  }

  public async createPreSyncSnapshot(): Promise<LocalSnapshotReference> {
    const database = await this.#database.open();
    const createdAt = this.#clock.now().toISOString();
    const snapshotId = this.#idGenerator.generate().toString();
    const stores = await readDomainStores(database);
    const payload: SnapshotPayload = {
      formatVersion: SNAPSHOT_FORMAT_VERSION,
      createdAt,
      database: { name: database.name, version: database.version },
      stores,
      localSettings: projectMeaningfulLocalSettings(this.readLocalSettings()),
    };
    const serializedPayload = await canonicalStringify(payload);
    const sha256 = await this.computeSha256(serializedPayload);
    const encrypted =
      this.#snapshotCrypto === null
        ? null
        : await this.#snapshotCrypto.encryptLocalSnapshot(snapshotId, serializedPayload);
    const recordCount = stores.reduce((count, store) => count + store.records.length, 0);
    const record: SyncSnapshotMetaRecord = {
      snapshotId,
      kind: 'pre_sync',
      formatVersion: SNAPSHOT_FORMAT_VERSION,
      databaseName: database.name,
      databaseVersion: database.version,
      createdAt,
      recordCount,
      sha256,
      payload: encrypted === null ? payload : null,
      serializedPayload: encrypted === null ? serializedPayload : null,
      encryptedPayload: encrypted?.ciphertext ?? null,
      encryptedNonce: encrypted?.nonce ?? null,
      verifiedAt: null,
      status: 'pending',
    };
    await executeIndexedDbRequest(database, LIFE_OS_SYNC_STORE.snapshotMeta, 'readwrite', (store) =>
      store.add(record),
    );
    try {
      const pendingRecord = await this.readSnapshotRecord(database, snapshotId);
      const pendingVerification =
        pendingRecord === undefined
          ? invalidVerification('not_found')
          : await this.verifySnapshotRecord(pendingRecord, false);
      if (!pendingVerification.valid) throw snapshotVerificationFailed();
      await executeIndexedDbRequest(
        database,
        LIFE_OS_SYNC_STORE.snapshotMeta,
        'readwrite',
        (store) =>
          store.put({
            ...record,
            verifiedAt: this.#clock.now().toISOString(),
            status: 'verified',
          } satisfies SyncSnapshotMetaRecord),
      );
      const verification = await this.verifySnapshot(snapshotId);
      if (!verification.valid || verification.snapshot === null) {
        throw snapshotVerificationFailed();
      }
      return verification.snapshot;
    } catch (error: unknown) {
      await executeIndexedDbRequest(
        database,
        LIFE_OS_SYNC_STORE.snapshotMeta,
        'readwrite',
        (store) => store.delete(snapshotId),
      );
      throw error;
    }
  }

  public async verifySnapshot(snapshotId: string): Promise<SnapshotVerification> {
    const database = await this.#database.open();
    const record = await this.readSnapshotRecord(database, snapshotId);
    if (record === undefined) return invalidVerification('not_found');
    return this.verifySnapshotRecord(record, true);
  }

  private readSnapshotRecord(
    database: IDBDatabase,
    snapshotId: string,
  ): Promise<SyncSnapshotMetaRecord | undefined> {
    return executeIndexedDbRequest<SyncSnapshotMetaRecord | undefined>(
      database,
      LIFE_OS_SYNC_STORE.snapshotMeta,
      'readonly',
      (store) => store.get(snapshotId),
    );
  }

  private async verifySnapshotRecord(
    record: SyncSnapshotMetaRecord,
    requireVerifiedStatus: boolean,
  ): Promise<SnapshotVerification> {
    if (record.serializedPayload !== null) {
      try {
        JSON.parse(record.serializedPayload);
      } catch {
        return invalidVerification('invalid_format');
      }
    }
    const payload = await this.readPayload(record);
    if (payload === null) return invalidVerification('invalid_format');
    if (!hasCompleteStoreManifest(payload.stores, payload.database.version))
      return invalidVerification('incomplete');
    const recordCount = payload.stores.reduce((count, store) => count + store.records.length, 0);
    if (recordCount !== record.recordCount) return invalidVerification('incomplete');
    const canonicalPayload = await canonicalStringify(payload);
    if (record.serializedPayload !== null && canonicalPayload !== record.serializedPayload) {
      return invalidVerification('checksum_mismatch');
    }
    if ((await this.computeSha256(canonicalPayload)) !== record.sha256) {
      return invalidVerification('checksum_mismatch');
    }
    if (
      payload.formatVersion !== record.formatVersion ||
      payload.createdAt !== record.createdAt ||
      payload.database.name !== record.databaseName ||
      payload.database.version !== record.databaseVersion ||
      record.kind !== 'pre_sync' ||
      (requireVerifiedStatus &&
        (record.status !== 'verified' || typeof record.verifiedAt !== 'string'))
    ) {
      return invalidVerification('invalid_format');
    }
    return { valid: true, reason: 'ok', snapshot: toReference(record) };
  }

  private async readPayload(record: SyncSnapshotMetaRecord): Promise<SnapshotPayload | null> {
    if (record.encryptedPayload !== null || record.encryptedNonce !== null) {
      if (
        record.encryptedPayload === null ||
        record.encryptedNonce === null ||
        this.#snapshotCrypto === null
      ) {
        return null;
      }
      try {
        const plaintext = await this.#snapshotCrypto.decryptLocalSnapshot(record.snapshotId, {
          ciphertext: record.encryptedPayload,
          nonce: record.encryptedNonce,
        });
        return parseSnapshotPayload(fromCanonicalJson(JSON.parse(plaintext) as unknown));
      } catch {
        return null;
      }
    }
    return parseSnapshotPayload(record.payload);
  }

  private readLocalSettings(): string | null {
    try {
      return this.#localStorage?.getItem(LOCAL_SETTINGS_STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }

  private async computeSha256(value: string): Promise<string> {
    if (this.#crypto === null) {
      throw new DomainError(
        'sync.snapshot_crypto_unavailable',
        'Браузер не поддерживает проверку целостности локального снимка.',
      );
    }
    const digest = await this.#crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
}

function readDomainStores(database: IDBDatabase): Promise<readonly SnapshotStorePayload[]> {
  const storeNames = Object.values(LIFE_OS_STORE).sort();
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction;
    try {
      transaction = database.transaction(storeNames, 'readonly');
    } catch (error: unknown) {
      reject(snapshotReadFailed(error));
      return;
    }
    const records = new Map<string, readonly unknown[]>();
    for (const storeName of storeNames) {
      const request = transaction.objectStore(storeName).getAll();
      request.addEventListener('success', () => records.set(storeName, request.result));
    }
    transaction.addEventListener('complete', () => {
      resolve(
        storeNames.map((name) => ({
          name,
          records: records.get(name) ?? [],
        })),
      );
    });
    transaction.addEventListener('abort', () => reject(snapshotReadFailed(transaction.error)));
    transaction.addEventListener('error', () => reject(snapshotReadFailed(transaction.error)));
  });
}

function parseSnapshotPayload(value: unknown): SnapshotPayload | null {
  try {
    if (!isRecord(value) || value.formatVersion !== SNAPSHOT_FORMAT_VERSION) return null;
    if (typeof value.createdAt !== 'string' || !isRecord(value.database)) return null;
    if (typeof value.database.name !== 'string' || typeof value.database.version !== 'number') {
      return null;
    }
    if (!Array.isArray(value.stores)) return null;
    const stores: SnapshotStorePayload[] = [];
    for (const candidate of value.stores) {
      if (!isRecord(candidate) || typeof candidate.name !== 'string') return null;
      if (!Array.isArray(candidate.records)) return null;
      stores.push({ name: candidate.name, records: candidate.records });
    }
    return {
      formatVersion: SNAPSHOT_FORMAT_VERSION,
      createdAt: value.createdAt,
      database: { name: value.database.name, version: value.database.version },
      stores,
      localSettings: parseLocalSettings(value.localSettings),
    };
  } catch {
    return null;
  }
}

function hasCompleteStoreManifest(
  stores: readonly SnapshotStorePayload[],
  version: number,
): boolean {
  const actual = stores.map(({ name }) => name).sort();
  const added = new Set<string>([
    'planningPeriods',
    'periodMemberships',
    'periodDecisions',
    'contributionLinks',
    'progressContributions',
    'recurrenceRules',
  ]);
  const expected = Object.values(LIFE_OS_STORE)
    .filter((name) => version >= 29 || name !== LIFE_OS_STORE.diaryEntries)
    .filter((name) => version >= 28 || name !== 'timeCapacity')
    .filter((name) => version >= 27 || name !== 'taskScenarios')
    .filter((name) => version >= 24 || !added.has(name))
    .filter(
      (name) =>
        version >= 25 || (name !== 'directionIndicators' && name !== 'balanceMonthlySnapshots'),
    )
    .sort();
  return (
    actual.length === expected.length && actual.every((name, index) => name === expected[index])
  );
}

async function canonicalStringify(value: unknown): Promise<string> {
  return JSON.stringify(await toCanonicalJson(value, new WeakSet<object>()));
}

async function toCanonicalJson(value: unknown, ancestors: WeakSet<object>): Promise<unknown> {
  if (value === null) return { type: 'null' };
  if (typeof value === 'string' || typeof value === 'boolean') {
    return { type: typeof value, value };
  }
  if (typeof value === 'number') {
    const encoded = Number.isNaN(value)
      ? 'NaN'
      : value === Number.POSITIVE_INFINITY
        ? 'Infinity'
        : value === Number.NEGATIVE_INFINITY
          ? '-Infinity'
          : Object.is(value, -0)
            ? '-0'
            : value.toString();
    return { type: 'number', value: encoded };
  }
  if (typeof value === 'undefined') return { type: 'undefined' };
  if (typeof value === 'bigint') return { type: 'bigint', value: value.toString() };
  if (typeof value !== 'object') throw unsupportedSnapshotValue();
  if (ancestors.has(value)) throw unsupportedSnapshotValue();

  ancestors.add(value);
  try {
    if (value instanceof Date) {
      return { type: 'date', value: Number.isNaN(value.getTime()) ? null : value.toISOString() };
    }
    if (value instanceof Blob) {
      return {
        type: 'blob',
        mimeType: value.type,
        bytes: bytesToHex(new Uint8Array(await value.arrayBuffer())),
      };
    }
    if (value instanceof ArrayBuffer) {
      return { type: 'array-buffer', bytes: bytesToHex(new Uint8Array(value)) };
    }
    if (ArrayBuffer.isView(value)) {
      return {
        type: 'array-buffer-view',
        viewType: value.constructor.name,
        bytes: bytesToHex(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)),
      };
    }
    if (value instanceof RegExp) {
      return { type: 'regexp', source: value.source, flags: value.flags };
    }
    if (value instanceof Map) {
      const entries: unknown[] = [];
      for (const [key, item] of value.entries()) {
        entries.push([
          await toCanonicalJson(key, ancestors),
          await toCanonicalJson(item, ancestors),
        ]);
      }
      return { type: 'map', entries };
    }
    if (value instanceof Set) {
      const items: unknown[] = [];
      for (const item of value.values()) items.push(await toCanonicalJson(item, ancestors));
      return { type: 'set', items };
    }
    if (Array.isArray(value)) {
      const items: unknown[] = [];
      for (const item of value) items.push(await toCanonicalJson(item, ancestors));
      return {
        type: 'array',
        items,
      };
    }
    if (isRecord(value)) {
      const entries: unknown[] = [];
      for (const key of Object.keys(value).sort()) {
        entries.push([key, await toCanonicalJson(value[key], ancestors)]);
      }
      return { type: 'object', entries };
    }
  } finally {
    ancestors.delete(value);
  }
  throw unsupportedSnapshotValue();
}

function fromCanonicalJson(value: unknown): unknown {
  if (!isRecord(value) || typeof value.type !== 'string') throw unsupportedSnapshotValue();
  if (value.type === 'null') return null;
  if (value.type === 'string' || value.type === 'boolean') return value.value;
  if (value.type === 'undefined') return undefined;
  if (value.type === 'bigint') return BigInt(String(value.value));
  if (value.type === 'number') {
    const encoded = String(value.value);
    if (encoded === 'NaN') return Number.NaN;
    if (encoded === 'Infinity') return Number.POSITIVE_INFINITY;
    if (encoded === '-Infinity') return Number.NEGATIVE_INFINITY;
    if (encoded === '-0') return -0;
    return Number(encoded);
  }
  if (value.type === 'date')
    return value.value === null ? new Date(Number.NaN) : new Date(String(value.value));
  if (value.type === 'blob') {
    return new Blob([bytesToArrayBuffer(hexToBytes(String(value.bytes)))], {
      type: String(value.mimeType),
    });
  }
  if (value.type === 'array-buffer') return bytesToArrayBuffer(hexToBytes(String(value.bytes)));
  if (value.type === 'array-buffer-view') {
    return restoreArrayBufferView(String(value.viewType), hexToBytes(String(value.bytes)));
  }
  if (value.type === 'regexp') return new RegExp(String(value.source), String(value.flags));
  if (value.type === 'array') {
    if (!Array.isArray(value.items)) throw unsupportedSnapshotValue();
    return value.items.map(fromCanonicalJson);
  }
  if (value.type === 'object') {
    if (!Array.isArray(value.entries)) throw unsupportedSnapshotValue();
    return Object.fromEntries(
      value.entries.map((entry) => {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string')
          throw unsupportedSnapshotValue();
        return [entry[0], fromCanonicalJson(entry[1])];
      }),
    );
  }
  if (value.type === 'map') {
    if (!Array.isArray(value.entries)) throw unsupportedSnapshotValue();
    return new Map(
      value.entries.map((entry) => {
        if (!Array.isArray(entry) || entry.length !== 2) throw unsupportedSnapshotValue();
        return [fromCanonicalJson(entry[0]), fromCanonicalJson(entry[1])];
      }),
    );
  }
  if (value.type === 'set') {
    if (!Array.isArray(value.items)) throw unsupportedSnapshotValue();
    return new Set(value.items.map(fromCanonicalJson));
  }
  throw unsupportedSnapshotValue();
}

function parseLocalSettings(value: unknown): SnapshotPayload['localSettings'] {
  if (value === null) return null;
  try {
    return projectMeaningfulLocalSettings(JSON.stringify(value));
  } catch {
    return null;
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(value: string): Uint8Array {
  if (value.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(value)) throw unsupportedSnapshotValue();
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function restoreArrayBufferView(viewType: string, bytes: Uint8Array): ArrayBufferView {
  const buffer = bytesToArrayBuffer(bytes);
  switch (viewType) {
    case 'DataView':
      return new DataView(buffer);
    case 'Int8Array':
      return new Int8Array(buffer);
    case 'Uint8Array':
      return new Uint8Array(buffer);
    case 'Uint8ClampedArray':
      return new Uint8ClampedArray(buffer);
    case 'Int16Array':
      return new Int16Array(buffer);
    case 'Uint16Array':
      return new Uint16Array(buffer);
    case 'Int32Array':
      return new Int32Array(buffer);
    case 'Uint32Array':
      return new Uint32Array(buffer);
    case 'Float32Array':
      return new Float32Array(buffer);
    case 'Float64Array':
      return new Float64Array(buffer);
    case 'BigInt64Array':
      return new BigInt64Array(buffer);
    case 'BigUint64Array':
      return new BigUint64Array(buffer);
    default:
      throw unsupportedSnapshotValue();
  }
}

function unsupportedSnapshotValue(): DomainError {
  return new DomainError(
    'sync.snapshot_unsupported_value',
    'Локальные данные содержат значение, которое нельзя безопасно включить в снимок.',
  );
}

function toReference(record: SyncSnapshotMetaRecord): LocalSnapshotReference {
  return {
    snapshotId: record.snapshotId,
    createdAt: record.createdAt,
    databaseName: record.databaseName,
    databaseVersion: record.databaseVersion,
    recordCount: record.recordCount,
    sha256: record.sha256,
  };
}

function invalidVerification(
  reason: Exclude<SnapshotVerification['reason'], 'ok'>,
): SnapshotVerification {
  return { valid: false, reason, snapshot: null };
}

function snapshotVerificationFailed(): DomainError {
  return new DomainError(
    'sync.snapshot_verification_failed',
    'Локальный снимок не прошёл проверку целостности.',
  );
}

function snapshotReadFailed(error: unknown): DomainError {
  return new DomainError(
    'sync.snapshot_read_failed',
    'Не удалось прочитать локальные данные для снимка.',
    { cause: error },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveLocalStorage(): SnapshotLocalStorage | null {
  try {
    return 'localStorage' in globalThis ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}
