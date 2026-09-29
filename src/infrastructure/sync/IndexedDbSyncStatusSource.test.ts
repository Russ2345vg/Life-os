import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { LifeOsIndexedDb } from '../persistence/indexed-db/LifeOsIndexedDb';
import { IndexedDbSyncStatusSource } from './IndexedDbSyncStatusSource';

describe('Sync status projection', () => {
  it('does not reread attachment or snapshot payloads on an unrelated commit', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const source = new IndexedDbSyncStatusSource(database);
    const stop = source.subscribe(() => {});
    await source.read();
    const cursor = vi.spyOn(IDBObjectStore.prototype, 'openCursor');
    const db = await database.open();
    const tx = db.transaction('goals', 'readwrite');
    tx.objectStore('goals').put({ id: 'synthetic' });
    await new Promise<void>((resolve) => tx.addEventListener('complete', () => resolve()));
    await source.read();
    expect(cursor).not.toHaveBeenCalled();
    const queue = db.transaction('sync_outbox', 'readwrite');
    queue.objectStore('sync_outbox').put({ eventId: 'event', state: 'pending' });
    await new Promise<void>((resolve) => queue.addEventListener('complete', () => resolve()));
    expect((await source.read()).pending).toBe(1);
    expect(cursor).toHaveBeenCalledOnce();
    cursor.mockRestore();
    stop();
    database.close();
  });
  it('publishes only committed changes, including suppressed remote writes, and unsubscribes', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const source = new IndexedDbSyncStatusSource(database);
    const observed = vi.fn();
    const stopThrowing = source.subscribe(() => {
      throw new Error('observer failure');
    });
    const unsubscribe = source.subscribe(observed);
    const db = await database.open();
    const aborted = db.transaction('sync_settings', 'readwrite');
    aborted.objectStore('sync_settings').put({ id: 'test' });
    aborted.abort();
    await new Promise<void>((resolve) => aborted.addEventListener('abort', () => resolve()));
    expect(observed).not.toHaveBeenCalled();
    const tx = await database.withMutationCaptureSuppressed(async () =>
      db.transaction(['goals', 'walks'], 'readwrite'),
    );
    tx.objectStore('goals').put({ id: 'synthetic' });
    await new Promise<void>((resolve) => tx.addEventListener('complete', () => resolve()));
    expect(observed).toHaveBeenCalledWith(['goals']);
    unsubscribe();
    stopThrowing();
    const next = db.transaction('sync_settings', 'readwrite');
    next.objectStore('sync_settings').put({ id: 'test' });
    await new Promise<void>((resolve) => next.addEventListener('complete', () => resolve()));
    expect(observed).toHaveBeenCalledOnce();
    database.close();
  });

  it('filters foreign/deleted media and strips payloads from the UI projection', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const source = new IndexedDbSyncStatusSource(database);
    expect(await source.read()).toMatchObject({
      configured: false,
      accountState: 'local_anonymous',
      accountEmail: null,
    });
    const db = await database.open();
    const tx = db.transaction(
      [
        'sync_settings',
        'sync_attachment_queue',
        'sync_snapshot_meta',
        'sync_outbox',
        'sync_quarantine',
      ],
      'readwrite',
    );
    tx.objectStore('sync_settings').put({
      id: 'sync',
      spaceId: 'own',
      membershipStatus: 'active',
      setupState: 'configured',
      accountSetupState: 'ready',
      accountUserId: '30000000-0000-4000-8000-000000000001',
      accountSessionId: '40000000-0000-4000-8000-000000000001',
      accountEmail: 'person@example.com',
      accountMigrationSnapshotId: null,
    });
    for (const [id, spaceId, deletedAt] of [
      ['own-file', 'own', null],
      ['foreign', 'other', null],
      ['deleted', 'own', '2026-09-08'],
    ]) {
      tx.objectStore('sync_attachment_queue').put({
        attachmentId: id,
        parentObjectId: 'parent',
        entityType: 'goal',
        spaceId,
        deletedAt,
        state: 'retry-upload',
        localImage: { dataUrl: 'PRIVATE' },
        encryptedBlob: 'SECRET',
      });
    }
    tx.objectStore('sync_outbox').put({
      eventId: 'pending',
      state: 'pending',
      serializedPayload: 'PRIVATE',
    });
    tx.objectStore('sync_quarantine').put({
      quarantineId: 'deferred',
      state: 'deferred',
      spaceId: 'own',
    });
    tx.objectStore('sync_snapshot_meta').put({
      snapshotId: 'backup',
      spaceId: 'own',
      kind: 'manual',
      cloudVerifiedAt: null,
      retryCount: 1,
      encryptedBlob: 'SECRET',
    });
    await new Promise<void>((resolve) => tx.addEventListener('complete', () => resolve()));
    const result = await source.read();
    expect(result).toMatchObject({
      configured: true,
      accountState: 'ready',
      accountEmail: 'person@example.com',
      pending: 1,
      deferred: 1,
      pendingBackups: 1,
      failedBackups: 1,
    });
    expect(result.attachments).toEqual([
      {
        attachmentId: 'own-file',
        parentObjectId: 'parent',
        entityType: 'goal',
        state: 'retry-upload',
        localAvailable: true,
      },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|SECRET|encryptedBlob|localImage/);
    database.close();
  });

  it('surfaces an unknown synchronized entity as a client update requirement', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const source = new IndexedDbSyncStatusSource(database);
    const db = await database.open();
    const tx = db.transaction(['sync_settings', 'sync_quarantine'], 'readwrite');
    tx.objectStore('sync_settings').put({
      id: 'sync',
      spaceId: 'own',
      membershipStatus: 'active',
      setupState: 'configured',
      accountSetupState: 'ready',
      accountUserId: '30000000-0000-4000-8000-000000000001',
      accountSessionId: '40000000-0000-4000-8000-000000000001',
      accountEmail: 'person@example.com',
      accountMigrationSnapshotId: null,
    });
    tx.objectStore('sync_quarantine').put({
      quarantineId: 'future-entry',
      entityType: 'future_entry',
      objectId: 'future-object',
      reason: 'sync.client_update_required',
      encryptedPayload: 'SECRET',
      sequence: 5,
      state: 'attention',
      createdAt: '2026-09-29T00:00:00.000Z',
      spaceId: 'own',
    });
    await new Promise<void>((resolve) => tx.addEventListener('complete', () => resolve()));

    expect((await source.read()).setupIssue).toBe('client-update-required');
    database.close();
  });
});
