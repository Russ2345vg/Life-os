import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { LifeOsIndexedDb } from '../persistence/indexed-db/LifeOsIndexedDb';
import type { SyncSettingsRecord } from '../persistence/records/SyncStoreRecords';
import { confirmedWalkDataFormat, saveConfirmedWalkDataFormat } from './WalkDataFormat';

describe('WalkDataFormat', () => {
  it('binds a confirmed floor to the active space and device', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    try {
      const db = await indexedDb.open();
      const installation = {
        id: 'sync',
        deviceId: 'device-one',
        spaceId: 'space-one',
        membershipStatus: 'active',
      } as SyncSettingsRecord;
      const tx = db.transaction('sync_settings', 'readwrite');
      tx.objectStore('sync_settings').put(installation);
      await done(tx);
      await saveConfirmedWalkDataFormat(indexedDb, 'space-one', 'device-one', 2);
      const read = db.transaction('sync_settings', 'readonly');
      const readCompleted = done(read);
      expect(await confirmedWalkDataFormat(read, installation)).toBe(2);
      expect(await confirmedWalkDataFormat(read, { ...installation, deviceId: 'device-two' })).toBe(
        1,
      );
      expect(await confirmedWalkDataFormat(read, { ...installation, spaceId: 'space-two' })).toBe(
        1,
      );
      await readCompleted;
      await saveConfirmedWalkDataFormat(indexedDb, 'space-one', 'device-one', 1);
      const downgraded = db.transaction('sync_settings', 'readonly');
      const downgradedCompleted = done(downgraded);
      expect(await confirmedWalkDataFormat(downgraded, installation)).toBe(1);
      await downgradedCompleted;
    } finally {
      indexedDb.close();
    }
  });
});

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
