import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DayDate, EVENING_CYCLE_COMPLETION, EVENING_CYCLE_MODE } from '../../domain';
import { EVENING_HISTORY_RANGE_KIND, GetEveningHistory } from '../../application';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { IndexedDbEveningHistoryReader } from './IndexedDbEveningHistoryReader';

describe('IndexedDbEveningHistoryReader recovery', () => {
  it('восстанавливает старую запись SKIPPED без новых optional-полей', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const opened = await database.open();
    const transaction = opened.transaction(LIFE_OS_STORE.eveningCycles, 'readwrite');
    await observeRequest(
      transaction.objectStore(LIFE_OS_STORE.eveningCycles).add({
        schemaVersion: 1,
        id: 'legacy-cycle',
        dayId: 'legacy-day',
        dateKey: '2026-08-01',
        state: 'COMPLETED',
        mode: 'SKIPPED',
        startedAt: null,
        updatedAt: '2026-08-01T23:30:00.000Z',
        completedAt: '2026-08-01T23:30:00.000Z',
        decisionIds: [],
        lifeActionIds: [],
        version: 2,
      }),
    );
    await observeTransaction(transaction);

    const result = await new GetEveningHistory(new IndexedDbEveningHistoryReader(database)).execute(
      {
        kind: EVENING_HISTORY_RANGE_KIND.custom,
        startDate: DayDate.create('2026-08-01'),
        endDate: DayDate.create('2026-08-01'),
      },
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      cycleId: 'legacy-cycle',
      completion: EVENING_CYCLE_COMPLETION.skipped,
      mode: EVENING_CYCLE_MODE.normal,
      reflectionAnswerCount: 0,
      hasTomorrowPlan: false,
      preparationState: 'NOT_CREATED',
      skippedStages: [],
    });
    database.close();
  });

  it('стабильно перечитывает 365 циклов без дублей и N+1 repository-вызовов', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const opened = await database.open();
    const transaction = opened.transaction(LIFE_OS_STORE.eveningCycles, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_STORE.eveningCycles);
    await Promise.all(
      Array.from({ length: 365 }, (_, index) => {
        const dateKey = dateBefore('2026-12-31', index);
        return observeRequest(
          store.add({
            schemaVersion: 1,
            id: `cycle-${index}`,
            dayId: `day-${index}`,
            dateKey,
            state: 'COMPLETED',
            mode: 'NORMAL',
            completion: 'COMPLETED',
            startedAt: `${dateKey}T20:00:00.000Z`,
            updatedAt: `${dateKey}T21:00:00.000Z`,
            completedAt: `${dateKey}T21:00:00.000Z`,
            decisionIds: [],
            lifeActionIds: [],
            reflectionQuestions: [],
            reflectionResults: [],
            reflectionSignals: [],
            version: 1,
          }),
        );
      }),
    );
    await observeTransaction(transaction);
    const query = new GetEveningHistory(new IndexedDbEveningHistoryReader(database));
    const range = {
      kind: EVENING_HISTORY_RANGE_KIND.custom,
      startDate: DayDate.create('2026-01-01'),
      endDate: DayDate.create('2026-12-31'),
    } as const;

    const reads = await Promise.all(Array.from({ length: 10 }, () => query.execute(range)));

    expect(reads.every((result) => result.items.length === 365)).toBe(true);
    expect(new Set(reads[0]!.items.map((item) => item.cycleId)).size).toBe(365);
    database.close();
  });
});

function dateBefore(endDate: string, offset: number): string {
  const date = new Date(`${endDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
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
    transaction.addEventListener('error', () => reject(transaction.error));
    transaction.addEventListener('abort', () => reject(transaction.error));
  });
}
