import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { LIFE_OS_DATABASE_NAME, LifeOsIndexedDb } from '../persistence/indexed-db/LifeOsIndexedDb';
import { IndexedDbAccountLocalData } from './IndexedDbAccountLocalData';

describe('IndexedDbAccountLocalData', () => {
  it('deletes only LifeOS data and its allowlisted meaningful local setting', async () => {
    const indexedDb = new IDBFactory();
    const database = new LifeOsIndexedDb(indexedDb);
    const opened = await database.open();
    const write = opened.transaction('spheres', 'readwrite');
    write.objectStore('spheres').put({ id: 'sphere-1', name: 'Health' });
    await complete(write);
    const values = new Map([
      ['lifeos.local-settings.v1', '{"eveningRitual":{}}'],
      ['unrelated.application', 'keep-me'],
    ]);
    const localStorage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
      clear: vi.fn(() => values.clear()),
    };
    const purge = new IndexedDbAccountLocalData(database, indexedDb, localStorage);

    await purge.purge();
    await purge.purge();

    expect(localStorage.removeItem).toHaveBeenCalledWith('lifeos.local-settings.v1');
    expect(localStorage.clear).not.toHaveBeenCalled();
    expect(values.get('unrelated.application')).toBe('keep-me');
    const clean = await database.open();
    expect(clean.name).toBe(LIFE_OS_DATABASE_NAME);
    const read = clean.transaction('spheres', 'readonly');
    await expect(request(read.objectStore('spheres').count())).resolves.toBe(0);
  });
});

function complete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener('error', () => reject(transaction.error), { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error), { once: true });
  });
}

function request<T>(input: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    input.addEventListener('success', () => resolve(input.result), { once: true });
    input.addEventListener('error', () => reject(input.error), { once: true });
  });
}
