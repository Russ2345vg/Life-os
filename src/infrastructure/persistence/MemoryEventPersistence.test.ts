import { IDBFactory, IDBObjectStore as FakeObjectStore } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { DayDate, EntityId } from '../../domain';
import { createMemoryEvent, type MemoryEvent } from '../../domain/memory/MemoryEvent';
import { IndexedDbMemoryRepository } from './IndexedDbMemoryRepository';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { done, request } from '../sync/attachments/AttachmentRegistration';
import { MemoryEventRecordMapper } from './mappers/MemoryEventRecordMapper';

function event(id = 'one', date = '2026-09-29', title = 'Первое событие'): MemoryEvent {
  return createMemoryEvent(
    {
      id: EntityId.create(id),
      occurredOn: DayDate.create(date),
      title,
      body: 'Запомнить день',
      kind: 'moment',
      isHighlight: false,
      context: null,
      diarySource: null,
      photo: { dataUrl: 'data:image/png;base64,YQ==', mimeType: 'image/png', sizeBytes: 1 },
    },
    new Date('2026-09-29T12:00:00.000Z'),
  );
}

describe('IndexedDbMemoryRepository', () => {
  it('exposes a pending photo on a direct summary lookup without leaking attachment bytes', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    try {
      const repository = new IndexedDbMemoryRepository(database);
      const created = await repository.save({ ...event(), photo: null }, null);
      const connection = await database.open();
      const tx = connection.transaction('memoryEvents', 'readwrite');
      tx.objectStore('memoryEvents').put({
        ...MemoryEventRecordMapper.toRecord(created),
        syncAttachment: { fileId: 'pending-photo' },
      });
      await done(tx);
      const summary = await repository.findSummaryById(created.id);
      expect(summary?.hasPhoto).toBe(true);
      expect(summary).not.toHaveProperty('photo');
      expect(summary).not.toHaveProperty('syncAttachment');
    } finally {
      database.close();
    }
  });
  it('aborts a quota failure without changing content or consuming its version', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbMemoryRepository(database);
    const created = await repository.save(event(), null);
    const put = vi.spyOn(FakeObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw new DOMException('Quota full', 'QuotaExceededError');
    });
    try {
      await expect(repository.save({ ...created, title: 'Новый текст' }, 1)).rejects.toMatchObject({
        name: 'QuotaExceededError',
      });
      expect(await repository.findById(created.id)).toMatchObject({
        title: 'Первое событие',
        version: 1,
      });
      put.mockRestore();
      expect(
        (await repository.save({ ...created, title: 'Повтор после освобождения места' }, 1))
          .version,
      ).toBe(2);
    } finally {
      put.mockRestore();
      database.close();
    }
  });
  it('retains a photo materialized after opening a pending editor and supports an explicit removal', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    try {
      const repository = new IndexedDbMemoryRepository(database);
      const pending = await repository.save({ ...event(), photo: null }, null);
      const connection = await database.open();
      const transfer = connection.transaction('memoryEvents', 'readwrite');
      await request(
        transfer
          .objectStore('memoryEvents')
          .put(MemoryEventRecordMapper.toRecord({ ...pending, photo: event().photo })),
      );
      await done(transfer);
      const textDraft = { ...pending, title: 'Новый текст' };
      const edited = await repository.save(textDraft, 1);
      expect(edited.photo).toEqual(event().photo);
      expect((await repository.save(textDraft, 1)).photo).toEqual(event().photo);
      const removed = await repository.save({ ...edited, photo: null }, 2, { removePhoto: true });
      expect(removed.photo).toBeNull();
    } finally {
      database.close();
    }
  });
  it('persists, reopens and makes lost-response retries idempotent', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    try {
      const repository = new IndexedDbMemoryRepository(database);
      const created = await repository.save(event(), null);
      expect(created.version).toBe(1);
      expect((await repository.save(event(), null)).version).toBe(1);
      database.close();
      expect((await repository.findById(EntityId.create('one')))?.title).toBe('Первое событие');
      await expect(
        repository.save(event('one', '2026-09-29', 'Другой текст'), null),
      ).rejects.toMatchObject({ code: 'persistence.version_conflict' });
    } finally {
      database.close();
    }
  });

  it('rejects stale edits without overwriting content and retains photo when soft-deleted', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    try {
      const repository = new IndexedDbMemoryRepository(database);
      const created = await repository.save(event(), null);
      const edited = await repository.save({ ...created, title: 'Актуальный текст' }, 1);
      await expect(repository.save({ ...created, title: 'Устаревший' }, 1)).rejects.toMatchObject({
        code: 'persistence.version_conflict',
      });
      const deleted = await repository.save(
        { ...edited, deletedAt: '2026-09-29T12:00:00.000Z' },
        2,
      );
      expect(deleted.photo?.sizeBytes).toBe(1);
      expect((await repository.list({ year: 2026, deleted: false })).items).toHaveLength(0);
      expect(
        (await repository.list({ year: 2026, deleted: true })).items.map((x) => x.id.toString()),
      ).toEqual(['one']);
      const restored = await repository.save({ ...deleted, deletedAt: null }, 3);
      expect(restored.photo?.dataUrl).toBe('data:image/png;base64,YQ==');
    } finally {
      database.close();
    }
  });

  it('pages in stable event-date order and excludes photo bytes from list and year projections', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    try {
      const repository = new IndexedDbMemoryRepository(database);
      for (let i = 0; i < 32; i++)
        await repository.save(event(`id-${String(i).padStart(2, '0')}`), null);
      await repository.save(event('old', '2025-12-31'), null);
      const first = await repository.list({ year: 2026, deleted: false });
      expect(first.items).toHaveLength(30);
      expect(first.items[0]?.id.toString()).toBe('id-31');
      expect(first.items[0]).not.toHaveProperty('photo');
      expect(first.items[0]?.hasPhoto).toBe(true);
      const second = await repository.list({
        year: 2026,
        deleted: false,
        cursor: first.nextCursor!,
      });
      expect(second.items.map((x) => x.id.toString())).toEqual(['id-01', 'id-00']);
      expect(second.nextCursor).toBeNull();
      await expect(
        repository.list({ year: 2025, deleted: false, cursor: first.nextCursor! }),
      ).rejects.toMatchObject({ code: 'memory.invalid_cursor' });
      expect(await repository.listYear(2026)).toHaveLength(32);
      expect((await repository.listYear(2026))[0]).not.toHaveProperty('photo');
    } finally {
      database.close();
    }
  });

  it('combines search, category, sphere and highlight filters', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    try {
      const repository = new IndexedDbMemoryRepository(database);
      await repository.save(
        {
          ...event('book', '2026-09-29', 'Книга'),
          kind: 'achievement',
          isHighlight: true,
          context: {
            sphereId: 'money',
            sphereTitle: 'Деньги',
            directionId: null,
            directionTitle: null,
            goalId: null,
            goalTitle: null,
          },
        },
        null,
      );
      await repository.save(event('other'), null);
      const result = await repository.list({
        year: 2026,
        deleted: false,
        kind: 'achievement',
        sphereId: 'money',
        highlightOnly: true,
        search: 'КНИГА',
      });
      expect(result.items.map((x) => x.title)).toEqual(['Книга']);
    } finally {
      database.close();
    }
  });
});
