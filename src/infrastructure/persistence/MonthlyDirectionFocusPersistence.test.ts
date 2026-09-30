import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  changeMonthlyDirectionFocus,
  type MonthlyDirectionFocus,
} from '../../domain/planner/MonthlyDirectionFocus';
import { IndexedDbMonthlyDirectionFocusRepository } from './IndexedDbMonthlyDirectionFocusRepository';
import {
  LIFE_OS_DATABASE_NAME,
  LIFE_OS_DATABASE_VERSION,
  LIFE_OS_STORE,
  LifeOsIndexedDb,
} from './indexed-db/LifeOsIndexedDb';
import { MonthlyDirectionFocusRecordMapper } from './mappers/MonthlyDirectionFocusRecordMapper';

const firstChange = new Date('2026-08-01T08:00:00.000Z');
const secondChange = new Date('2026-09-03T09:00:00.000Z');

describe('monthly direction focus persistence', () => {
  it('round-trips month records and returns the latest earlier month', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbMonthlyDirectionFocusRepository(database);

    const august = await repository.change('2026-08', (current) =>
      changeMonthlyDirectionFocus(current, '2026-08', 'health', firstChange),
    );
    const september = await repository.change('2026-09', (current) =>
      changeMonthlyDirectionFocus(current, '2026-09', 'work', secondChange),
    );

    expect(await repository.findByMonth('2026-08')).toEqual(august);
    expect(await repository.findLatestBefore('2026-10')).toEqual(september);
    expect(await repository.findLatestBefore('2026-08')).toBeNull();
    database.close();
  });

  it('applies consecutive changes against the latest stored version', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbMonthlyDirectionFocusRepository(database);
    await repository.change('2026-09', (current) =>
      changeMonthlyDirectionFocus(current, '2026-09', 'work', firstChange),
    );

    const changed = await repository.change('2026-09', (current) => {
      expect(current?.version).toBe(1);
      return changeMonthlyDirectionFocus(current, '2026-09', null, secondChange);
    });

    expect(changed).toMatchObject({ directionId: null, version: 2 });
    database.close();
  });

  it('validates mapper identity instead of accepting a mismatched month', () => {
    const value: MonthlyDirectionFocus = {
      id: 'monthly-direction-focus:2026-09',
      month: '2026-09',
      directionId: 'work',
      updatedAt: secondChange.toISOString(),
      version: 1,
      schemaVersion: 1,
    };
    expect(MonthlyDirectionFocusRecordMapper.fromRecord(value)).toEqual(value);
    expect(() =>
      MonthlyDirectionFocusRecordMapper.fromRecord({ ...value, month: '2026-10' }),
    ).toThrow();
  });

  it('upgrades a v29 database additively and preserves existing records', async () => {
    const factory = new IDBFactory();
    const legacy = await openVersion29(factory);
    const transaction = legacy.transaction('days', 'readwrite');
    transaction.objectStore('days').put({ id: 'kept-day', date: '2026-09-29' });
    await completed(transaction);
    legacy.close();

    const adapter = new LifeOsIndexedDb(factory);
    const upgraded = await adapter.open();

    expect(upgraded.version).toBe(LIFE_OS_DATABASE_VERSION);
    expect(upgraded.objectStoreNames.contains(LIFE_OS_STORE.monthlyDirectionFocuses)).toBe(true);
    expect(await request(upgraded.transaction('days').objectStore('days').get('kept-day'))).toEqual(
      { id: 'kept-day', date: '2026-09-29' },
    );
    adapter.close();
  });
});

function openVersion29(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const opening = factory.open(LIFE_OS_DATABASE_NAME, 29);
    opening.addEventListener('upgradeneeded', () => {
      opening.result.createObjectStore('days', { keyPath: 'id' });
    });
    opening.addEventListener('success', () => resolve(opening.result));
    opening.addEventListener('error', () => reject(opening.error));
  });
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
    transaction.addEventListener('abort', () => reject(transaction.error));
  });
}
