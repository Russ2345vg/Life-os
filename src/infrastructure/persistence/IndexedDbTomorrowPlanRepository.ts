import type { TomorrowPlanRepository } from '../../application';
import type { DayDate, EntityId, TomorrowPlan } from '../../domain';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { TomorrowPlanRecordMapper } from './mappers/TomorrowPlanRecordMapper';
import type { TomorrowPlanRecord } from './records/TomorrowPlanRecord';

export class IndexedDbTomorrowPlanRepository implements TomorrowPlanRepository {
  readonly #database: LifeOsIndexedDb;

  public constructor(database: LifeOsIndexedDb = new LifeOsIndexedDb()) {
    this.#database = database;
  }

  public async findById(id: EntityId): Promise<TomorrowPlan | null> {
    return this.findByRequest((store) => store.get(id.toString()));
  }

  public async findByCycleId(cycleId: EntityId): Promise<TomorrowPlan | null> {
    return this.findByRequest((store) => store.index('byCycleId').get(cycleId.toString()));
  }

  public async findByTargetDate(date: DayDate): Promise<TomorrowPlan | null> {
    return this.findByRequest((store) => store.index('byTargetDateKey').get(date.toString()));
  }

  public async createIfAbsent(plan: TomorrowPlan): Promise<TomorrowPlan> {
    const database = await this.#database.open();
    const transaction = database.transaction(LIFE_OS_STORE.tomorrowPlans, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_STORE.tomorrowPlans);
    const completion = observeTransaction(transaction);
    try {
      const existing = await observeRequest<TomorrowPlanRecord | undefined>(
        store.index('byCycleId').get(plan.cycleId.toString()),
      );
      if (existing !== undefined) {
        await completion;
        return TomorrowPlanRecordMapper.fromRecord(existing);
      }
      const targetExisting = await observeRequest<TomorrowPlanRecord | undefined>(
        store.index('byTargetDateKey').get(plan.targetDateKey.toString()),
      );
      if (targetExisting !== undefined) {
        await completion;
        return TomorrowPlanRecordMapper.fromRecord(targetExisting);
      }
      await observeRequest(store.add(TomorrowPlanRecordMapper.toRecord(plan)));
      await completion;
      return plan;
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settleTransaction(completion);
      throw error;
    }
  }

  public async saveIfVersionMatches(plan: TomorrowPlan, expectedVersion: number): Promise<boolean> {
    const database = await this.#database.open();
    const transaction = database.transaction(LIFE_OS_STORE.tomorrowPlans, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_STORE.tomorrowPlans);
    const completion = observeTransaction(transaction);
    try {
      const stored = await observeRequest<TomorrowPlanRecord | undefined>(
        store.get(plan.id.toString()),
      );
      if (stored === undefined || stored.version !== expectedVersion) {
        transaction.abort();
        await settleTransaction(completion);
        return false;
      }
      await observeRequest(store.put(TomorrowPlanRecordMapper.toRecord(plan)));
      await completion;
      return true;
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settleTransaction(completion);
      throw error;
    }
  }

  private async findByRequest(
    request: (store: IDBObjectStore) => IDBRequest<TomorrowPlanRecord | undefined>,
  ): Promise<TomorrowPlan | null> {
    const database = await this.#database.open();
    const transaction = database.transaction(LIFE_OS_STORE.tomorrowPlans, 'readonly');
    const record = await observeRequest(
      request(transaction.objectStore(LIFE_OS_STORE.tomorrowPlans)),
    );
    return record === undefined ? null : TomorrowPlanRecordMapper.fromRecord(record);
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
    /* transaction already settled */
  }
}

async function settleTransaction(completion: Promise<void>): Promise<void> {
  try {
    await completion;
  } catch {
    /* expected after abort */
  }
}
