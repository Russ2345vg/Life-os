import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { IndexedDbAnalyticsSnapshotReader } from './IndexedDbAnalyticsSnapshotReader';

describe('IndexedDbAnalyticsSnapshotReader', () => {
  it('loads all analytics sources from one readonly transaction without writing', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const raw = await database.open();
    const transaction = vi.spyOn(raw, 'transaction');
    const reader = new IndexedDbAnalyticsSnapshotReader(database);
    const result = await reader.read();
    expect(result).toMatchObject({
      actions: [],
      sessions: [],
      goals: [],
      diary: [],
      walks: [],
      memory: [],
      sleep: null,
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0]?.[1]).toBe('readonly');
    expect([...(transaction.mock.calls[0]![0] as string[])]).toContain('lifeActions');
    transaction.mockRestore();
    database.close();
  });
});
