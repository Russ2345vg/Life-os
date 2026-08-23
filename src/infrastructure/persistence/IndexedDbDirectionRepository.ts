import type { DirectionRepository, DirectionVersionedUpdate } from '../../application';
import type { Direction, EntityId } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { DirectionRecordMapper } from './mappers/DirectionRecordMapper';
import type { DirectionRecord } from './records/DirectionRecord';

export class IndexedDbDirectionRepository implements DirectionRepository {
  public constructor(readonly indexedDb: LifeOsIndexedDb = new LifeOsIndexedDb()) {}

  public async findById(id: EntityId): Promise<Direction | null> {
    const database = await this.indexedDb.open();
    const value = await executeIndexedDbRequest<unknown>(
      database,
      LIFE_OS_STORE.directions,
      'readonly',
      (store) => store.get(id.toString()),
    );
    return value === undefined ? null : DirectionRecordMapper.fromRecord(value);
  }

  public async findAll(): Promise<readonly Direction[]> {
    return this.readMany((store) => store.getAll());
  }

  public async findBySphereId(sphereId: EntityId): Promise<readonly Direction[]> {
    return this.readMany((store) => store.index('bySphereId').getAll(sphereId.toString()));
  }

  public async create(direction: Direction): Promise<boolean> {
    const database = await this.indexedDb.open();
    try {
      await executeIndexedDbRequest(database, LIFE_OS_STORE.directions, 'readwrite', (store) =>
        store.add(DirectionRecordMapper.toRecord(direction)),
      );
      return true;
    } catch (error: unknown) {
      if (isConstraintError(error)) return false;
      throw error;
    }
  }

  public async updateIfVersionMatches(
    direction: Direction,
    expectedVersion: number,
  ): Promise<boolean> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(LIFE_OS_STORE.directions, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_STORE.directions);
    const completion = observeTransaction(transaction);
    const stored = await observeRequest<DirectionRecord | undefined>(
      store.get(direction.id.toString()),
    );
    if (stored?.version !== expectedVersion) {
      transaction.abort();
      await settleTransaction(completion);
      return false;
    }
    await observeRequest(store.put(DirectionRecordMapper.toRecord(direction)));
    await completion;
    return true;
  }

  public async updateManyIfVersionsMatch(
    updates: readonly DirectionVersionedUpdate[],
  ): Promise<boolean> {
    if (updates.length === 0) return true;
    const database = await this.indexedDb.open();
    const transaction = database.transaction(LIFE_OS_STORE.directions, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_STORE.directions);
    const completion = observeTransaction(transaction);
    for (const { direction, expectedVersion } of updates) {
      const stored = await observeRequest<DirectionRecord | undefined>(
        store.get(direction.id.toString()),
      );
      if (stored?.version !== expectedVersion) {
        transaction.abort();
        await settleTransaction(completion);
        return false;
      }
    }
    for (const { direction } of updates) {
      await observeRequest(store.put(DirectionRecordMapper.toRecord(direction)));
    }
    await completion;
    return true;
  }

  private async readMany(
    request: (store: IDBObjectStore) => IDBRequest<unknown[]>,
  ): Promise<readonly Direction[]> {
    const database = await this.indexedDb.open();
    const values = await executeIndexedDbRequest(
      database,
      LIFE_OS_STORE.directions,
      'readonly',
      request,
    );
    return values.map((value) => DirectionRecordMapper.fromRecord(value));
  }
}

function isConstraintError(error: unknown): boolean {
  return error instanceof DomainError && error.code === 'persistence.constraint_violation';
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

async function settleTransaction(completion: Promise<void>): Promise<void> {
  try {
    await completion;
  } catch {
    // Expected controlled abort.
  }
}
