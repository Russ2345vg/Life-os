import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  DayDate,
  completeDiaryEntry,
  createDiaryDraft,
  diaryPeriod,
  reviseDiaryEntry,
  type DiaryDayEntry,
  type DiaryEntry,
} from '../../domain';
import { DiaryEntryRecordMapper } from './mappers/DiaryEntryRecordMapper';
import { IndexedDbDiaryRepository } from './IndexedDbDiaryRepository';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';

const time = (day: string, hour = 12) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00Z`);

function completedDay(day: string, overall = 4): DiaryDayEntry {
  const draft = createDiaryDraft(diaryPeriod('day', DayDate.create(day)), time(day));
  return completeDiaryEntry(
    reviseDiaryEntry(
      draft,
      {
        ...draft.payload,
        productivity: 4,
        energy: 3,
        mood: 5,
        overall: overall as 1 | 2 | 3 | 4 | 5,
        worldBetter: `Доброе дело ${day}`,
      },
      time(day, 13),
    ),
    time(day, 14),
  );
}

describe('IndexedDbDiaryRepository', () => {
  it('creates one period, reloads it and increments its version once per exact update', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    try {
      const repository = new IndexedDbDiaryRepository(database);
      const created = await repository.save(completedDay('2026-09-29'), null);

      expect(created.version).toBe(1);
      expect(await repository.findByPeriodKey('day:2026-09-29')).toEqual(created);

      const edited = reviseDiaryEntry(
        created,
        { ...created.payload, note: 'Дополнено позже' },
        time('2026-09-29', 15),
      );
      const saved = await repository.save(edited, 1);

      expect(saved.version).toBe(2);
      expect(saved.status).toBe('draft');
      expect(await repository.findByPeriodKey(saved.periodKey)).toEqual(saved);
    } finally {
      database.close();
    }
  });

  it('rejects duplicate creation and stale updates without overwriting current content', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    try {
      const repository = new IndexedDbDiaryRepository(database);
      const first = await repository.save(completedDay('2026-09-29'), null);
      await expect(repository.save(completedDay('2026-09-29', 2), null)).rejects.toMatchObject({
        code: 'persistence.version_conflict',
      });

      const current = await repository.save(
        reviseDiaryEntry(
          first,
          { ...first.payload, note: 'Актуальная версия' },
          time('2026-09-29', 15),
        ),
        1,
      );
      await expect(
        repository.save(
          reviseDiaryEntry(
            first,
            { ...first.payload, note: 'Устаревшая версия' },
            time('2026-09-29', 16),
          ),
          1,
        ),
      ).rejects.toMatchObject({ code: 'persistence.version_conflict' });

      expect(await repository.findByPeriodKey(first.periodKey)).toEqual(current);
    } finally {
      database.close();
    }
  });

  it('lists completed entries in calendar order and excludes drafts and dates outside the range', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    try {
      const repository = new IndexedDbDiaryRepository(database);
      await repository.save(completedDay('2026-09-30'), null);
      await repository.save(completedDay('2026-09-28'), null);
      await repository.save(completedDay('2026-10-01'), null);
      await repository.save(
        createDiaryDraft(diaryPeriod('day', DayDate.create('2026-09-29')), time('2026-09-29')),
        null,
      );

      const entries = await repository.listCompleted(
        'day',
        DayDate.create('2026-09-28'),
        DayDate.create('2026-09-30'),
      );

      expect(entries.map((entry) => entry.periodStart.toString())).toEqual([
        '2026-09-28',
        '2026-09-30',
      ]);
    } finally {
      database.close();
    }
  });

  it('round-trips a strict record and rejects malformed persisted content', () => {
    const persisted = { ...completedDay('2026-09-29'), version: 3 };
    const record = DiaryEntryRecordMapper.toRecord(persisted);

    expect(record).toMatchObject({
      id: 'diary:day:2026-09-29',
      periodStart: '2026-09-29',
      periodEnd: '2026-09-29',
      version: 3,
    });
    expect(DiaryEntryRecordMapper.fromRecord(record)).toEqual(persisted);
    for (const broken of [
      { ...record, periodKey: 'day:2026-09-28' },
      { ...record, periodStart: 'bad' },
      { ...record, version: 0 },
      { ...record, payload: { ...record.payload, mood: 6 } },
    ])
      expect(() => DiaryEntryRecordMapper.fromRecord(broken)).toThrow();
  });

  it('aborts an invalid save without replacing the stored entry', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    try {
      const repository = new IndexedDbDiaryRepository(database);
      const current = await repository.save(completedDay('2026-09-29'), null);
      const invalid = {
        ...current,
        payload: { ...current.payload, productivity: 9 },
      } as unknown as DiaryEntry;

      await expect(repository.save(invalid, 1)).rejects.toThrow();
      expect(await repository.findByPeriodKey(current.periodKey)).toEqual(current);

      const opened = await database.open();
      const store = opened
        .transaction(LIFE_OS_STORE.diaryEntries)
        .objectStore(LIFE_OS_STORE.diaryEntries);
      expect(store.index('byPeriodKey').unique).toBe(true);
    } finally {
      database.close();
    }
  });
});
