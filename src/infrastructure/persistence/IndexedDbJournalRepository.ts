import type { JournalRepository } from '../../application';
import {
  JOURNAL_ENTRY_TYPE,
  type DayDate,
  type EntityId,
  type JournalEntry,
  type JournalEntryType,
} from '../../domain';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { JournalEntryRecordMapper } from './mappers/JournalEntryRecordMapper';
import { compareJournalEntries } from './InMemoryJournalRepository';

export class IndexedDbJournalRepository implements JournalRepository {
  readonly #indexedDb: LifeOsIndexedDb;

  public constructor(indexedDb: LifeOsIndexedDb = new LifeOsIndexedDb()) {
    this.#indexedDb = indexedDb;
  }

  public async append(entry: JournalEntry): Promise<void> {
    return this.appendMany([entry]);
  }

  public async appendMany(entries: readonly JournalEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const database = await this.#indexedDb.open();
    const transaction = database.transaction(LIFE_OS_STORE.journal, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_STORE.journal);
    const completion = observeTransaction(transaction);
    try {
      await Promise.all(
        entries.map((entry) => observeRequest(store.add(JournalEntryRecordMapper.toRecord(entry)))),
      );
      await completion;
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settleTransaction(completion);
      throw error;
    }
  }

  public async findByEffectiveDateRange(
    startDate: DayDate,
    endDate: DayDate,
  ): Promise<readonly JournalEntry[]> {
    const database = await this.#indexedDb.open();
    const records = await executeIndexedDbRequest<unknown[]>(
      database,
      LIFE_OS_STORE.journal,
      'readonly',
      (store) =>
        store
          .index('byEffectiveDate')
          .getAll(IDBKeyRange.bound(startDate.toString(), endDate.toString())),
    );
    return records.map(JournalEntryRecordMapper.fromRecord).sort(compareJournalEntries);
  }

  public async findById(id: EntityId): Promise<JournalEntry | null> {
    const database = await this.#indexedDb.open();
    const record = await executeIndexedDbRequest<unknown>(
      database,
      LIFE_OS_STORE.journal,
      'readonly',
      (store) => store.get(id.toString()),
    );
    return record === undefined ? null : JournalEntryRecordMapper.fromRecord(record);
  }

  public async findCorrectionsBySourceEntryId(
    sourceEntryId: EntityId,
  ): Promise<readonly JournalEntry[]> {
    const database = await this.#indexedDb.open();
    const records = await executeIndexedDbRequest<unknown[]>(
      database,
      LIFE_OS_STORE.journal,
      'readonly',
      (store) => store.getAll(),
    );
    return records
      .map(JournalEntryRecordMapper.fromRecord)
      .filter(
        (entry) =>
          entry.type === JOURNAL_ENTRY_TYPE.dataCorrected &&
          entry.correction?.sourceEntryId.equals(sourceEntryId) === true,
      )
      .sort(compareJournalEntries);
  }

  public async findLatestBySubjectAndType(
    subjectId: EntityId,
    type: JournalEntryType,
  ): Promise<JournalEntry | null> {
    const database = await this.#indexedDb.open();
    const records = await executeIndexedDbRequest<unknown[]>(
      database,
      LIFE_OS_STORE.journal,
      'readonly',
      (store) => store.index('bySubjectId').getAll(subjectId.toString()),
    );
    return (
      records
        .map(JournalEntryRecordMapper.fromRecord)
        .filter((entry) => entry.type === type)
        .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())[0] ?? null
    );
  }
}

function observeRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

function observeTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve());
    transaction.addEventListener('abort', () => reject(transaction.error));
    transaction.addEventListener('error', () => reject(transaction.error));
  });
}

function abortQuietly(transaction: IDBTransaction): void {
  try {
    transaction.abort();
  } catch {
    // Transaction already completed.
  }
}

async function settleTransaction(completion: Promise<void>): Promise<void> {
  try {
    await completion;
  } catch {
    // Expected after abort.
  }
}
