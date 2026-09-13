import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { LifeOsIndexedDb, LIFE_OS_SYNC_STORE } from '../../persistence/indexed-db/LifeOsIndexedDb';
import {
  IndexedDbPilotMutationRecorder,
  PILOT_MUTATION_STORES,
} from '../pilot/IndexedDbPilotMutationRecorder';
import { structuredSyncFixtures } from '../pilot/StructuredSyncFixtures';

describe('SYNC-05 attachment registration', () => {
  it('registers a durable opaque reference and keeps binary out of the structured event', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory());
    const connection = await db.open();
    const setup = connection.transaction(LIFE_OS_SYNC_STORE.settings, 'readwrite');
    setup.objectStore(LIFE_OS_SYNC_STORE.settings).put({
      id: 'sync',
      setupState: 'configured',
      membershipStatus: 'active',
      spaceId: '11111111-1111-4111-8111-111111111111',
      deviceId: 'device',
      currentKeyEpoch: 1,
    });
    await done(setup);
    const recorder = new IndexedDbPilotMutationRecorder();
    const tx = connection.transaction(['goals', ...PILOT_MUTATION_STORES], 'readwrite');
    const record = {
      ...structuredSyncFixtures().goal,
      coverImage: {
        dataUrl: 'data:image/png;base64,aGVsbG8=',
        mimeType: 'image/png',
        sizeBytes: 5,
        fileName: 'secret.png',
      },
    };
    tx.objectStore('goals').put(record);
    await recorder.recordUpsert(tx, 'goal', record);
    await done(tx);
    const read = connection.transaction(
      [LIFE_OS_SYNC_STORE.outbox, LIFE_OS_SYNC_STORE.attachmentQueue],
      'readonly',
    );
    const events = await request(read.objectStore(LIFE_OS_SYNC_STORE.outbox).getAll());
    const files = await request(read.objectStore(LIFE_OS_SYNC_STORE.attachmentQueue).getAll());
    expect(files).toHaveLength(1);
    expect(files[0].attachmentId).toMatch(/^[0-9a-f-]{36}$/);
    expect(events[0].serializedPayload).not.toContain('aGVsbG8=');
    expect(events[0].serializedPayload).not.toContain('secret.png');
    expect(JSON.parse(events[0].serializedPayload).record.syncAttachment.attachmentId).toBe(
      files[0].attachmentId,
    );
    db.close();
  });
});
function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
}
