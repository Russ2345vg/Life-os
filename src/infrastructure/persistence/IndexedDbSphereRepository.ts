import type {
  CreateSpherePersistenceResult,
  SphereRepository,
  UpdateSpherePersistenceResult,
} from '../../application';
import { sphereNameKey, type EntityId, type Sphere } from '../../domain';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { SphereRecordMapper } from './mappers/SphereRecordMapper';
import type { SphereRecord } from './records/SphereRecord';

export class IndexedDbSphereRepository implements SphereRepository {
  public constructor(readonly indexedDb: LifeOsIndexedDb = new LifeOsIndexedDb()) {}

  public async findById(id: EntityId): Promise<Sphere | null> {
    const database = await this.indexedDb.open();
    const value = await executeIndexedDbRequest<unknown>(
      database,
      LIFE_OS_STORE.spheres,
      'readonly',
      (store) => store.get(id.toString()),
    );
    return value === undefined ? null : SphereRecordMapper.fromRecord(value);
  }

  public async findAll(): Promise<readonly Sphere[]> {
    const database = await this.indexedDb.open();
    const values = await executeIndexedDbRequest<unknown[]>(
      database,
      LIFE_OS_STORE.spheres,
      'readonly',
      (store) => store.getAll(),
    );
    return values.map((value) => SphereRecordMapper.fromRecord(value));
  }

  public async createIfNameAvailable(sphere: Sphere): Promise<CreateSpherePersistenceResult> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(
      this.indexedDb.balanceTransactionStores([LIFE_OS_STORE.spheres]),
      'readwrite',
    );
    const store = transaction.objectStore(LIFE_OS_STORE.spheres);
    const completion = observeTransaction(transaction);
    try {
      const existingId = await observeRequest<SphereRecord | undefined>(
        store.get(sphere.id.toString()),
      );
      if (existingId !== undefined) return abortWith(transaction, completion, 'idConflict');
      const existingName = await observeRequest<SphereRecord | undefined>(
        store.index('byNormalizedName').get(sphereNameKey(sphere.name)),
      );
      if (existingName !== undefined) return abortWith(transaction, completion, 'nameConflict');
      await observeRequest(store.add(SphereRecordMapper.toRecord(sphere)));
      await this.indexedDb.refreshBalanceSnapshots(transaction);
      await completion;
      return 'saved';
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settleTransaction(completion);
      throw error;
    }
  }

  public async updateIfVersionMatchesAndNameAvailable(
    sphere: Sphere,
    expectedVersion: number,
  ): Promise<UpdateSpherePersistenceResult> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(
      this.indexedDb.balanceTransactionStores([LIFE_OS_STORE.spheres]),
      'readwrite',
    );
    const store = transaction.objectStore(LIFE_OS_STORE.spheres);
    const completion = observeTransaction(transaction);
    try {
      const stored = await observeRequest<SphereRecord | undefined>(
        store.get(sphere.id.toString()),
      );
      if (stored?.version !== expectedVersion) {
        return abortWith(transaction, completion, 'versionConflict');
      }
      const sameName = await observeRequest<SphereRecord | undefined>(
        store.index('byNormalizedName').get(sphereNameKey(sphere.name)),
      );
      if (sameName !== undefined && sameName.id !== sphere.id.toString()) {
        return abortWith(transaction, completion, 'nameConflict');
      }
      await observeRequest(store.put({ ...stored, ...SphereRecordMapper.toRecord(sphere) }));
      await this.indexedDb.refreshBalanceSnapshots(transaction);
      await completion;
      return 'saved';
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settleTransaction(completion);
      throw error;
    }
  }
}

async function abortWith<T>(
  transaction: IDBTransaction,
  completion: Promise<void>,
  result: T,
): Promise<T> {
  transaction.abort();
  await settleTransaction(completion);
  return result;
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
    // An abort is expected for a controlled conflict.
  }
}
