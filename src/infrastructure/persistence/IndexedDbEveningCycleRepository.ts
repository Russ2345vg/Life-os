import type { EveningCycleRepository } from '../../application';
import { EVENING_CYCLE_STATE, type DayDate, type EntityId, type EveningCycle } from '../../domain';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { EveningCycleRecordMapper } from './mappers/EveningCycleRecordMapper';
import type { EveningCycleRecord } from './records/EveningCycleRecord';

export class IndexedDbEveningCycleRepository implements EveningCycleRepository {
  readonly #indexedDb: LifeOsIndexedDb;

  public constructor(indexedDb: LifeOsIndexedDb = new LifeOsIndexedDb()) {
    this.#indexedDb = indexedDb;
  }

  public async findById(id: EntityId): Promise<EveningCycle | null> {
    const database = await this.#indexedDb.open();
    const record = await executeIndexedDbRequest<unknown>(
      database,
      LIFE_OS_STORE.eveningCycles,
      'readonly',
      (store) => store.get(id.toString()),
    );
    return record === undefined ? null : EveningCycleRecordMapper.fromRecord(record);
  }

  public async findByDayId(dayId: EntityId): Promise<EveningCycle | null> {
    return this.findByIndex('byDayId', dayId.toString());
  }

  public async findByDateKey(dateKey: DayDate): Promise<EveningCycle | null> {
    return this.findByIndex('byDateKey', dateKey.toString());
  }

  public async findLatestUnfinishedOnOrBefore(dateKey: DayDate): Promise<EveningCycle | null> {
    const database = await this.#indexedDb.open();
    const records = await executeIndexedDbRequest<unknown[]>(
      database,
      LIFE_OS_STORE.eveningCycles,
      'readonly',
      (store) => store.getAll(),
    );
    return (
      records
        .map((record) => EveningCycleRecordMapper.fromRecord(record))
        .filter(
          (cycle) =>
            !cycle.dateKey.isAfter(dateKey) &&
            cycle.state !== EVENING_CYCLE_STATE.notStarted &&
            cycle.state !== EVENING_CYCLE_STATE.completed,
        )
        .sort((left, right) =>
          right.dateKey.toString().localeCompare(left.dateKey.toString()),
        )[0] ?? null
    );
  }

  public async findLatestWithSavedRelaxationDefaultBefore(
    dateKey: DayDate,
  ): Promise<EveningCycle | null> {
    const database = await this.#indexedDb.open();
    const records = await executeIndexedDbRequest<unknown[]>(
      database,
      LIFE_OS_STORE.eveningCycles,
      'readonly',
      (store) => store.getAll(),
    );
    return (
      records
        .map((record) => EveningCycleRecordMapper.fromRecord(record))
        .filter(
          (cycle) =>
            cycle.dateKey.isBefore(dateKey) && cycle.relaxation?.defaultChangedForFuture === true,
        )
        .sort((left, right) =>
          right.dateKey.toString().localeCompare(left.dateKey.toString()),
        )[0] ?? null
    );
  }

  public async createIfAbsent(cycle: EveningCycle): Promise<EveningCycle> {
    const database = await this.#indexedDb.open();
    const transaction = database.transaction(LIFE_OS_STORE.eveningCycles, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_STORE.eveningCycles);
    const completion = observeTransaction(transaction);
    try {
      const existing = await observeRequest<EveningCycleRecord | undefined>(
        store.index('byDateKey').get(cycle.dateKey.toString()),
      );
      if (existing !== undefined) {
        await completion;
        return EveningCycleRecordMapper.fromRecord(existing);
      }
      await observeRequest(store.add(EveningCycleRecordMapper.toRecord(cycle)));
      await completion;
      return cycle;
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settleTransaction(completion);
      const existing = await this.findByDateKey(cycle.dateKey);
      if (existing !== null) return existing;
      throw error;
    }
  }

  public async saveIfVersionMatches(
    cycle: EveningCycle,
    expectedVersion: number,
  ): Promise<boolean> {
    const database = await this.#indexedDb.open();
    const transaction = database.transaction(LIFE_OS_STORE.eveningCycles, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_STORE.eveningCycles);
    const completion = observeTransaction(transaction);
    try {
      const stored = await observeRequest<EveningCycleRecord | undefined>(
        store.get(cycle.id.toString()),
      );
      if (
        stored === undefined ||
        stored.version !== expectedVersion ||
        stored.dayId !== cycle.dayId.toString() ||
        stored.dateKey !== cycle.dateKey.toString()
      ) {
        transaction.abort();
        await settleTransaction(completion);
        return false;
      }
      await observeRequest(store.put(EveningCycleRecordMapper.toRecord(cycle)));
      await completion;
      return true;
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settleTransaction(completion);
      throw error;
    }
  }

  private async findByIndex(indexName: string, key: string): Promise<EveningCycle | null> {
    const database = await this.#indexedDb.open();
    const record = await executeIndexedDbRequest<unknown>(
      database,
      LIFE_OS_STORE.eveningCycles,
      'readonly',
      (store) => store.index(indexName).get(key),
    );
    return record === undefined ? null : EveningCycleRecordMapper.fromRecord(record);
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
    // Transaction already settled.
  }
}

async function settleTransaction(completion: Promise<void>): Promise<void> {
  try {
    await completion;
  } catch {
    // Expected after an optimistic abort.
  }
}
