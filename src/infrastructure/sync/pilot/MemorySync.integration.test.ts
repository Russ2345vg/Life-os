import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { MemoryApplicationService } from '../../../application/memory/MemoryService';
import { parsePilotSyncPayload } from '../../../application/sync/pilot';
import type { DurableAttachment } from '../../../application/sync/attachments/AttachmentContracts';
import { IndexedDbMemoryRepository } from '../../persistence/IndexedDbMemoryRepository';
import { LifeOsIndexedDb, LIFE_OS_SYNC_STORE } from '../../persistence/indexed-db/LifeOsIndexedDb';
import type { SyncOutboxRecord } from '../../persistence/records/SyncStoreRecords';
import { FakeClock, FakeCurrentDateProvider, FakeIdGenerator } from '../../../test/helpers/Fakes';
import { DayDate } from '../../../domain';
import { LIFE_OS_SYNC_REGISTRY } from '../LifeOsSyncRegistry';
import { done, request } from '../attachments/AttachmentRegistration';
import { IndexedDbPilotMutationRecorder } from './IndexedDbPilotMutationRecorder';
import { IndexedDbPilotSyncStore } from './IndexedDbPilotSyncStore';

describe('memory sync and attachments', () => {
  it('sends delete and restore as full upserts and keeps a pending photo on the receiving device', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory());
    const receiver = new LifeOsIndexedDb(new IDBFactory());
    try {
      const connection = await db.open();
      const seed = connection.transaction(LIFE_OS_SYNC_STORE.settings, 'readwrite');
      seed.objectStore(LIFE_OS_SYNC_STORE.settings).put({
        id: 'sync',
        setupState: 'configured',
        membershipStatus: 'active',
        spaceId: 'space',
        deviceId: 'desktop',
        currentKeyEpoch: 1,
      });
      await done(seed);
      db.configureSyncMutationCapture(new IndexedDbPilotMutationRecorder(), LIFE_OS_SYNC_REGISTRY);
      const repo = new IndexedDbMemoryRepository(db);
      const service = new MemoryApplicationService(
        repo,
        new FakeClock(new Date('2026-09-29T12:00:00Z')),
        new FakeCurrentDateProvider(DayDate.create('2026-09-29')),
        new FakeIdGenerator('memory'),
        true,
      );
      const created = await service.save(
        {
          ...service.prepareCreate(),
          title: 'История',
          body: 'Сохранить текст',
          photo: { dataUrl: 'data:image/png;base64,aGVsbG8=', mimeType: 'image/png', sizeBytes: 5 },
        },
        null,
      );
      await service.remove(created.id, 1);
      await service.restore(created.id, 2);
      const rows = await request<SyncOutboxRecord[]>(
        connection
          .transaction(LIFE_OS_SYNC_STORE.outbox)
          .objectStore(LIFE_OS_SYNC_STORE.outbox)
          .getAll(),
      );
      const events = rows
        .map((row) => parsePilotSyncPayload(row.serializedPayload))
        .sort((a, b) => a.revision - b.revision);
      expect(events).toHaveLength(3);
      expect(events.every((event) => event.operation === 'upsert')).toBe(true);
      expect(rows.every((row) => !row.serializedPayload.includes('aGVsbG8='))).toBe(true);
      const files = await request<DurableAttachment[]>(
        connection
          .transaction(LIFE_OS_SYNC_STORE.attachmentQueue)
          .objectStore(LIFE_OS_SYNC_STORE.attachmentQueue)
          .getAll(),
      );
      expect(files).toHaveLength(1);
      expect(files[0]).toMatchObject({ entityType: 'memory_event', deletedAt: null });
      const remote = new IndexedDbPilotSyncStore(receiver);
      for (const event of events)
        await remote.applyPulled(
          'space',
          event.revision,
          {
            ...event,
            record: {
              ...event.record,
              context: {
                sphereId: 'missing-sphere',
                sphereTitle: 'Семья',
                directionId: null,
                directionTitle: null,
                goalId: null,
                goalTitle: null,
              },
            },
          },
          'transport',
          { kind: 'fast_forward', winner: 'incoming' },
        );
      const remoteRepo = new IndexedDbMemoryRepository(receiver);
      const received = (await remoteRepo.findById(created.id))!;
      expect(received).toMatchObject({ body: 'Сохранить текст', deletedAt: null, photo: null });
      expect((await remoteRepo.listYear(2026))[0]?.hasPhoto).toBe(true);
      const remoteService = new MemoryApplicationService(
        remoteRepo,
        new FakeClock(new Date('2026-09-29T13:00:00Z')),
        new FakeCurrentDateProvider(DayDate.create('2026-09-29')),
        new FakeIdGenerator(),
        true,
      );
      await remoteService.save(
        { ...received, body: 'Изменён во время загрузки' },
        received.version,
      );
      expect((await remoteRepo.listYear(2026))[0]?.hasPhoto).toBe(true);
      receiver.configureSyncMutationCapture(
        new IndexedDbPilotMutationRecorder(),
        LIFE_OS_SYNC_REGISTRY,
      );
      const remoteConnection = await receiver.open();
      const settings = remoteConnection.transaction(LIFE_OS_SYNC_STORE.settings, 'readwrite');
      settings.objectStore(LIFE_OS_SYNC_STORE.settings).put({
        id: 'sync',
        setupState: 'configured',
        membershipStatus: 'active',
        spaceId: 'space',
        deviceId: 'phone',
        currentKeyEpoch: 1,
      });
      await done(settings);
      const pending = (await remoteRepo.findById(created.id))!;
      await remoteService.save(pending, pending.version, { removePhoto: true });
      expect((await remoteRepo.listYear(2026))[0]?.hasPhoto).toBe(false);
      const remoteFiles = await request<DurableAttachment[]>(
        remoteConnection
          .transaction(LIFE_OS_SYNC_STORE.attachmentQueue)
          .objectStore(LIFE_OS_SYNC_STORE.attachmentQueue)
          .getAll(),
      );
      expect(remoteFiles[0]?.state).toBe('tombstoned');
    } finally {
      db.close();
      receiver.close();
    }
  });
});
