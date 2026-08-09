import type { DayRepository } from '../../application';
import { DAY_STATUS, type Day, type DayDate } from '../../domain';
import { DayRecordMapper } from './mappers/DayRecordMapper';
import type { DayRecord } from './records/DayRecord';
import { DomainError } from '../../shared/errors/DomainError';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';

export class IndexedDbDayRepository implements DayRepository {
  readonly #indexedDb: LifeOsIndexedDb;

  public constructor(indexedDb: LifeOsIndexedDb = new LifeOsIndexedDb()) {
    this.#indexedDb = indexedDb;
  }

  public async findByDate(date: DayDate): Promise<Day | null> {
    const database = await this.#indexedDb.open();
    const storedRecord = await executeIndexedDbRequest<unknown>(
      database,
      LIFE_OS_STORE.days,
      'readonly',
      (store) => store.index('byDate').get(date.toString()),
    );

    if (storedRecord === undefined) {
      return null;
    }

    return DayRecordMapper.fromRecord(storedRecord as DayRecord);
  }

  public async findOpen(): Promise<Day | null> {
    const database = await this.#indexedDb.open();
    const storedRecords = await executeIndexedDbRequest<unknown[]>(
      database,
      LIFE_OS_STORE.days,
      'readonly',
      (store) => store.getAll(),
    );
    const openDays = storedRecords
      .map((record) => DayRecordMapper.fromRecord(record as DayRecord))
      .filter((day) => day.status === DAY_STATUS.open);

    if (openDays.length > 1) {
      throw new DomainError(
        'day.multiple_open_detected',
        'Обнаружено несколько одновременно открытых дней.',
      );
    }

    return openDays[0] ?? null;
  }

  public async save(day: Day): Promise<void> {
    const database = await this.#indexedDb.open();
    const record = DayRecordMapper.toRecord(day);

    await executeIndexedDbRequest<IDBValidKey>(database, LIFE_OS_STORE.days, 'readwrite', (store) =>
      store.put(record),
    );
  }

  public async saveIfVersionMatches(day: Day, expectedVersion: number): Promise<boolean> {
    const database = await this.#indexedDb.open();
    const transaction = database.transaction(LIFE_OS_STORE.days, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_STORE.days);
    const completion = observeTransaction(transaction);

    try {
      const stored = await observeRequest<DayRecord | undefined>(store.get(day.id.toString()));
      if (stored === undefined || stored.version !== expectedVersion) {
        transaction.abort();
        await settleTransaction(completion);
        return false;
      }
      await observeRequest(store.put(DayRecordMapper.toRecord(day)));
      await completion;
      return true;
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settleTransaction(completion);
      throw error;
    }
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
    // The transaction has already completed.
  }
}

async function settleTransaction(completion: Promise<void>): Promise<void> {
  try {
    await completion;
  } catch {
    // Expected when an optimistic write aborts.
  }
}
