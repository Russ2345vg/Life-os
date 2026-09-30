import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createDiaryDraft, diaryPeriod, DayDate, reviseDiaryEntry } from '../../domain';
import { IndexedDbDiaryRepository } from './IndexedDbDiaryRepository';
import { IndexedDbMemoryRepository } from './IndexedDbMemoryRepository';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { FakeClock, FakeCurrentDateProvider, FakeIdGenerator } from '../../test/helpers/Fakes';
import { MemoryApplicationService } from '../../application/memory/MemoryService';
import { MemoryDiaryImport } from '../../application/memory/MemoryDiaryImport';

describe('explicit saved diary answer import', () => {
  it('places a past monthly reflection in its original year and caps the current week at today', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory());
    try {
      const diary = new IndexedDbDiaryRepository(db);
      const clock = new FakeClock(new Date('2026-09-29T12:00:00Z'));
      const commands = new MemoryApplicationService(
        new IndexedDbMemoryRepository(db),
        clock,
        new FakeCurrentDateProvider(DayDate.create('2026-09-29')),
        new FakeIdGenerator('memory'),
        true,
      );
      const importer = new MemoryDiaryImport(diary, commands);
      const month = createDiaryDraft(
        diaryPeriod('month', DayDate.create('2024-02-01')),
        clock.now(),
      );
      await diary.save(
        reviseDiaryEntry(
          month,
          { ...month.payload, biggestAchievement: 'Важное достижение' },
          clock.now(),
        ),
        null,
      );
      expect(
        (
          await importer.prepare('month', month.periodStart, 'biggestAchievement', 1)
        ).occurredOn.toString(),
      ).toBe('2024-02-29');
      const week = createDiaryDraft(diaryPeriod('week', DayDate.create('2026-09-29')), clock.now());
      await diary.save(
        reviseDiaryEntry(week, { ...week.payload, learned: 'Новая мысль' }, clock.now()),
        null,
      );
      expect(
        (await importer.prepare('week', week.periodStart, 'learned', 1)).occurredOn.toString(),
      ).toBe('2026-09-29');
    } finally {
      db.close();
    }
  });
  it('prepares a snapshot without writing and keeps it independent of subsequent diary edits', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory());
    try {
      const diary = new IndexedDbDiaryRepository(db);
      const memory = new IndexedDbMemoryRepository(db);
      const clock = new FakeClock(new Date('2026-09-29T12:00:00Z'));
      const commands = new MemoryApplicationService(
        memory,
        clock,
        new FakeCurrentDateProvider(DayDate.create('2026-09-29')),
        new FakeIdGenerator('memory'),
        true,
      );
      const importer = new MemoryDiaryImport(diary, commands);
      const period = diaryPeriod('day', DayDate.create('2026-09-28'));
      const draft = createDiaryDraft(period, clock.now());
      const entry = await diary.save(
        reviseDiaryEntry(draft, { ...draft.payload, worldBetter: 'Помог другу' }, clock.now()),
        null,
      );
      const prepared = await importer.prepare(
        'day',
        period.periodStart,
        'worldBetter',
        entry.version,
      );
      expect(await memory.listYear(2026)).toEqual([]);
      expect(prepared).toMatchObject({
        body: 'Помог другу',
        diarySource: { version: 1, field: 'worldBetter' },
      });
      expect(prepared.occurredOn.toString()).toBe('2026-09-28');
      await diary.save(
        reviseDiaryEntry(entry, { ...entry.payload, worldBetter: 'Другой ответ' }, clock.now()),
        1,
      );
      await expect(
        importer.prepare('day', period.periodStart, 'worldBetter', 1),
      ).rejects.toMatchObject({ code: 'memory.source_conflict' });
      const saved = await commands.save(prepared, null);
      expect(saved.body).toBe('Помог другу');
    } finally {
      db.close();
    }
  });
  it('does not silently truncate a long note or allow an import during rollout', async () => {
    const db = new LifeOsIndexedDb(new IDBFactory());
    try {
      const diary = new IndexedDbDiaryRepository(db);
      const clock = new FakeClock(new Date('2026-09-29T12:00:00Z'));
      const repo = new IndexedDbMemoryRepository(db);
      const make = (enabled: boolean) =>
        new MemoryDiaryImport(
          diary,
          new MemoryApplicationService(
            repo,
            clock,
            new FakeCurrentDateProvider(DayDate.create('2026-09-29')),
            new FakeIdGenerator('memory'),
            enabled,
          ),
        );
      const draft = createDiaryDraft(diaryPeriod('day', DayDate.create('2026-09-29')), clock.now());
      await diary.save(
        reviseDiaryEntry(draft, { ...draft.payload, note: 'x'.repeat(10001) }, clock.now()),
        null,
      );
      await expect(make(true).prepare('day', draft.periodStart, 'note', 1)).rejects.toMatchObject({
        code: 'memory.source_too_long',
      });
      await expect(make(false).prepare('day', draft.periodStart, 'note', 1)).rejects.toMatchObject({
        code: 'memory.disabled',
      });
    } finally {
      db.close();
    }
  });
});
