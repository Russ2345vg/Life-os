import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_EVENING_RITUAL_SETTINGS } from '../../application/evening-settings';
import { LIFE_OS_SYNC_STORE, LifeOsIndexedDb } from '../persistence/indexed-db/LifeOsIndexedDb';
import type { SyncSettingsRecord } from '../persistence/records';
import { IndexedDbPilotMutationRecorder } from './pilot/IndexedDbPilotMutationRecorder';
import { MeaningfulLocalSettingsSync } from './MeaningfulLocalSettingsSync';
import { BrowserLocalSettingsStore } from '../../app/settings/BrowserLocalSettingsStore';
import { IndexedDbPilotSyncStore } from './pilot/IndexedDbPilotSyncStore';

describe('MeaningfulLocalSettingsSync', () => {
  it('does not republish an old preference when a remote commit races reconciliation', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();
    await put(database, LIFE_OS_SYNC_STORE.settings, activeSettings());
    const values = new Map<string, string>();
    const bridge = new BrowserLocalSettingsStore({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    });
    const remote = { ...bridge.load().settings.eveningRitual, notificationEnabled: true };
    const sync = new MeaningfulLocalSettingsSync(
      indexedDb,
      new IndexedDbPilotMutationRecorder(),
      bridge,
    );
    const store = new IndexedDbPilotSyncStore(indexedDb, undefined, undefined, undefined, sync);
    let opens = 0;
    vi.spyOn(indexedDb, 'open').mockImplementation(async () => {
      opens += 1;
      if (opens === 2)
        await store.applyPulled(
          'space',
          1,
          {
            protocolVersion: 1,
            schemaVersion: 1,
            entityType: 'user_settings',
            operation: 'upsert',
            objectId: 'lifeos-user-settings',
            eventId: 'remote-settings',
            originDeviceId: 'android',
            keyEpoch: 3,
            baseRevision: 0,
            revision: 1,
            hlc: { wallTime: 100, logical: 0 },
            record: { id: 'lifeos-user-settings', schemaVersion: 1, eveningRitual: remote },
          },
          'transport',
          { kind: 'fast_forward', winner: 'incoming' },
        );
      return database;
    });
    expect(await sync.reconcile()).toBe(false);
    expect(bridge.load().settings.eveningRitual).toEqual(remote);
    expect(await all(database, LIFE_OS_SYNC_STORE.outbox)).toHaveLength(0);
    expect((await store.localState('user_settings', 'lifeos-user-settings')).record).toMatchObject({
      eveningRitual: remote,
    });
  });

  it.each([false, true])(
    'recovers committed remote settings after restart, preserving a newer local edit: %s',
    async (editLocally) => {
      const factory = new IDBFactory();
      const indexedDb = new LifeOsIndexedDb(factory);
      const database = await indexedDb.open();
      await put(database, LIFE_OS_SYNC_STORE.settings, activeSettings());
      const values = new Map<string, string>();
      const bridge = new BrowserLocalSettingsStore({
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => {
          values.set(key, value);
        },
        removeItem: (key) => {
          values.delete(key);
        },
      });
      const original = bridge.load().settings;
      const remote = {
        ...original.eveningRitual,
        notificationEnabled: !original.eveningRitual.notificationEnabled,
      };
      const recorder = new IndexedDbPilotMutationRecorder();
      const sync = new MeaningfulLocalSettingsSync(indexedDb, recorder, bridge);
      const store = new IndexedDbPilotSyncStore(indexedDb, undefined, undefined, undefined, {
        stageRemote: sync.stageRemote.bind(sync),
        materializeRemote: async () => true, // Simulates the process stopping before localStorage materialization.
      });
      await store.applyPulled(
        'space',
        1,
        {
          protocolVersion: 1,
          schemaVersion: 1,
          entityType: 'user_settings',
          operation: 'upsert',
          objectId: 'lifeos-user-settings',
          eventId: 'remote-settings',
          originDeviceId: 'android',
          keyEpoch: 3,
          baseRevision: 0,
          revision: 1,
          hlc: { wallTime: 100, logical: 0 },
          record: { id: 'lifeos-user-settings', schemaVersion: 1, eveningRitual: remote },
        },
        'transport',
        { kind: 'fast_forward', winner: 'incoming' },
      );
      expect(bridge.load().settings.eveningRitual).toEqual(original.eveningRitual);
      const localEdit = { ...original.eveningRitual, targetSleepTime: '22:00' };
      if (editLocally) bridge.save({ ...original, eveningRitual: localEdit });
      indexedDb.close();
      const restarted = new LifeOsIndexedDb(factory);
      const recovered = new MeaningfulLocalSettingsSync(restarted, recorder, bridge);
      expect(await recovered.reconcile()).toBe(editLocally);
      expect(bridge.load().settings.eveningRitual).toEqual(editLocally ? localEdit : remote);
      expect(await recovered.reconcile()).toBe(false);
      const connection = await restarted.open();
      expect(await all(connection, LIFE_OS_SYNC_STORE.outbox)).toHaveLength(editLocally ? 1 : 0);
      expect(
        (await all<{ id: string }>(connection, LIFE_OS_SYNC_STORE.settings)).some(
          ({ id }) => id === 'user-settings-pending-remote',
        ),
      ).toBe(false);
    },
  );

  it('does not materialize remote settings when a later IndexedDB write aborts', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();
    const values = new Map<string, string>();
    const bridge = new BrowserLocalSettingsStore({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    });
    const original = bridge.load().settings.eveningRitual;
    const sync = new MeaningfulLocalSettingsSync(
      indexedDb,
      new IndexedDbPilotMutationRecorder(),
      bridge,
    );
    await put(database, LIFE_OS_SYNC_STORE.settings, {
      id: 'pilot-clock',
      wallTime: -1,
      logical: -1,
    });
    const store = new IndexedDbPilotSyncStore(indexedDb, undefined, undefined, undefined, sync);
    await expect(
      store.applyPulled(
        'space',
        1,
        {
          protocolVersion: 1,
          schemaVersion: 1,
          entityType: 'user_settings',
          operation: 'upsert',
          objectId: 'lifeos-user-settings',
          eventId: 'remote-settings',
          originDeviceId: 'android',
          keyEpoch: 1,
          baseRevision: 0,
          revision: 1,
          hlc: { wallTime: 100, logical: 0 },
          record: {
            id: 'lifeos-user-settings',
            schemaVersion: 1,
            eveningRitual: { ...original, notificationEnabled: !original.notificationEnabled },
          },
        },
        'transport',
        { kind: 'fast_forward', winner: 'incoming' },
      ),
    ).rejects.toThrow();
    expect(bridge.load().settings.eveningRitual).toEqual(original);
    expect(await store.hasApplied('remote-settings')).toBe(false);
    expect(await store.cursor('space')).toBe(0);
  });

  it('records only the versioned Evening Ritual projection and deduplicates an unchanged restart', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();
    await put(database, LIFE_OS_SYNC_STORE.settings, activeSettings());
    const bridge = {
      readEveningRitualForSync: vi.fn(() => ({
        ...DEFAULT_EVENING_RITUAL_SETTINGS,
        notificationEnabled: true,
      })),
      applyEveningRitualFromSync: vi.fn(() => true),
    };
    const ids = ['transport-settings', 'event-settings'];
    const sync = new MeaningfulLocalSettingsSync(
      indexedDb,
      new IndexedDbPilotMutationRecorder({
        createId: () => ids.shift() ?? 'unexpected',
        now: () => new Date('2026-09-07T00:00:00.000Z'),
      }),
      bridge,
    );

    await expect(sync.reconcile()).resolves.toBe(true);
    await expect(sync.reconcile()).resolves.toBe(false);
    const outbox = await all<Record<string, unknown>>(database, LIFE_OS_SYNC_STORE.outbox);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      entityType: 'user_settings',
      objectId: 'lifeos-user-settings',
    });
    expect(String(outbox[0]?.serializedPayload)).toContain('notificationEnabled');
    expect(String(outbox[0]?.serializedPayload)).not.toContain('interfaceDensity');
  });

  it('applies validated remote Evening Ritual settings through the bridge', async () => {
    const bridge = {
      readEveningRitualForSync: vi.fn(() => DEFAULT_EVENING_RITUAL_SETTINGS),
      applyEveningRitualFromSync: vi.fn(() => true),
    };
    const sync = new MeaningfulLocalSettingsSync(
      new LifeOsIndexedDb(new IDBFactory()),
      new IndexedDbPilotMutationRecorder(),
      bridge,
    );
    const remote = {
      id: 'lifeos-user-settings',
      schemaVersion: 1 as const,
      eveningRitual: { ...DEFAULT_EVENING_RITUAL_SETTINGS, notificationEnabled: true },
    };

    expect(sync.applyRemote(remote)).toBe(true);
    expect(bridge.applyEveningRitualFromSync).toHaveBeenCalledWith(remote.eveningRitual);
  });

  it('queues a pre-pairing preference after sync becomes active even when its shadow already exists', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();
    const bridge = {
      readEveningRitualForSync: vi.fn(() => DEFAULT_EVENING_RITUAL_SETTINGS),
      applyEveningRitualFromSync: vi.fn(() => true),
    };
    const ids = ['transport-settings', 'event-settings'];
    const sync = new MeaningfulLocalSettingsSync(
      indexedDb,
      new IndexedDbPilotMutationRecorder({ createId: () => ids.shift() ?? 'unexpected' }),
      bridge,
    );

    await expect(sync.reconcile()).resolves.toBe(false);
    await put(database, LIFE_OS_SYNC_STORE.settings, activeSettings());
    await expect(sync.reconcile()).resolves.toBe(true);
    expect(await all(database, LIFE_OS_SYNC_STORE.outbox)).toHaveLength(1);
  });
});

function activeSettings(): SyncSettingsRecord {
  return {
    id: 'sync',
    enabled: false,
    deviceId: 'device',
    deviceName: 'Device',
    platform: 'windows',
    publicKey: 'public',
    createdAt: '',
    spaceId: 'space',
    membershipStatus: 'active',
    currentKeyEpoch: 3,
    recoveryConfirmedAt: '',
    snapshotId: 'snapshot',
    setupState: 'configured',
    pendingRevokedDeviceId: null,
    updatedAt: '',
  };
}

async function put(database: IDBDatabase, storeName: string, value: object): Promise<void> {
  const transaction = database.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).put(value);
  await done(transaction);
}

async function all<T>(database: IDBDatabase, storeName: string): Promise<T[]> {
  const transaction = database.transaction(storeName, 'readonly');
  return request(transaction.objectStore(storeName).getAll()) as Promise<T[]>;
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
