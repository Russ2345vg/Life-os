import type { GoalRepository } from '../../application';
import type { EntityId, Goal } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { GoalRecordMapper } from './mappers/GoalRecordMapper';
import type { GoalRecord } from './records/GoalRecord';

export class IndexedDbGoalRepository implements GoalRepository {
  public constructor(readonly indexedDb: LifeOsIndexedDb = new LifeOsIndexedDb()) {}

  public async findById(id: EntityId): Promise<Goal | null> {
    const database = await this.indexedDb.open();
    const value = await executeIndexedDbRequest<unknown>(
      database,
      LIFE_OS_STORE.goals,
      'readonly',
      (store) => store.get(id.toString()),
    );
    return value === undefined ? null : GoalRecordMapper.fromRecord(value);
  }

  public async findAll(): Promise<readonly Goal[]> {
    const database = await this.indexedDb.open();
    const values = await executeIndexedDbRequest<unknown[]>(
      database,
      LIFE_OS_STORE.goals,
      'readonly',
      (store) => store.getAll(),
    );
    return values.map((value) => GoalRecordMapper.fromRecord(value));
  }

  public async findByDirectionId(directionId: EntityId): Promise<readonly Goal[]> {
    const database = await this.indexedDb.open();
    const values = await executeIndexedDbRequest<unknown[]>(
      database,
      LIFE_OS_STORE.goals,
      'readonly',
      (store) => store.index('byDirectionId').getAll(directionId.toString()),
    );
    return values.map((value) => GoalRecordMapper.fromRecord(value));
  }

  public async create(goal: Goal): Promise<boolean> {
    const database = await this.indexedDb.open();
    try {
      await executeIndexedDbRequest(database, LIFE_OS_STORE.goals, 'readwrite', (store) =>
        store.add(GoalRecordMapper.toRecord(goal)),
      );
      return true;
    } catch (error: unknown) {
      if (isConstraintError(error)) return false;
      throw error;
    }
  }

  public async updateIfVersionMatches(goal: Goal, expectedVersion: number): Promise<boolean> {
    const database = await this.indexedDb.open();
    const transaction = database.transaction(LIFE_OS_STORE.goals, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_STORE.goals);
    const completion = observeTransaction(transaction);
    const stored = await observeRequest<GoalRecord | undefined>(store.get(goal.id.toString()));
    if (stored?.version !== expectedVersion) {
      transaction.abort();
      await settleTransaction(completion);
      return false;
    }
    await observeRequest(store.put(GoalRecordMapper.toRecord(goal)));
    await completion;
    return true;
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
