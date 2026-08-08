import type { RoutineBlockRepository } from '../../application';
import type { EntityId, RoutineBlock } from '../../domain';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { RoutineBlockRecordMapper } from './mappers/RoutineBlockRecordMapper';
import type { RoutineBlockRecord } from './records/RoutineBlockRecord';

export class IndexedDbRoutineBlockRepository implements RoutineBlockRepository {
  public constructor(readonly indexedDb: LifeOsIndexedDb = new LifeOsIndexedDb()) {}

  public async findById(id: EntityId): Promise<RoutineBlock | null> {
    const database = await this.indexedDb.open();
    const value = await executeIndexedDbRequest<unknown>(
      database,
      LIFE_OS_STORE.routineBlocks,
      'readonly',
      (store) => store.get(id.toString()),
    );
    return value === undefined ? null : RoutineBlockRecordMapper.fromRecord(value);
  }

  public async findAll(): Promise<readonly RoutineBlock[]> {
    const database = await this.indexedDb.open();
    const values = await executeIndexedDbRequest<unknown[]>(
      database,
      LIFE_OS_STORE.routineBlocks,
      'readonly',
      (store) => store.getAll(),
    );
    return values.map((value) => RoutineBlockRecordMapper.fromRecord(value));
  }

  public async save(block: RoutineBlock): Promise<void> {
    const database = await this.indexedDb.open();
    await executeIndexedDbRequest(database, LIFE_OS_STORE.routineBlocks, 'readwrite', (store) =>
      store.put(RoutineBlockRecordMapper.toRecord(block)),
    );
  }

  public async saveIfVersionMatches(
    block: RoutineBlock,
    expectedVersion: number,
  ): Promise<boolean> {
    return this.mutateIfVersionMatches(block.id, expectedVersion, (store) =>
      store.put(RoutineBlockRecordMapper.toRecord(block)),
    );
  }

  public async deleteIfVersionMatches(id: EntityId, expectedVersion: number): Promise<boolean> {
    return this.mutateIfVersionMatches(id, expectedVersion, (store) => store.delete(id.toString()));
  }

  private async mutateIfVersionMatches(
    id: EntityId,
    expectedVersion: number,
    mutate: (store: IDBObjectStore) => IDBRequest,
  ): Promise<boolean> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(LIFE_OS_STORE.routineBlocks, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_STORE.routineBlocks);
    const completion = observeTransaction(transaction);
    try {
      const stored = await observeRequest<RoutineBlockRecord | undefined>(store.get(id.toString()));
      if (stored === undefined || stored.version !== expectedVersion) {
        transaction.abort();
        await settleTransaction(completion);
        return false;
      }
      await observeRequest(mutate(store));
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
    // Transaction is already complete.
  }
}

async function settleTransaction(completion: Promise<void>): Promise<void> {
  try {
    await completion;
  } catch {
    // An abort is expected when the version does not match.
  }
}
