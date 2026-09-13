import type {
  CachedSyncDevice,
  SyncDeviceCacheRepository,
} from '../../application/sync/ports/SyncDeviceCacheRepository';
import type { SyncDeviceCacheRecord } from '../persistence/records';
import {
  LIFE_OS_SYNC_STORE,
  type LifeOsIndexedDb,
} from '../persistence/indexed-db/LifeOsIndexedDb';

export class IndexedDbSyncDeviceCacheRepository implements SyncDeviceCacheRepository {
  public constructor(private readonly database: LifeOsIndexedDb) {}

  public async list(spaceId: string): Promise<readonly CachedSyncDevice[]> {
    const database = await this.database.open();
    const transaction = database.transaction(LIFE_OS_SYNC_STORE.deviceCache, 'readonly');
    const request = transaction
      .objectStore(LIFE_OS_SYNC_STORE.deviceCache)
      .index('bySpaceId')
      .getAll(spaceId);
    const records = await requestResult<SyncDeviceCacheRecord[]>(request, transaction);
    return records
      .map(toCachedDevice)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  public async replaceForSpace(
    spaceId: string,
    devices: readonly CachedSyncDevice[],
  ): Promise<void> {
    if (devices.some((device) => device.spaceId !== spaceId)) {
      throw new Error('Cannot cache a device from another Sync space.');
    }
    const database = await this.database.open();
    const transaction = database.transaction(LIFE_OS_SYNC_STORE.deviceCache, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_SYNC_STORE.deviceCache);
    const existing = await observeRequest<SyncDeviceCacheRecord[]>(
      store.index('bySpaceId').getAll(spaceId),
    );
    for (const record of existing) store.delete(record.deviceId);
    for (const device of devices) store.put({ ...device } satisfies SyncDeviceCacheRecord);
    await observeTransaction(transaction);
  }
}

function toCachedDevice(record: SyncDeviceCacheRecord): CachedSyncDevice {
  return { ...record };
}

async function requestResult<T>(request: IDBRequest<T>, transaction: IDBTransaction): Promise<T> {
  const [result] = await Promise.all([observeRequest(request), observeTransaction(transaction)]);
  return result;
}

function observeRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

function observeTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve());
    transaction.addEventListener('abort', () => reject(transaction.error));
    transaction.addEventListener('error', () => reject(transaction.error));
  });
}
