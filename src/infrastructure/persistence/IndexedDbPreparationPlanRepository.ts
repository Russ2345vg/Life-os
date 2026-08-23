import type { PreparationPlanRepository } from '../../application';
import type { EntityId, PreparationPlan } from '../../domain';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { PreparationPlanRecordMapper } from './mappers/PreparationPlanRecordMapper';
import type { PreparationPlanRecord } from './records/PreparationPlanRecord';

export class IndexedDbPreparationPlanRepository implements PreparationPlanRepository {
  public constructor(private readonly database: LifeOsIndexedDb = new LifeOsIndexedDb()) {}

  public async findById(id: EntityId): Promise<PreparationPlan | null> {
    return this.find((store) => store.get(id.toString()));
  }
  public async findByCycleId(cycleId: EntityId): Promise<PreparationPlan | null> {
    return this.find((store) => store.index('byCycleId').get(cycleId.toString()));
  }
  public async findByTomorrowPlanId(tomorrowPlanId: EntityId): Promise<PreparationPlan | null> {
    return this.find((store) => store.index('byTomorrowPlanId').get(tomorrowPlanId.toString()));
  }
  public async findByTargetDayId(targetDayId: EntityId): Promise<PreparationPlan | null> {
    return this.find((store) => store.index('byTargetDayId').get(targetDayId.toString()));
  }

  public async createIfAbsent(plan: PreparationPlan): Promise<PreparationPlan> {
    const database = await this.database.open();
    const transaction = database.transaction(LIFE_OS_STORE.preparationPlans, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_STORE.preparationPlans);
    const completion = observeTransaction(transaction);
    try {
      const existing =
        (await getByIndex(store, 'byCycleId', plan.cycleId.toString())) ??
        (await getByIndex(store, 'byTomorrowPlanId', plan.tomorrowPlanId.toString())) ??
        (await getByIndex(store, 'byTargetDayId', plan.targetDayId.toString()));
      if (existing !== undefined) {
        await completion;
        return PreparationPlanRecordMapper.fromRecord(existing);
      }
      await observeRequest(store.add(PreparationPlanRecordMapper.toRecord(plan)));
      await completion;
      return plan;
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settle(completion);
      throw error;
    }
  }

  public async saveIfVersionMatches(
    plan: PreparationPlan,
    expectedVersion: number,
  ): Promise<boolean> {
    const database = await this.database.open();
    const transaction = database.transaction(LIFE_OS_STORE.preparationPlans, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_STORE.preparationPlans);
    const completion = observeTransaction(transaction);
    try {
      const stored = await observeRequest<PreparationPlanRecord | undefined>(
        store.get(plan.id.toString()),
      );
      if (stored === undefined || stored.version !== expectedVersion) {
        transaction.abort();
        await settle(completion);
        return false;
      }
      await observeRequest(store.put(PreparationPlanRecordMapper.toRecord(plan)));
      await completion;
      return true;
    } catch (error: unknown) {
      abortQuietly(transaction);
      await settle(completion);
      throw error;
    }
  }

  private async find(
    request: (store: IDBObjectStore) => IDBRequest<PreparationPlanRecord | undefined>,
  ): Promise<PreparationPlan | null> {
    const database = await this.database.open();
    const transaction = database.transaction(LIFE_OS_STORE.preparationPlans, 'readonly');
    const record = await observeRequest(
      request(transaction.objectStore(LIFE_OS_STORE.preparationPlans)),
    );
    return record === undefined ? null : PreparationPlanRecordMapper.fromRecord(record);
  }
}

function getByIndex(
  store: IDBObjectStore,
  index: string,
  value: string,
): Promise<PreparationPlanRecord | undefined> {
  return observeRequest(store.index(index).get(value));
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
    // Already settled.
  }
}
async function settle(completion: Promise<void>): Promise<void> {
  try {
    await completion;
  } catch {
    // Expected after abort.
  }
}
