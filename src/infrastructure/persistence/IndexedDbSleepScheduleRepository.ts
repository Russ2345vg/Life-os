import type {
  SleepScheduleRepository,
  SleepScheduleUpdate,
} from '../../application/sleep/SleepScheduleRepository';
import { SLEEP_SCHEDULE_ID, type SleepScheduleState } from '../../domain/sleep/SleepSchedule';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { SleepScheduleRecordMapper } from './mappers/SleepScheduleRecordMapper';

export class IndexedDbSleepScheduleRepository implements SleepScheduleRepository {
  public constructor(private readonly database: LifeOsIndexedDb = new LifeOsIndexedDb()) {}

  public async load(): Promise<SleepScheduleState | null> {
    const database = await this.database.open();
    const record = await executeIndexedDbRequest(
      database,
      LIFE_OS_STORE.sleepSchedules,
      'readonly',
      (store) => store.get(SLEEP_SCHEDULE_ID),
    );
    return record === undefined ? null : SleepScheduleRecordMapper.fromRecord(record);
  }

  public async save(state: SleepScheduleState): Promise<void> {
    const database = await this.database.open();
    await executeIndexedDbRequest(database, LIFE_OS_STORE.sleepSchedules, 'readwrite', (store) =>
      store.put(SleepScheduleRecordMapper.toRecord(state)),
    );
  }

  public async update(transform: SleepScheduleUpdate): Promise<SleepScheduleState> {
    const database = await this.database.open();
    const transaction = database.transaction(LIFE_OS_STORE.sleepSchedules, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_STORE.sleepSchedules);
    const completion = observeTransaction(transaction);
    try {
      const record = await observeRequest<unknown>(store.get(SLEEP_SCHEDULE_ID));
      const current = record === undefined ? null : SleepScheduleRecordMapper.fromRecord(record);
      const next = transform(current);
      if (next !== current) {
        await observeRequest(store.put(SleepScheduleRecordMapper.toRecord(next)));
      }
      await completion;
      return next;
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
    // Transaction already settled.
  }
}

async function settleTransaction(completion: Promise<void>): Promise<void> {
  try {
    await completion;
  } catch {
    // Expected after aborting a failed update.
  }
}
