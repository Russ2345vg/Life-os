import type { RoutineOccurrenceOverrideRepository } from '../../application';
import type { DayDate, EntityId, RoutineOccurrenceOverride } from '../../domain';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import {
  RoutineOccurrenceOverrideRecordMapper,
  occurrenceKey,
} from './mappers/RoutineOccurrenceOverrideRecordMapper';
import type { RoutineOccurrenceOverrideRecord } from './records/RoutineOccurrenceOverrideRecord';

export class IndexedDbRoutineOccurrenceOverrideRepository implements RoutineOccurrenceOverrideRepository {
  public constructor(readonly indexedDb: LifeOsIndexedDb = new LifeOsIndexedDb()) {}

  public async findByOccurrence(
    routineBlockId: EntityId,
    occurrenceDate: DayDate,
  ): Promise<RoutineOccurrenceOverride | null> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(LIFE_OS_STORE.routineOccurrenceOverrides, 'readonly');
    const record = await observeRequest<unknown>(
      transaction
        .objectStore(LIFE_OS_STORE.routineOccurrenceOverrides)
        .index('byOccurrence')
        .get(occurrenceKey(routineBlockId.toString(), occurrenceDate.toString())),
    );
    return record === undefined ? null : RoutineOccurrenceOverrideRecordMapper.fromRecord(record);
  }

  public async findAll(): Promise<readonly RoutineOccurrenceOverride[]> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(LIFE_OS_STORE.routineOccurrenceOverrides, 'readonly');
    const records = await observeRequest<unknown[]>(
      transaction.objectStore(LIFE_OS_STORE.routineOccurrenceOverrides).getAll(),
    );
    return records.map((record) => RoutineOccurrenceOverrideRecordMapper.fromRecord(record));
  }

  public async saveIfVersionMatches(
    override: RoutineOccurrenceOverride,
    expectedVersion: number | null,
  ): Promise<boolean> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(LIFE_OS_STORE.routineOccurrenceOverrides, 'readwrite');
    const completion = observeTransaction(transaction);
    const store = transaction.objectStore(LIFE_OS_STORE.routineOccurrenceOverrides);
    try {
      const existing = await observeRequest<RoutineOccurrenceOverrideRecord | undefined>(
        store
          .index('byOccurrence')
          .get(
            occurrenceKey(override.routineBlockId.toString(), override.occurrenceDate.toString()),
          ),
      );
      if (
        (expectedVersion === null && existing !== undefined) ||
        (expectedVersion !== null && existing?.version !== expectedVersion)
      ) {
        transaction.abort();
        await settle(completion);
        return false;
      }
      await observeRequest(
        expectedVersion === null
          ? store.add(RoutineOccurrenceOverrideRecordMapper.toRecord(override))
          : store.put(RoutineOccurrenceOverrideRecordMapper.toRecord(override)),
      );
      await completion;
      return true;
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settle(completion);
      if (error instanceof DOMException && error.name === 'ConstraintError') return false;
      throw error;
    }
  }

  public async deleteIfVersionMatches(id: EntityId, expectedVersion: number): Promise<boolean> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(LIFE_OS_STORE.routineOccurrenceOverrides, 'readwrite');
    const completion = observeTransaction(transaction);
    const store = transaction.objectStore(LIFE_OS_STORE.routineOccurrenceOverrides);
    try {
      const existing = await observeRequest<RoutineOccurrenceOverrideRecord | undefined>(
        store.get(id.toString()),
      );
      if (existing === undefined || existing.version !== expectedVersion) {
        transaction.abort();
        await settle(completion);
        return false;
      }
      await observeRequest(store.delete(id.toString()));
      await completion;
      return true;
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settle(completion);
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
    /* already complete */
  }
}

async function settle(completion: Promise<void>): Promise<void> {
  try {
    await completion;
  } catch {
    /* expected abort */
  }
}
