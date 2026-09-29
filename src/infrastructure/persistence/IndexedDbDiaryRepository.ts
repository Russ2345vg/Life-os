import type { DiaryRepository } from '../../application';
import {
  validateDiaryEntry,
  type DayDate,
  type DiaryEntry,
  type DiaryPeriodKind,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { done, request } from '../sync/attachments/AttachmentRegistration';
import { LIFE_OS_STORE, type LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { DiaryEntryRecordMapper } from './mappers/DiaryEntryRecordMapper';

export class IndexedDbDiaryRepository implements DiaryRepository {
  public constructor(readonly database: LifeOsIndexedDb) {}

  public async findByPeriodKey(periodKey: string): Promise<DiaryEntry | null> {
    const db = await this.database.open();
    const record = await request<unknown>(
      db
        .transaction(LIFE_OS_STORE.diaryEntries)
        .objectStore(LIFE_OS_STORE.diaryEntries)
        .index('byPeriodKey')
        .get(periodKey),
    );
    return record === undefined ? null : DiaryEntryRecordMapper.fromRecord(record);
  }

  public async listCompleted(
    kind: DiaryPeriodKind,
    start: DayDate,
    end: DayDate,
  ): Promise<readonly DiaryEntry[]> {
    if (end.isBefore(start)) return [];
    const db = await this.database.open();
    const range = IDBKeyRange.bound([kind, start.toString()], [kind, end.toString()]);
    const records = await request<unknown[]>(
      db
        .transaction(LIFE_OS_STORE.diaryEntries)
        .objectStore(LIFE_OS_STORE.diaryEntries)
        .index('byKindAndPeriodStart')
        .getAll(range),
    );
    return records
      .map((record) => DiaryEntryRecordMapper.fromRecord(record))
      .filter((entry) => entry.status === 'completed')
      .sort(
        (left, right) =>
          left.periodStart.toString().localeCompare(right.periodStart.toString()) ||
          left.id.toString().localeCompare(right.id.toString()),
      );
  }

  public async save(entry: DiaryEntry, expectedVersion: number | null): Promise<DiaryEntry> {
    validateDiaryEntry(entry);
    if (
      (expectedVersion !== null && (!Number.isInteger(expectedVersion) || expectedVersion < 1)) ||
      entry.version !== (expectedVersion ?? 0)
    )
      throw versionConflict();
    const db = await this.database.open();
    const transaction = db.transaction(LIFE_OS_STORE.diaryEntries, 'readwrite');
    const completion = done(transaction);
    void completion.catch(() => undefined);
    try {
      const store = transaction.objectStore(LIFE_OS_STORE.diaryEntries);
      const raw = await request<unknown>(store.index('byPeriodKey').get(entry.periodKey));
      const current = raw === undefined ? null : DiaryEntryRecordMapper.fromRecord(raw);
      if ((current?.version ?? null) !== expectedVersion) throw versionConflict();
      const next = validateDiaryEntry(
        { ...entry, version: (expectedVersion ?? 0) + 1 },
        { persisted: true },
      );
      await request(store.put(DiaryEntryRecordMapper.toRecord(next)));
      await completion;
      return next;
    } catch (error: unknown) {
      try {
        transaction.abort();
      } catch {
        /* Transaction already settled. */
      }
      await completion.catch(() => undefined);
      throw error;
    }
  }
}

function versionConflict(): DomainError {
  return new DomainError(
    'persistence.version_conflict',
    'Запись дневника изменилась в другой вкладке. Обновите данные.',
  );
}
