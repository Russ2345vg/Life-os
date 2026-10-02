import type { LifeOsIndexedDb } from '../persistence/indexed-db/LifeOsIndexedDb';
import type { SyncSettingsRecord } from '../persistence/records/SyncStoreRecords';

const RECORD_ID = 'walk-data-format:v2';

interface ConfirmedDataFormat {
  readonly id: typeof RECORD_ID;
  readonly spaceId: string;
  readonly deviceId: string;
  readonly minimumDataFormat: 2;
}

export async function confirmedWalkDataFormat(
  transaction: IDBTransaction,
  installation: SyncSettingsRecord,
): Promise<1 | 2> {
  const record = await request<ConfirmedDataFormat | undefined>(
    transaction.objectStore('sync_settings').get(RECORD_ID),
  );
  return record?.spaceId === installation.spaceId &&
    record.deviceId === installation.deviceId &&
    record.minimumDataFormat === 2
    ? 2
    : 1;
}

export async function saveConfirmedWalkDataFormat(
  database: LifeOsIndexedDb,
  spaceId: string,
  deviceId: string,
  format: 1 | 2,
): Promise<void> {
  const db = await database.open();
  const transaction = db.transaction('sync_settings', 'readwrite');
  const store = transaction.objectStore('sync_settings');
  const current = await request<SyncSettingsRecord | undefined>(store.get('sync'));
  if (
    current?.spaceId !== spaceId ||
    current.deviceId !== deviceId ||
    current.membershipStatus !== 'active'
  ) {
    transaction.abort();
    throw new Error('Sync installation changed during data-format negotiation.');
  }
  if (format === 2)
    store.put({
      id: RECORD_ID,
      spaceId,
      deviceId,
      minimumDataFormat: 2,
    } satisfies ConfirmedDataFormat);
  else store.delete(RECORD_ID);
  await done(transaction);
}

function request<T>(source: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    source.onsuccess = () => resolve(source.result);
    source.onerror = () => reject(source.error);
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}
