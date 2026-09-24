import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_EVENING_RITUAL_SETTINGS } from '../../application/evening-settings';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import type { KeyValueStorage } from '../../app/settings/BrowserLocalSettingsStore';
import type { SyncSnapshotMetaRecord } from '../persistence/records';
import {
  LIFE_OS_DATABASE_NAME,
  LIFE_OS_DATABASE_VERSION,
  LIFE_OS_STORE,
  LIFE_OS_SYNC_STORE,
  LifeOsIndexedDb,
} from '../persistence/indexed-db/LifeOsIndexedDb';
import { executeIndexedDbRequest } from '../persistence/indexed-db/IndexedDbRequest';
import { IndexedDbSnapshotService } from './IndexedDbSnapshotService';

interface SnapshotPayloadView {
  readonly database: Readonly<{ name: string; version: number }>;
  readonly stores: readonly Readonly<{ name: string; records: readonly unknown[] }>[];
  readonly localSettings: unknown;
}

describe('IndexedDbSnapshotService', () => {
  it.each([23, 24, 25, 26])(
    'verifies a schema %s backup after adding scenarios',
    async (version) => {
      const { database, service } = await createService('schema23');
      const created = await service.createPreSyncSnapshot(),
        opened = await database.open(),
        stored = (await readSnapshotRecord(opened, created.snapshotId))!;
      const payload = stored.payload as SnapshotPayloadView;
      const added = new Set([
        'taskScenarios',
        ...(version < 25 ? ['directionIndicators', 'balanceMonthlySnapshots'] : []),
        ...(version < 24
          ? [
              'planningPeriods',
              'periodMemberships',
              'periodDecisions',
              'contributionLinks',
              'progressContributions',
              'recurrenceRules',
            ]
          : []),
      ]);
      const oldPayload = {
        ...payload,
        database: { ...payload.database, version },
        stores: payload.stores.filter((s) => !added.has(s.name)),
      };
      type Node = { type: string; value?: string; entries?: [string, Node][]; items?: Node[] };
      const canonical = JSON.parse(stored.serializedPayload!) as Node;
      const field = (node: Node, key: string) => node.entries!.find(([name]) => name === key)![1];
      field(field(canonical, 'database'), 'version').value = String(version);
      const stores = field(canonical, 'stores');
      stores.items = stores.items!.filter((store) => !added.has(field(store, 'name').value!));
      const serializedPayload = JSON.stringify(canonical);
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(serializedPayload),
      );
      const sha256 = [...new Uint8Array(digest)]
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('');
      await writeSnapshotRecord(opened, {
        ...stored,
        databaseVersion: version,
        payload: oldPayload,
        serializedPayload,
        sha256,
      });
      await expect(service.verifySnapshot(created.snapshotId)).resolves.toMatchObject({
        valid: true,
      });
      database.close();
    },
  );

  it('keeps the recoverable snapshot payload encrypted at rest when secure storage is available', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const payloads = new Map<string, string>();
    const snapshotCrypto = {
      encryptLocalSnapshot: vi.fn(async (snapshotId: string, plaintext: string) => {
        payloads.set(snapshotId, plaintext);
        return { ciphertext: 'opaque-ciphertext', nonce: 'opaque-nonce' };
      }),
      decryptLocalSnapshot: vi.fn(async (snapshotId: string) => payloads.get(snapshotId) ?? ''),
    };
    const service = new IndexedDbSnapshotService(
      database,
      new FakeClock(new Date('2026-09-04T10:00:00.000Z')),
      new FakeIdGenerator('encrypted'),
      null,
      globalThis.crypto,
      snapshotCrypto,
    );

    const created = await service.createPreSyncSnapshot();
    const stored = await readSnapshotRecord(await database.open(), created.snapshotId);
    expect(stored).toMatchObject({
      payload: null,
      serializedPayload: null,
      encryptedPayload: 'opaque-ciphertext',
      encryptedNonce: 'opaque-nonce',
      status: 'verified',
    });
    await expect(service.verifySnapshot(created.snapshotId)).resolves.toMatchObject({
      valid: true,
    });
  });

  it('creates and verifies a durable snapshot without changing domain records', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const opened = await database.open();
    const goal = {
      id: 'goal-snapshot',
      schemaVersion: 1,
      legacyField: { preserved: true },
      legacyDate: new Date('2024-01-02T03:04:05.000Z'),
      legacyBinary: Uint8Array.from([1, 2, 3]).buffer,
      legacyBlob: new Blob(['legacy-photo'], { type: 'image/test' }),
      coverImage: { dataUrl: 'data:image/png;base64,AQID', mimeType: 'image/png', sizeBytes: 3 },
    };
    const walk = {
      id: 'walk-snapshot',
      schemaVersion: 1,
      photo: { dataUrl: 'data:image/jpeg;base64,AQID', mimeType: 'image/jpeg', sizeBytes: 3 },
    };
    const decision = { id: 'decision-snapshot', title: 'Существующая запись без перепаковки' };
    const seed = opened.transaction(
      [LIFE_OS_STORE.goals, LIFE_OS_STORE.walks, LIFE_OS_STORE.decisions],
      'readwrite',
    );
    seed.objectStore(LIFE_OS_STORE.goals).put(goal);
    seed.objectStore(LIFE_OS_STORE.walks).put(walk);
    seed.objectStore(LIFE_OS_STORE.decisions).put(decision);
    await transactionDone(seed);
    const before = await readDomainFixtures(opened);
    const transactionSpy = vi.spyOn(opened, 'transaction');
    const storage = new MemoryStorage();
    storage.setItem(
      'lifeos.local-settings.v1',
      JSON.stringify({
        defaultSection: 'more',
        interfaceDensity: 'compact',
        reduceMotion: true,
        showMobileWeekday: false,
        eveningRitual: DEFAULT_EVENING_RITUAL_SETTINGS,
      }),
    );
    const service = new IndexedDbSnapshotService(
      database,
      new FakeClock(new Date('2026-09-03T10:00:00.000Z')),
      new FakeIdGenerator('snapshot'),
      storage,
    );

    const created = await service.createPreSyncSnapshot();

    expect(await readDomainFixtures(opened)).toEqual(before);
    expect(created).toMatchObject({
      snapshotId: 'snapshot-1',
      createdAt: '2026-09-03T10:00:00.000Z',
      databaseName: LIFE_OS_DATABASE_NAME,
      databaseVersion: LIFE_OS_DATABASE_VERSION,
    });
    const stored = await readSnapshotRecord(opened, created.snapshotId);
    expect(stored).not.toBeUndefined();
    expect(stored).toMatchObject({ status: 'verified', sha256: created.sha256 });
    const payload = stored!.payload as SnapshotPayloadView;
    expect(payload.database).toEqual({
      name: LIFE_OS_DATABASE_NAME,
      version: LIFE_OS_DATABASE_VERSION,
    });
    expect(payload.stores.map(({ name }) => name).sort()).toEqual(
      Object.values(LIFE_OS_STORE).sort(),
    );
    const snapshottedGoal = recordsFor(payload, LIFE_OS_STORE.goals)[0] as typeof goal;
    expect(snapshottedGoal).toEqual(goal);
    expect(snapshottedGoal.legacyDate).toBeInstanceOf(Date);
    expect([...new Uint8Array(snapshottedGoal.legacyBinary)]).toEqual([1, 2, 3]);
    expect(snapshottedGoal.legacyBlob).toBeInstanceOf(Blob);
    await expect(snapshottedGoal.legacyBlob.text()).resolves.toBe('legacy-photo');
    expect(recordsFor(payload, LIFE_OS_STORE.walks)).toContainEqual(walk);
    expect(payload.localSettings).toEqual({ eveningRitual: DEFAULT_EVENING_RITUAL_SETTINGS });
    expect(transactionSpy).toHaveBeenCalledWith(Object.values(LIFE_OS_STORE).sort(), 'readonly');
    await expect(service.verifySnapshot(created.snapshotId)).resolves.toEqual({
      valid: true,
      reason: 'ok',
      snapshot: created,
    });
    database.close();
  });

  it('detects checksum corruption before a snapshot can be trusted', async () => {
    const { database, service } = await createService('corrupt');
    const created = await service.createPreSyncSnapshot();
    const opened = await database.open();
    const stored = (await readSnapshotRecord(opened, created.snapshotId))!;
    await writeSnapshotRecord(opened, {
      ...stored,
      serializedPayload: `${stored.serializedPayload} `,
    });

    await expect(service.verifySnapshot(created.snapshotId)).resolves.toMatchObject({
      valid: false,
      reason: 'checksum_mismatch',
      snapshot: null,
    });
    database.close();
  });

  it('rejects a snapshot whose required store manifest is incomplete', async () => {
    const { database, service } = await createService('incomplete');
    const created = await service.createPreSyncSnapshot();
    const opened = await database.open();
    const stored = (await readSnapshotRecord(opened, created.snapshotId))!;
    const payload = stored.payload as SnapshotPayloadView;
    await writeSnapshotRecord(opened, {
      ...stored,
      payload: { ...payload, stores: payload.stores.slice(1) },
    });

    await expect(service.verifySnapshot(created.snapshotId)).resolves.toMatchObject({
      valid: false,
      reason: 'incomplete',
      snapshot: null,
    });
    database.close();
  });

  it('rejects malformed serialization and inconsistent integrity metadata', async () => {
    const { database, service } = await createService('metadata');
    const created = await service.createPreSyncSnapshot();
    const opened = await database.open();
    const stored = (await readSnapshotRecord(opened, created.snapshotId))!;

    await writeSnapshotRecord(opened, { ...stored, serializedPayload: '{broken' });
    await expect(service.verifySnapshot(created.snapshotId)).resolves.toMatchObject({
      valid: false,
      reason: 'invalid_format',
    });

    await writeSnapshotRecord(opened, { ...stored, recordCount: stored.recordCount + 1 });
    await expect(service.verifySnapshot(created.snapshotId)).resolves.toMatchObject({
      valid: false,
      reason: 'incomplete',
    });

    await writeSnapshotRecord(opened, { ...stored, databaseVersion: stored.databaseVersion - 1 });
    await expect(service.verifySnapshot(created.snapshotId)).resolves.toMatchObject({
      valid: false,
      reason: 'invalid_format',
    });

    await writeSnapshotRecord(opened, { ...stored, status: 'pending', verifiedAt: null });
    await expect(service.verifySnapshot(created.snapshotId)).resolves.toMatchObject({
      valid: false,
      reason: 'invalid_format',
    });
    database.close();
  });

  it('produces the same digest for equivalent objects with different key insertion order', async () => {
    const first = await createService('deterministic-a');
    const second = await createService('deterministic-b');
    const firstDatabase = await first.database.open();
    const secondDatabase = await second.database.open();
    await seedDecision(firstDatabase, { id: 'stable', alpha: 1, beta: 2 });
    await seedDecision(secondDatabase, { beta: 2, alpha: 1, id: 'stable' });

    const firstSnapshot = await first.service.createPreSyncSnapshot();
    const secondSnapshot = await second.service.createPreSyncSnapshot();

    expect(firstSnapshot.sha256).toBe(secondSnapshot.sha256);
    first.database.close();
    second.database.close();
  });

  it('returns not_found for an unknown snapshot id', async () => {
    const { database, service } = await createService('missing');

    await expect(service.verifySnapshot('missing-snapshot')).resolves.toEqual({
      valid: false,
      reason: 'not_found',
      snapshot: null,
    });
    database.close();
  });
});

