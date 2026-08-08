import type { DecisionRepository } from '../../application';
import type { DayDate, Decision, EntityId } from '../../domain';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { DecisionRecordMapper } from './mappers/DecisionRecordMapper';
import type { DecisionRecord } from './records/DecisionRecord';

export class IndexedDbDecisionRepository implements DecisionRepository {
  readonly #indexedDb: LifeOsIndexedDb;

  public constructor(indexedDb: LifeOsIndexedDb = new LifeOsIndexedDb()) {
    this.#indexedDb = indexedDb;
  }

  public async findById(id: EntityId): Promise<Decision | null> {
    const database = await this.#indexedDb.open();
    const storedRecord = await executeIndexedDbRequest<unknown>(
      database,
      LIFE_OS_STORE.decisions,
      'readonly',
      (store) => store.get(id.toString()),
    );

    if (storedRecord === undefined) {
      return null;
    }

    return DecisionRecordMapper.fromRecord(storedRecord as DecisionRecord);
  }

  public async findByDate(date: DayDate): Promise<readonly Decision[]> {
    const database = await this.#indexedDb.open();
    const storedRecords = await executeIndexedDbRequest<unknown[]>(
      database,
      LIFE_OS_STORE.decisions,
      'readonly',
      (store) => store.index('byPlannedDate').getAll(date.toString()),
    );

    return storedRecords.map((record) => DecisionRecordMapper.fromRecord(record as DecisionRecord));
  }

  public async findAll(): Promise<readonly Decision[]> {
    const database = await this.#indexedDb.open();
    const storedRecords = await executeIndexedDbRequest<unknown[]>(
      database,
      LIFE_OS_STORE.decisions,
      'readonly',
      (store) => store.getAll(),
    );

    return storedRecords.map((record) => DecisionRecordMapper.fromRecord(record as DecisionRecord));
  }

  public async save(decision: Decision): Promise<void> {
    const database = await this.#indexedDb.open();
    const record = DecisionRecordMapper.toRecord(decision);

    await executeIndexedDbRequest<IDBValidKey>(
      database,
      LIFE_OS_STORE.decisions,
      'readwrite',
      (store) => store.put(record),
    );
  }

  public async saveIfVersionMatches(decision: Decision, expectedVersion: number): Promise<boolean> {
    const database = await this.#indexedDb.open();
    const transaction = database.transaction(LIFE_OS_STORE.decisions, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_STORE.decisions);
    const completion = observeTransaction(transaction);

    try {
      const stored = await observeRequest<DecisionRecord | undefined>(
        store.get(decision.id.toString()),
      );

      if (stored === undefined || stored.version !== expectedVersion) {
        transaction.abort();
        await settleTransaction(completion);
        return false;
      }

      await observeRequest(store.put(DecisionRecordMapper.toRecord(decision)));
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
    // Транзакция уже завершилась.
  }
}

async function settleTransaction(completion: Promise<void>): Promise<void> {
  try {
    await completion;
  } catch {
    // Ожидаемое завершение после отмены транзакции.
  }
}
