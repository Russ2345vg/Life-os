import type { StartWalkPersistenceResult, WalkRepository } from '../../application';
import { WALK_STATUS, type DayDate, type EntityId, type Walk } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { WalkRecordMapper } from './mappers/WalkRecordMapper';
import type { WalkRecord } from './records/WalkRecord';

export class IndexedDbWalkRepository implements WalkRepository {
  public constructor(readonly indexedDb: LifeOsIndexedDb = new LifeOsIndexedDb()) {}

  public async findById(id: EntityId): Promise<Walk | null> {
    const database = await this.indexedDb.open();
    const value = await executeIndexedDbRequest<unknown>(
      database,
      LIFE_OS_STORE.walks,
      'readonly',
      (store) => store.get(id.toString()),
    );
    return value === undefined ? null : WalkRecordMapper.fromRecord(value);
  }

  public async findAll(): Promise<readonly Walk[]> {
    const database = await this.indexedDb.open();
    const values = await executeIndexedDbRequest<unknown[]>(
      database,
      LIFE_OS_STORE.walks,
      'readonly',
      (store) => store.getAll(),
    );
    return values.map((value) => WalkRecordMapper.fromRecord(value));
  }

  public async findByDate(date: DayDate): Promise<readonly Walk[]> {
    const database = await this.indexedDb.open();
    const values = await executeIndexedDbRequest<unknown[]>(
      database,
      LIFE_OS_STORE.walks,
      'readonly',
      (store) => store.index('byDate').getAll(IDBKeyRange.only(date.toString())),
    );
    return values.map((value) => WalkRecordMapper.fromRecord(value));
  }

  public async findRunning(): Promise<Walk | null> {
    const database = await this.indexedDb.open();
    const values = await executeIndexedDbRequest<unknown[]>(
      database,
      LIFE_OS_STORE.walks,
      'readonly',
      (store) => store.index('byStatus').getAll(WALK_STATUS.running),
    );
    if (values.length > 1) throw multipleRunningWalks();
    const value = values[0];
    return value === undefined ? null : WalkRecordMapper.fromRecord(value);
  }

  public async findActive(): Promise<Walk | null> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(LIFE_OS_STORE.walks, 'readonly');
    const completion = observeTransaction(transaction);
    const statusIndex = transaction.objectStore(LIFE_OS_STORE.walks).index('byStatus');
    const [running, paused] = await Promise.all([
      observeRequest<unknown[]>(statusIndex.getAll(WALK_STATUS.running)),
      observeRequest<unknown[]>(statusIndex.getAll(WALK_STATUS.paused)),
    ]);
    await completion;
    const active = [...running, ...paused];
    if (active.length > 1) throw multipleActiveWalks();
    const value = active[0];
    return value === undefined ? null : WalkRecordMapper.fromRecord(value);
  }

  public async save(walk: Walk): Promise<void> {
    const database = await this.indexedDb.open();
    await executeIndexedDbRequest(database, LIFE_OS_STORE.walks, 'readwrite', (store) =>
      store.put(WalkRecordMapper.toRecord(walk)),
    );
  }

  public async startIfVersionMatches(
    walk: Walk,
    expectedVersion: number,
  ): Promise<StartWalkPersistenceResult> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(LIFE_OS_STORE.walks, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_STORE.walks);
    const completion = observeTransaction(transaction);
    try {
      const stored = await observeRequest<WalkRecord | undefined>(store.get(walk.id.toString()));
      if (stored?.version !== expectedVersion) {
        transaction.abort();
        await settleTransaction(completion);
        return 'versionConflict';
      }
      const running = await observeRequest<WalkRecord | undefined>(
        store.index('byStatus').get(WALK_STATUS.running),
      );
      const paused = await observeRequest<WalkRecord | undefined>(
        store.index('byStatus').get(WALK_STATUS.paused),
      );
      if (
        (running !== undefined && running.id !== walk.id.toString()) ||
        (paused !== undefined && paused.id !== walk.id.toString())
      ) {
        transaction.abort();
        await settleTransaction(completion);
        return 'runningExists';
      }
      await observeRequest(store.put(WalkRecordMapper.toRecord(walk)));
      await completion;
      return 'saved';
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settleTransaction(completion);
      throw error;
    }
  }

  public async deleteIfVersionMatches(id: EntityId, expectedVersion: number): Promise<boolean> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(LIFE_OS_STORE.walks, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_STORE.walks);
    const completion = observeTransaction(transaction);
    try {
      const stored = await observeRequest<WalkRecord | undefined>(store.get(id.toString()));
      if (stored === undefined || stored.version !== expectedVersion) {
        transaction.abort();
        await settleTransaction(completion);
        return false;
      }
      await observeRequest(store.delete(id.toString()));
      await completion;
      return true;
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settleTransaction(completion);
      throw error;
    }
  }

  public async updateIfVersionMatches(walk: Walk, expectedVersion: number): Promise<boolean> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(LIFE_OS_STORE.walks, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_STORE.walks);
    const completion = observeTransaction(transaction);
    try {
      const stored = await observeRequest<WalkRecord | undefined>(store.get(walk.id.toString()));
      if (stored?.version !== expectedVersion) {
        transaction.abort();
        await settleTransaction(completion);
        return false;
      }
      await observeRequest(store.put(WalkRecordMapper.toRecord(walk)));
      await completion;
      return true;
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settleTransaction(completion);
      throw error;
    }
  }
}

function multipleRunningWalks(): DomainError {
  return new DomainError(
    'walk.multiple_running',
    'Обнаружено несколько идущих прогулок. Данные не изменены.',
  );
}

function multipleActiveWalks(): DomainError {
  return new DomainError(
    'walk.multiple_active',
    'Обнаружено несколько активных прогулок. Данные не изменены.',
  );
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
