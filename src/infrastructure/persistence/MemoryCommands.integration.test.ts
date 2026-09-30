import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DayDate } from '../../domain';
import { IndexedDbMemoryRepository } from './IndexedDbMemoryRepository';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { FakeClock, FakeCurrentDateProvider, FakeIdGenerator } from '../../test/helpers/Fakes';
import { MemoryApplicationService } from '../../application/memory/MemoryService';

function setup(enabled = true) {
  const database = new LifeOsIndexedDb(new IDBFactory());
  const repository = new IndexedDbMemoryRepository(database);
  const clock = new FakeClock(new Date('2026-09-29T12:00:00.000Z'));
  const currentDate = new FakeCurrentDateProvider(DayDate.create('2026-09-29'));
  const service = new MemoryApplicationService(
    repository,
    clock,
    currentDate,
    new FakeIdGenerator('memory'),
    enabled,
  );
  return { database, repository, service, clock, currentDate };
}

describe('MemoryApplicationService', () => {
  it('does not persist an empty editor and retains one id through repeated create attempts', async () => {
    const { database, repository, service } = setup();
    try {
      const draft = service.prepareCreate();
      expect(await repository.findById(draft.id)).toBeNull();
      const saved = await service.save({ ...draft, title: 'Важное событие' }, null);
      const retried = await service.save({ ...draft, title: 'Важное событие' }, null);
      expect(retried.id.toString()).toBe('memory-1');
      expect(retried.version).toBe(1);
      expect(saved.title).toBe('Важное событие');
      expect((await repository.list({ year: 2026, deleted: false })).items).toHaveLength(1);
    } finally {
      database.close();
    }
  });

  it('rejects future creation and date changes but accepts unchanged dates from another time zone', async () => {
    const { database, repository, service, currentDate } = setup();
    try {
      const draft = {
        ...service.prepareCreate(),
        title: 'Событие',
        occurredOn: DayDate.create('2026-09-30'),
      };
      await expect(service.save(draft, null)).rejects.toMatchObject({ code: 'memory.future_date' });
      currentDate.setCurrentDate(DayDate.create('2026-09-30'));
      const saved = await service.save(draft, null);
      currentDate.setCurrentDate(DayDate.create('2026-09-29'));
      const edited = await service.save({ ...saved, body: 'Текст на принимающем устройстве' }, 1);
      expect(edited.occurredOn.toString()).toBe('2026-09-30');
      await expect(
        service.save({ ...edited, occurredOn: DayDate.create('2026-10-01') }, 2),
      ).rejects.toMatchObject({ code: 'memory.future_date' });
      const removed = await service.remove(saved.id, 2);
      const restored = await service.restore(saved.id, removed.version);
      expect(restored.deletedAt).toBeNull();
      expect((await repository.findById(saved.id))?.body).toBe('Текст на принимающем устройстве');
    } finally {
      database.close();
    }
  });

  it('keeps deleted content and refuses edits until explicit restoration', async () => {
    const { database, repository, service } = setup();
    try {
      const saved = await service.save(
        { ...service.prepareCreate(), title: 'Сохранить', body: 'История' },
        null,
      );
      const removed = await service.remove(saved.id, 1);
      expect(removed.deletedAt).toBe('2026-09-29T12:00:00.000Z');
      await expect(service.save({ ...removed, title: 'Ошибка' }, 2)).rejects.toMatchObject({
        code: 'memory.deleted',
      });
      expect((await repository.findById(saved.id))?.body).toBe('История');
      expect((await service.restore(saved.id, 2)).title).toBe('Сохранить');
    } finally {
      database.close();
    }
  });

  it('blocks every write command during compatibility rollout while stored events remain readable', async () => {
    const { database, repository, service } = setup(false);
    try {
      const draft = service.prepareCreate();
      await expect(service.save({ ...draft, title: 'Нет' }, null)).rejects.toMatchObject({
        code: 'memory.disabled',
      });
      await expect(service.remove(draft.id, 1)).rejects.toMatchObject({ code: 'memory.disabled' });
      await expect(service.restore(draft.id, 1)).rejects.toMatchObject({ code: 'memory.disabled' });
      expect(await repository.listYear(2026)).toEqual([]);
    } finally {
      database.close();
    }
  });
});
