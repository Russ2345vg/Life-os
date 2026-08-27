import type { MorningCycleRepository } from '../../application';
import type { DayDate, EntityId, MorningCycle } from '../../domain';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { MorningCycleRecordMapper } from './mappers/MorningCycleRecordMapper';
import type { MorningCycleRecord } from './records/MorningCycleRecord';

export class IndexedDbMorningCycleRepository implements MorningCycleRepository {
  public constructor(private readonly indexedDb: LifeOsIndexedDb = new LifeOsIndexedDb()) {}

  public findByDayId(dayId: EntityId): Promise<MorningCycle | null> {
    return this.findByIndex('byDayId', dayId.toString());
  }

  public findByDateKey(dateKey: DayDate): Promise<MorningCycle | null> {
    return this.findByIndex('byDateKey', dateKey.toString());
  }

  public async findLatestUnfinishedBefore(dateKey: DayDate): Promise<MorningCycle | null> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(LIFE_OS_STORE.morningCycles, 'readonly');
    const request = transaction
      .objectStore(LIFE_OS_STORE.morningCycles)
      .index('byDateKey')
      .openCursor(IDBKeyRange.upperBound(dateKey.toString(), true), 'prev');

    return new Promise((resolve, reject) => {
      request.addEventListener('success', () => {
        const cursor = request.result;
        if (cursor === null) {
          resolve(null);
          return;
        }
        try {
          const cycle = MorningCycleRecordMapper.fromRecord(cursor.value);
          if (cycle.isActive()) {
            resolve(cycle);
            return;
          }
          cursor.continue();
        } catch (error: unknown) {
          reject(error);
        }
      });
      request.addEventListener('error', () => reject(request.error));
      transaction.addEventListener('abort', () => reject(transaction.error));
    });
  }

  public async createIfAbsent(cycle: MorningCycle): Promise<MorningCycle> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(LIFE_OS_STORE.morningCycles, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_STORE.morningCycles);
    const completion = observeTransaction(transaction);
    try {
      const existing = await observeRequest<MorningCycleRecord | undefined>(
        store.index('byDateKey').get(cycle.dateKey.toString()),
      );
      if (existing !== undefined) {
        await completion;
        return MorningCycleRecordMapper.fromRecord(existing);
      }
      await observeRequest(store.add(MorningCycleRecordMapper.toRecord(cycle)));
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
    cycle: MorningCycle,
    expectedVersion: number,
  ): Promise<boolean> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(LIFE_OS_STORE.morningCycles, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_STORE.morningCycles);
    const completion = observeTransaction(transaction);
    try {
      const stored = await observeRequest<MorningCycleRecord | undefined>(
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
      await observeRequest(store.put(MorningCycleRecordMapper.toRecord(cycle)));
      await completion;
      return true;
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settleTransaction(completion);
      throw error;
    }
  }

  private async findByIndex(indexName: string, key: string): Promise<MorningCycle | null> {
    const database = await this.indexedDb.open();
    const record = await executeIndexedDbRequest<unknown>(
      database,
      LIFE_OS_STORE.morningCycles,
      'readonly',
      (store) => store.index(indexName).get(key),
    );
    return record === undefined ? null : MorningCycleRecordMapper.fromRecord(record);
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
