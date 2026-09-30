import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { LifeOsIndexedDb, LIFE_OS_SYNC_STORE } from '../../persistence/indexed-db/LifeOsIndexedDb';
import { AttachmentTransferService } from './AttachmentTransferService';
import { done } from './AttachmentRegistration';
import { request } from './AttachmentRegistration';
import { structuredSyncFixtures } from '../pilot/StructuredSyncFixtures';
import {
  IndexedDbPilotMutationRecorder,
  PILOT_MUTATION_STORES,
} from '../pilot/IndexedDbPilotMutationRecorder';
import { IndexedDbPilotSyncStore } from '../pilot/IndexedDbPilotSyncStore';
import { parsePilotSyncPayload } from '../../../application/sync/pilot';
import type { SyncOutboxRecord } from '../../persistence/records/SyncStoreRecords';
import type {
  DurableAttachment,
  SyncBinaryCrypto,
  EncryptedBlobTransport,
} from '../../../application/sync/attachments/AttachmentContracts';
import { binaryMetadata } from '../../../application/sync/attachments/AttachmentContracts';
import { protect } from '../../../application/sync/attachments/ProtectedPayload';

describe('durable attachment transfers', () => {
  it('quarantines authenticated memory bytes that violate the memory photo contract', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory());
    try {
      const connection = await db.open();
      const ref = {
        attachmentId: '11111111-1111-4111-8111-111111111111',
        blobVersion: 1,
        keyEpoch: 1,
      };
      const record: Readonly<Record<string, unknown>> = {
        ...structuredSyncFixtures().memory_event,
        syncAttachment: ref,
      };
      const now = new Date('2026-09-29T00:00:00Z');
      const entry: DurableAttachment = {
        ...ref,
        entityType: 'memory_event',
        parentObjectId: String(record.id),
        spaceId: 'space',
        localImage: null,
        localUri: '',
        state: 'pending-download',
        retryCount: 0,
        nextAttemptAt: now.toISOString(),
        leaseUntil: null,
        updatedAt: now.toISOString(),
        deletedAt: null,
        encryptedBlob: null,
        integrity: null,
        lastErrorCode: null,
      };
      const tx = connection.transaction(
        ['memoryEvents', LIFE_OS_SYNC_STORE.attachmentQueue],
        'readwrite',
      );
      tx.objectStore('memoryEvents').put(record);
      tx.objectStore(LIFE_OS_SYNC_STORE.attachmentQueue).put(entry);
      await done(tx);
      const crypto: SyncBinaryCrypto = {
        encryptBinary: async (metadata, plaintext) => ({
          metadata,
          ciphertext: btoa(plaintext),
          nonce: 'test',
        }),
        decryptBinary: async (envelope) => atob(envelope.ciphertext),
      };
      const encrypted = await protect(crypto, binaryMetadata('space', ref), {
        dataUrl: 'data:image/svg+xml;base64,aGVsbG8=',
        mimeType: 'image/svg+xml',
        sizeBytes: 5,
      });
      const transfer = new AttachmentTransferService(
        db,
        crypto,
        {
          upload: async () => undefined,
          download: async () => encrypted,
          listSnapshots: async () => [],
        },
        () => now,
      );
      await transfer.run('space');
      expect((await transfer.list())[0]?.state).toBe('quarantined');
      expect(
        (
          await request<Record<string, unknown>>(
            connection
              .transaction('memoryEvents')
              .objectStore('memoryEvents')
              .get(String(record.id)),
          )
        ).photo,
      ).toBeNull();
    } finally {
      db.close();
    }
  });
  it.each(['goal', 'walk', 'memory_event'] as const)(
    '%s transfers independently, survives restart and quarantines corrupted data',
    async (type) => {
      const spaceId = '11111111-1111-4111-8111-111111111111';
      const db = new LifeOsIndexedDb(new IDBFactory());
      const factory = new IDBFactory();
      const receiver = new LifeOsIndexedDb(factory);
      const source = await db.open();
      const target = await receiver.open();
      const storeName = type === 'goal' ? 'goals' : type === 'walk' ? 'walks' : 'memoryEvents';
      const tx = source.transaction([storeName, ...PILOT_MUTATION_STORES], 'readwrite');
      const completion = done(tx);
      tx.objectStore(LIFE_OS_SYNC_STORE.settings).put({
        id: 'sync',
        setupState: 'configured',
        membershipStatus: 'active',
        spaceId,
        deviceId: 'windows',
        currentKeyEpoch: 1,
      });
      const image = {
        dataUrl: `data:image/${type === 'goal' ? 'avif' : 'png'};base64,aGVsbG8=`,
        mimeType: type === 'goal' ? 'image/avif' : 'image/png',
        sizeBytes: 5,
      };
      const record = {
        ...structuredSyncFixtures()[type],
        directionId: null,
        [type === 'goal' ? 'coverImage' : 'photo']: image,
      };
      tx.objectStore(storeName).put(record);
      await new IndexedDbPilotMutationRecorder().recordUpsert(tx, type, record);
      await completion;
      const events = await request<SyncOutboxRecord[]>(
        source
          .transaction(LIFE_OS_SYNC_STORE.outbox)
          .objectStore(LIFE_OS_SYNC_STORE.outbox)
          .getAll(),
      );
      const event = events[0]!;
      await new IndexedDbPilotSyncStore(receiver).applyPulled(
        spaceId,
        1,
        parsePilotSyncPayload(event.serializedPayload),
        event.transportObjectId,
        { kind: 'fast_forward', winner: 'incoming' },
      );
      const parent = await request<Record<string, unknown>>(
        target
          .transaction(storeName)
          .objectStore(storeName)
          .get(String(structuredSyncFixtures()[type].id)),
      );
      expect(parent[type === 'goal' ? 'coverImage' : 'photo']).toBeNull();
      // Ordinary domain mappers drop technical syncAttachment fields on local edits.
      const edit = target.transaction([storeName, ...PILOT_MUTATION_STORES], 'readwrite');
      edit.objectStore(LIFE_OS_SYNC_STORE.settings).put({
        id: 'sync',
        setupState: 'configured',
        membershipStatus: 'active',
        spaceId,
        deviceId: 'android',
        currentKeyEpoch: 1,
      });
      const edited = { ...parent };
      delete edited.syncAttachment;
      edit.objectStore(storeName).put(edited);
      await new IndexedDbPilotMutationRecorder().recordUpsert(edit, type, edited);
      await done(edit);
      receiver.close();
      const restarted = new LifeOsIndexedDb(factory);
      let stored = '';
      let corrupt = true;
      const transport: EncryptedBlobTransport = {
        upload: async (_b, _p, bytes) => {
          stored ||= bytes;
        },
        download: async () => (corrupt ? stored.replace(/.$/, '!') : stored),
        listSnapshots: async () => [],
      };
      const crypto: SyncBinaryCrypto = {
        encryptBinary: async (metadata, plaintext) => ({
          metadata,
          ciphertext: btoa(plaintext),
          nonce: 'test',
        }),
        decryptBinary: async (e) => atob(e.ciphertext),
      };
      corrupt = false;
      await new AttachmentTransferService(db, crypto, transport).run(spaceId);
      const transfer = new AttachmentTransferService(restarted, crypto, transport);
      corrupt = true;
      await transfer.run(spaceId);
      expect((await transfer.list())[0]?.state).toBe('quarantined');
      const id = (await transfer.list())[0]!.attachmentId;
      corrupt = false;
      await transfer.retry(id);
      await transfer.run(spaceId);
      expect((await transfer.list())[0]?.state).toBe('available-local');
      const received = await restarted.open();
      expect(
        (
          await request<Record<string, unknown>>(
            received
              .transaction(storeName)
              .objectStore(storeName)
              .get(String(structuredSyncFixtures()[type].id)),
          )
        )[type === 'goal' ? 'coverImage' : 'photo'],
      ).toEqual(image);
      const outgoing = await request<SyncOutboxRecord[]>(
        received
          .transaction(LIFE_OS_SYNC_STORE.outbox)
          .objectStore(LIFE_OS_SYNC_STORE.outbox)
          .getAll(),
      );
      // The edit is a normal outgoing mutation; materializing bytes adds no extra event.
      expect(outgoing).toHaveLength(1);
      expect(parsePilotSyncPayload(outgoing[0]!.serializedPayload).record?.syncAttachment).toEqual(
        parsePilotSyncPayload(event.serializedPayload).record?.syncAttachment,
      );
    },
  );
  it('retains the local file on quota failure and resumes an expired lease after restart', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory());
    const connection = await db.open();
    const now = new Date('2026-09-07T00:00:00Z');
    const entry: DurableAttachment = {
      attachmentId: '22222222-2222-4222-8222-222222222222',
      blobVersion: 1,
      keyEpoch: 1,
      spaceId: '11111111-1111-4111-8111-111111111111',
      parentObjectId: 'goal',
      entityType: 'goal',
      localImage: {
        dataUrl: 'data:image/png;base64,aGVsbG8=',
        mimeType: 'image/png',
        sizeBytes: 5,
      },
      localUri: '',
      state: 'uploading',
      retryCount: 0,
      nextAttemptAt: now.toISOString(),
      leaseUntil: '2026-09-06T00:00:00Z',
      updatedAt: now.toISOString(),
      deletedAt: null,
      encryptedBlob: null,
      integrity: null,
      lastErrorCode: null,
    };
    const tx = connection.transaction(LIFE_OS_SYNC_STORE.attachmentQueue, 'readwrite');
    tx.objectStore(LIFE_OS_SYNC_STORE.attachmentQueue).put(entry);
    await done(tx);
    const retryGuard = new AttachmentTransferService(
      db,
      {} as SyncBinaryCrypto,
      {} as EncryptedBlobTransport,
    );
    await retryGuard.retry(entry.attachmentId);
    expect((await retryGuard.list())[0]?.state).toBe('uploading');
    expect((await retryGuard.list())[0]?.leaseUntil).toBe(entry.leaseUntil);
    let fail = true;
    let stored = '';
    const transport: EncryptedBlobTransport = {
      upload: async (_b, _p, bytes) => {
        if (fail) throw new Error('quota');
        stored = bytes;
      },
      download: async () => stored,
      listSnapshots: async () => [],
    };
    const crypto: SyncBinaryCrypto = {
      encryptBinary: async (metadata, plaintext) => ({
        metadata,
        ciphertext: btoa(plaintext),
        nonce: 'test',
      }),
      decryptBinary: async (e) => atob(e.ciphertext),
    };
    await new AttachmentTransferService(db, crypto, transport, () => now).run(entry.spaceId);
    const failed = (await new AttachmentTransferService(db, crypto, transport).list())[0]!;
    expect(failed.state).toBe('retry-upload');
    expect(failed.localImage).toEqual(entry.localImage);
    expect(Date.parse(failed.nextAttemptAt)).toBeGreaterThan(now.getTime());
    fail = false;
    now.setMinutes(now.getMinutes() + 5);
    const restarted = new AttachmentTransferService(db, crypto, transport, () => now);
    await restarted.run(entry.spaceId);
    expect((await restarted.list())[0]?.state).toBe('uploaded');
    expect(stored).not.toContain('aGVsbG8=');
  });
});
