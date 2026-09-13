import type { EveningRitualSettings } from '../../application/evening-settings';
import type { LifeOsIndexedDb } from '../persistence/indexed-db/LifeOsIndexedDb';
import { LIFE_OS_SYNC_STORE } from '../persistence/indexed-db/LifeOsIndexedDb';
import type { IndexedDbPilotMutationRecorder } from './pilot/IndexedDbPilotMutationRecorder';
import { normalizePilotRecord } from './pilot/PilotSyncRegistryAdapters';
import type { SyncObjectMetaRecord } from '../persistence/records';

export const USER_SETTINGS_OBJECT_ID = 'lifeos-user-settings';
const PENDING_REMOTE_ID = 'user-settings-pending-remote';

interface PendingRemoteSettings {
  readonly id: typeof PENDING_REMOTE_ID;
  readonly previous: EveningRitualSettings;
  readonly record: Readonly<Record<string, unknown>>;
}

export interface MeaningfulLocalSettingsBridge {
  readEveningRitualForSync(): EveningRitualSettings | null;
  applyEveningRitualFromSync(settings: EveningRitualSettings): boolean;
}

export interface MeaningfulUserSettingsRecord {
  readonly id: typeof USER_SETTINGS_OBJECT_ID;
  readonly schemaVersion: 1;
  readonly eveningRitual: EveningRitualSettings;
}

export class MeaningfulLocalSettingsSync {
  public constructor(
    private readonly database: LifeOsIndexedDb,
    private readonly recorder: IndexedDbPilotMutationRecorder,
    private readonly bridge: MeaningfulLocalSettingsBridge,
  ) {}

  public async reconcile(): Promise<boolean> {
    if (!(await this.materializeRemote())) return false;
    const database = await this.database.open();
    const transaction = database.transaction(
      [LIFE_OS_SYNC_STORE.settings, LIFE_OS_SYNC_STORE.objectMeta, LIFE_OS_SYNC_STORE.outbox],
      'readwrite',
    );
    const completion = done(transaction);
    void completion.catch(() => undefined);
    try {
      const store = transaction.objectStore(LIFE_OS_SYNC_STORE.settings);
      const [existing, meta, pending] = await Promise.all([
        request<MeaningfulUserSettingsRecord | undefined>(store.get(USER_SETTINGS_OBJECT_ID)),
        request<SyncObjectMetaRecord | undefined>(
          transaction.objectStore(LIFE_OS_SYNC_STORE.objectMeta).get(USER_SETTINGS_OBJECT_ID),
        ),
        request<PendingRemoteSettings | undefined>(store.get(PENDING_REMOTE_ID)),
      ]);
      if (pending !== undefined) {
        await completion;
        return this.reconcile();
      }
      // Read after acquiring the write transaction, not before a possibly queued remote commit.
      const eveningRitual = this.bridge.readEveningRitualForSync();
      if (eveningRitual === null) {
        await completion;
        return false;
      }
      const record = normalizePilotRecord('user_settings', {
        id: USER_SETTINGS_OBJECT_ID,
        schemaVersion: 1,
        eveningRitual,
      });
      if (
        existing !== undefined &&
        meta !== undefined &&
        JSON.stringify(existing) === JSON.stringify(record)
      ) {
        await completion;
        return false;
      }
      store.put(record);
      const recorded = await this.recorder.recordUpsert(transaction, 'user_settings', record);
      await completion;
      this.recorder.notifyCommitted(recorded);
      return recorded;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        /* Already aborted. */
      }
      await completion.catch(() => undefined);
      throw error;
    }
  }

  public applyRemote(value: Readonly<Record<string, unknown>>): boolean {
    const normalized = normalizePilotRecord('user_settings', value);
    return this.bridge.applyEveningRitualFromSync(
      normalized.eveningRitual as EveningRitualSettings,
    );
  }

  public readCurrentForRecovery(): Readonly<Record<string, unknown>> | null {
    const eveningRitual = this.bridge.readEveningRitualForSync();
    return eveningRitual === null
      ? null
      : normalizePilotRecord('user_settings', {
          id: USER_SETTINGS_OBJECT_ID,
          schemaVersion: 1,
          eveningRitual,
        });
  }

  public stageRemote(
    transaction: IDBTransaction,
    value: Readonly<Record<string, unknown>>,
  ): boolean {
    const previous = this.bridge.readEveningRitualForSync();
    if (previous === null) return false;
    transaction.objectStore(LIFE_OS_SYNC_STORE.settings).put({
      id: PENDING_REMOTE_ID,
      previous,
      record: normalizePilotRecord('user_settings', value),
    } satisfies PendingRemoteSettings);
    return true;
  }

  public async materializeRemote(): Promise<boolean> {
    const database = await this.database.open();
    const transaction = database.transaction(LIFE_OS_SYNC_STORE.settings, 'readwrite');
    const completion = done(transaction);
    void completion.catch(() => undefined);
    try {
      const store = transaction.objectStore(LIFE_OS_SYNC_STORE.settings);
      const [pending, shadow] = await Promise.all([
        request<PendingRemoteSettings | undefined>(store.get(PENDING_REMOTE_ID)),
        request<Readonly<Record<string, unknown>> | undefined>(store.get(USER_SETTINGS_OBJECT_ID)),
      ]);
      if (pending === undefined) {
        await completion;
        return true;
      }
      if (JSON.stringify(shadow) !== JSON.stringify(pending.record)) {
        store.delete(PENDING_REMOTE_ID);
        await completion;
        return true;
      }
      const current = this.bridge.readEveningRitualForSync();
      if (current === null) {
        await completion;
        return false;
      }
      // A crash may leave the marker after materialization, or a later local edit may supersede it.
      // Only replace the value observed when the remote event was staged.
      if (
        JSON.stringify(current) === JSON.stringify(pending.previous) &&
        !this.applyRemote(pending.record)
      ) {
        await completion;
        return false;
      }
      store.delete(PENDING_REMOTE_ID);
      await completion;
      return true;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        /* Already aborted. */
      }
      await completion.catch(() => undefined);
      throw error;
    }
  }
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
    transaction.onabort = () => reject(transaction.error);
  });
}
