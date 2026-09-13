import type { DirectionRepository, DirectionVersionedUpdate } from '../../application';
import type { Direction, EntityId } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { DirectionRecordMapper } from './mappers/DirectionRecordMapper';
import type { DirectionRecord } from './records/DirectionRecord';
import {
  IndexedDbPilotMutationRecorder,
  PILOT_MUTATION_STORES,
} from '../sync/pilot/IndexedDbPilotMutationRecorder';

export class IndexedDbDirectionRepository implements DirectionRepository {
  public constructor(
    readonly indexedDb: LifeOsIndexedDb = new LifeOsIndexedDb(),
    readonly mutationRecorder: IndexedDbPilotMutationRecorder = new IndexedDbPilotMutationRecorder(),
  ) {}

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
    const transaction = database.transaction(
      [LIFE_OS_STORE.directions, ...PILOT_MUTATION_STORES],
      'readwrite',
    );
    const completion = observeTransaction(transaction);
    try {
      const record = DirectionRecordMapper.toRecord(direction);
      await observeRequest(transaction.objectStore(LIFE_OS_STORE.directions).add(record));
      const recorded = await this.mutationRecorder.recordUpsert(transaction, 'direction', record);
      await completion;
      this.mutationRecorder.notifyCommitted(recorded);
      return true;
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settleTransaction(completion);
      if (isConstraintError(error) || isConstraintDomError(error)) return false;
      throw error;
    }
  }

  public async updateIfVersionMatches(
    direction: Direction,
    expectedVersion: number,
  ): Promise<boolean> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(
      [LIFE_OS_STORE.directions, ...PILOT_MUTATION_STORES],
      'readwrite',
    );
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
    const record = DirectionRecordMapper.toRecord(direction);
    await observeRequest(store.put(record));
    const recorded = await this.mutationRecorder.recordUpsert(transaction, 'direction', record);
    await completion;
    this.mutationRecorder.notifyCommitted(recorded);
    return true;
  }

  public async updateManyIfVersionsMatch(
    updates: readonly DirectionVersionedUpdate[],
  ): Promise<boolean> {
    if (updates.length === 0) return true;
    const database = await this.indexedDb.open();
    const transaction = database.transaction(
      [LIFE_OS_STORE.directions, ...PILOT_MUTATION_STORES],
      'readwrite',
    );
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
    let recorded = false;
    for (const { direction } of updates) {
      const record = DirectionRecordMapper.toRecord(direction);
      await observeRequest(store.put(record));
      recorded =
        (await this.mutationRecorder.recordUpsert(transaction, 'direction', record)) || recorded;
    }
    await completion;
    this.mutationRecorder.notifyCommitted(recorded);
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

function abortQuietly(transaction: IDBTransaction): void {
  try {
    transaction.abort();
  } catch {
    /* Transaction already settled. */
  }
}

function isConstraintDomError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'ConstraintError'
  );
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
