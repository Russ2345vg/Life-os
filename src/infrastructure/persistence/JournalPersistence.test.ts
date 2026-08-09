import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  DAY_STATUS,
  Day,
  DayDate,
  EntityId,
  JOURNAL_ENTRY_TYPE,
  JOURNAL_SUBJECT_TYPE,
  JournalEntry,
} from '../../domain';
import { createDayJournalEntries } from '../../application/journal/createJournalEntries';
import { InMemoryJournalRepository } from './InMemoryJournalRepository';
import { IndexedDbDayRepository } from './IndexedDbDayRepository';
import { IndexedDbJournalRepository } from './IndexedDbJournalRepository';
import { IndexedDbJournalUnitOfWork } from './IndexedDbJournalUnitOfWork';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';

const DATE = DayDate.create('2026-08-09');
const MORNING = new Date('2026-08-09T09:05:00.000+09:00');

describe('Journal persistence', () => {
  it('stores immutable entries in chronological order in memory', async () => {
    const repository = new InMemoryJournalRepository();
    await repository.appendMany([
      journal('later', new Date('2026-08-09T11:00:00.000+09:00')),
      journal('earlier', MORNING),
    ]);

    const entries = await repository.findByEffectiveDateRange(DATE, DATE);
    expect(entries.map((entry) => entry.id.toString())).toEqual(['earlier', 'later']);
    await expect(repository.append(entries[0]!)).rejects.toMatchObject({
      code: 'journal.duplicate_entry',
    });
  });

  it('keeps journal entries and ordering after IndexedDB reopen', async () => {
    const factory = new IDBFactory();
    const firstDatabase = new LifeOsIndexedDb(factory);
    const firstRepository = new IndexedDbJournalRepository(firstDatabase);
    await firstRepository.appendMany([
      journal('later', new Date('2026-08-09T11:00:00.000+09:00')),
      journal('earlier', MORNING),
    ]);
    firstDatabase.close();

    const reopenedDatabase = new LifeOsIndexedDb(factory);
    const reopenedRepository = new IndexedDbJournalRepository(reopenedDatabase);
    const restored = await reopenedRepository.findByEffectiveDateRange(DATE, DATE);
    expect(restored.map((entry) => entry.id.toString())).toEqual(['earlier', 'later']);
    reopenedDatabase.close();
  });

  it('rolls back state when the matching journal append fails', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const dayRepository = new IndexedDbDayRepository(database);
    const journalRepository = new IndexedDbJournalRepository(database);
    const unitOfWork = new IndexedDbJournalUnitOfWork(database);
    const day = Day.createCurrentPlanned({
      id: EntityId.create('day-atomic'),
      currentDate: DATE,
      occurredAt: MORNING,
      createdEventId: EntityId.create('day-created'),
    });
    await dayRepository.save(day);
    day.clearUncommittedEvents();
    day.open(DATE, MORNING, EntityId.create('day-opened'));
    const [entry] = createDayJournalEntries(day);
    await journalRepository.append(entry!);

    await expect(
      unitOfWork.commit({
        days: [{ day, expectedVersion: 1 }],
        journalEntries: [entry!],
      }),
    ).rejects.toMatchObject({ code: 'persistence.transaction_failed' });

    const restored = await dayRepository.findByDate(DATE);
    expect(restored?.status).toBe(DAY_STATUS.planned);
    expect(await journalRepository.findByEffectiveDateRange(DATE, DATE)).toHaveLength(1);
    database.close();
  });
});

function journal(id: string, occurredAt: Date): JournalEntry {
  return JournalEntry.create({
    id: EntityId.create(id),
    type: JOURNAL_ENTRY_TYPE.dayStarted,
    occurredAt,
    effectiveDate: DATE,
    subjectType: JOURNAL_SUBJECT_TYPE.day,
    subjectId: EntityId.create('day-1'),
    createdAt: occurredAt,
  });
}
