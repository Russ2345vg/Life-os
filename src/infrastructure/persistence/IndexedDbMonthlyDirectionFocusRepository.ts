import type { MonthlyDirectionFocusRepository } from '../../application/ports/MonthlyDirectionFocusRepository';
import {
  monthlyDirectionFocusId,
  type MonthlyDirectionFocus,
} from '../../domain/planner/MonthlyDirectionFocus';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { MonthlyDirectionFocusRecordMapper } from './mappers/MonthlyDirectionFocusRecordMapper';

export class IndexedDbMonthlyDirectionFocusRepository implements MonthlyDirectionFocusRepository {
  public constructor(private readonly database: LifeOsIndexedDb) {}

  public async findByMonth(month: string): Promise<MonthlyDirectionFocus | null> {
    const database = await this.database.open();
    const stored = await request<unknown>(
      database
        .transaction(LIFE_OS_STORE.monthlyDirectionFocuses)
        .objectStore(LIFE_OS_STORE.monthlyDirectionFocuses)
        .get(monthlyDirectionFocusId(month)),
    );
    return stored === undefined ? null : MonthlyDirectionFocusRecordMapper.fromRecord(stored);
  }

  public async findLatestBefore(month: string): Promise<MonthlyDirectionFocus | null> {
    monthlyDirectionFocusId(month);
    const database = await this.database.open();
    const stored = await request<unknown[]>(
      database
        .transaction(LIFE_OS_STORE.monthlyDirectionFocuses)
        .objectStore(LIFE_OS_STORE.monthlyDirectionFocuses)
        .getAll(),
    );
    return (
      stored
        .map(MonthlyDirectionFocusRecordMapper.fromRecord)
        .filter((record) => record.month < month)
        .sort((left, right) => right.month.localeCompare(left.month))[0] ?? null
    );
  }

  public async change(
    month: string,
    change: (current: MonthlyDirectionFocus | null) => MonthlyDirectionFocus,
  ): Promise<MonthlyDirectionFocus> {
    const database = await this.database.open();
    const transaction = database.transaction(LIFE_OS_STORE.monthlyDirectionFocuses, 'readwrite');
    const completion = completed(transaction);
    void completion.catch(() => undefined);
    try {
      const store = transaction.objectStore(LIFE_OS_STORE.monthlyDirectionFocuses);
      const stored = await request<unknown>(store.get(monthlyDirectionFocusId(month)));
      const current =
        stored === undefined ? null : MonthlyDirectionFocusRecordMapper.fromRecord(stored);
      const next = MonthlyDirectionFocusRecordMapper.toRecord(change(current));
      if (next.month !== month) throw new Error('Изменение относится к другому месяцу.');
      if (next !== current) await request(store.put(next));
      await completion;
      return next;
    } catch (error: unknown) {
      try {
        transaction.abort();
      } catch {
        /* Transaction already settled. */
      }
      await completion.catch(() => undefined);
      throw error;
    }
  }
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.addEventListener('success', () => resolve(value.result));
    value.addEventListener('error', () => reject(value.error));
  });
}

function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve());
    transaction.addEventListener('abort', () =>
      reject(transaction.error ?? new Error('Не удалось сохранить главное направление месяца.')),
    );
  });
}
