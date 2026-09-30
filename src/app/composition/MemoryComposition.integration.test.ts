import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createDiaryDraft, diaryPeriod, DayDate } from '../../domain';
import type { MemoryEvent } from '../../domain/memory';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { FakeClock, FakeCurrentDateProvider, FakeIdGenerator } from '../../test/helpers/Fakes';
import { createLifeOsApplication } from './createLifeOsApplication';

describe('memory compatibility composition', () => {
  it('keeps a diary import and its injected date after reopening the shared database', async () => {
    const factory = new IDBFactory();
    const anchor = DayDate.create('2026-09-30');
    const clock = new FakeClock(new Date('2026-09-29T20:00:00Z'));
    const options = {
      clock,
      currentDateProvider: new FakeCurrentDateProvider(anchor),
      idGenerator: new FakeIdGenerator('diary-memory-composition'),
    };
    const first = await createLifeOsApplication({
      ...options,
      database: new LifeOsIndexedDb(factory),
      memoryEnabled: true,
    });
    let saved: MemoryEvent;
    try {
      expect(first.memory.commands.prepareCreate().occurredOn.toString()).toBe(anchor.toString());
      const draft = createDiaryDraft(diaryPeriod('day', anchor), clock.now());
      const diary = await first.diary.saveDraft({
        kind: 'day',
        anchor,
        payload: { ...draft.payload, worldBetter: 'Помог другу разобраться с важным решением' },
        expectedVersion: null,
      });
      const imported = await first.memory.diaryImport.prepare(
        'day',
        anchor,
        'worldBetter',
        diary.version,
      );
      saved = await first.memory.commands.save(imported, null);
      expect(saved.diarySource).toEqual({
        entryId: diary.id.toString(),
        kind: 'day',
        periodStart: anchor.toString(),
        field: 'worldBetter',
        version: diary.version,
      });
      expect(saved.createdAt).toBe(clock.now().toISOString());
    } finally {
      first.close();
    }
    const next = await createLifeOsApplication({
      ...options,
      database: new LifeOsIndexedDb(factory),
      memoryEnabled: false,
    });
    try {
      const restored = await next.memory.queries.get(saved.id);
      expect(restored?.id.toString()).toBe(saved.id.toString());
      expect(restored?.body).toBe('Помог другу разобраться с важным решением');
      expect(restored?.occurredOn.toString()).toBe(anchor.toString());
      expect(restored?.diarySource).toEqual(saved.diarySource);
      if (!saved.diarySource) throw new Error('Expected a saved diary source');
      expect(await next.memory.diaryImport.sourceStatus(saved.diarySource)).toBe('available');
    } finally {
      next.close();
    }
  });

  it('keeps stored memory readable on restart with writes disabled by default', async () => {
    const factory = new IDBFactory();
    const options = {
      clock: new FakeClock(new Date('2026-09-29T12:00:00Z')),
      currentDateProvider: new FakeCurrentDateProvider(DayDate.create('2026-09-29')),
      idGenerator: new FakeIdGenerator('memory-composition'),
    };
    const first = await createLifeOsApplication({
      ...options,
      database: new LifeOsIndexedDb(factory),
      memoryEnabled: true,
    });
    const draft = first.memory.commands.prepareCreate();
    const saved = await first.memory.commands.save(
      { ...draft, title: 'День, который хочу сохранить' },
      null,
    );
    first.close();
    const next = await createLifeOsApplication({
      ...options,
      database: new LifeOsIndexedDb(factory),
    });
    try {
      expect(next.memory.commands.enabled).toBe(false);
      expect((await next.memory.queries.get(saved.id))?.title).toBe(saved.title);
      expect((await next.memory.queries.getYear(2026)).uniqueEventCount).toBe(1);
      await expect(
        next.memory.commands.save({ ...saved, title: 'Новое' }, saved.version),
      ).rejects.toMatchObject({ code: 'memory.disabled' });
    } finally {
      next.close();
    }
  });
});
