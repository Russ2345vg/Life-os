import { DomainError } from '../../shared/errors/DomainError';
import {
  TIME_CAPACITY_ID,
  parseTimeCapacityRecord,
  validateTimeCapacityWeekdays,
  type TimeCapacityRecord,
  type TimeCapacityRepository,
} from '../../application/time/TimeCapacityService';
import { done, request } from '../sync/attachments/AttachmentRegistration';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';

export class IndexedDbTimeCapacityRepository implements TimeCapacityRepository {
  public constructor(readonly db: LifeOsIndexedDb) {}

  public async get(): Promise<TimeCapacityRecord | null> {
    const database = await this.db.open();
    const value = await request<unknown>(
      database
        .transaction(LIFE_OS_STORE.timeCapacity)
        .objectStore(LIFE_OS_STORE.timeCapacity)
        .get(TIME_CAPACITY_ID),
    );
    return value === undefined ? null : parseTimeCapacityRecord(value);
  }

  public async save(
    weekdays: readonly (number | null)[],
    expectedVersion: number | null,
  ): Promise<void> {
    validateTimeCapacityWeekdays(weekdays);
    const database = await this.db.open();
    const tx = database.transaction(LIFE_OS_STORE.timeCapacity, 'readwrite');
    const completion = done(tx);
    void completion.catch(() => undefined);
    try {
      const store = tx.objectStore(LIFE_OS_STORE.timeCapacity);
      const raw = await request<unknown>(store.get(TIME_CAPACITY_ID));
      const current = raw === undefined ? null : parseTimeCapacityRecord(raw);
      if ((current?.version ?? null) !== expectedVersion)
        throw new DomainError(
          'persistence.version_conflict',
          'Доступное время изменилось в другой вкладке.',
        );
      store.put({
        schemaVersion: 1,
        id: TIME_CAPACITY_ID,
        weekdays: [...weekdays],
        version: (expectedVersion ?? 0) + 1,
      } satisfies TimeCapacityRecord);
      await completion;
    } catch (error: unknown) {
      try {
        tx.abort();
      } catch {
        /* Transaction already closed. */
      }
      await completion.catch(() => undefined);
      throw error;
    }
  }
}