class MemoryStorage implements KeyValueStorage {
  readonly #values = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.#values.set(key, value);
  }

  public removeItem(key: string): void {
    this.#values.delete(key);
  }
}

async function createService(prefix: string) {
  const database = new LifeOsIndexedDb(new IDBFactory());
  const service = new IndexedDbSnapshotService(
    database,
    new FakeClock(new Date('2026-09-03T11:00:00.000Z')),
    new FakeIdGenerator(prefix),
    new MemoryStorage(),
  );
  return { database, service };
}

async function readDomainFixtures(database: IDBDatabase) {
  return Promise.all(
    [LIFE_OS_STORE.goals, LIFE_OS_STORE.walks, LIFE_OS_STORE.decisions].map((storeName) =>
      executeIndexedDbRequest(database, storeName, 'readonly', (store) => store.getAll()),
    ),
  );
}

function readSnapshotRecord(database: IDBDatabase, snapshotId: string) {
  return executeIndexedDbRequest<SyncSnapshotMetaRecord | undefined>(
    database,
    LIFE_OS_SYNC_STORE.snapshotMeta,
    'readonly',
    (store) => store.get(snapshotId),
  );
}

async function writeSnapshotRecord(database: IDBDatabase, record: SyncSnapshotMetaRecord) {
  await executeIndexedDbRequest(database, LIFE_OS_SYNC_STORE.snapshotMeta, 'readwrite', (store) =>
    store.put(record),
  );
}

async function seedDecision(database: IDBDatabase, record: Readonly<Record<string, unknown>>) {
  await executeIndexedDbRequest(database, LIFE_OS_STORE.decisions, 'readwrite', (store) =>
    store.put(record),
  );
}

function recordsFor(payload: SnapshotPayloadView, storeName: string): readonly unknown[] {
  return payload.stores.find(({ name }) => name === storeName)?.records ?? [];
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve());
    transaction.addEventListener('abort', () => reject(transaction.error));
    transaction.addEventListener('error', () => reject(transaction.error));
  });
}
