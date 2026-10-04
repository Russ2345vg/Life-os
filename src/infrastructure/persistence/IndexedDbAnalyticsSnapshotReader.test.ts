import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { IndexedDbAnalyticsSnapshotReader } from './IndexedDbAnalyticsSnapshotReader';
import { IndexedDbSleepObservationRepository } from './IndexedDbSleepObservationRepository';
import { confirmSleepObservation } from '../../domain/sleep/SleepObservation';

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
      sleepObservations: [],
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0]?.[1]).toBe('readonly');
    expect([...(transaction.mock.calls[0]![0] as string[])]).toContain('lifeActions');
    transaction.mockRestore();
    database.close();
  });

  it('reads sleep observations consistently and notifies subscribers on their commits', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const observations = new IndexedDbSleepObservationRepository(database);
    const reader = new IndexedDbAnalyticsSnapshotReader(database);
    const changed = vi.fn();
    const unsubscribe = reader.subscribe(changed);
    await observations.save(
      confirmSleepObservation(null, {
        id: 'sleep-observation:2026-10-03',
        cycleDate: '2026-10-03',
        nightCycleId: 'night-1',
        wentToBedAt: new Date('2026-10-03T14:30:00.000Z'),
        wokeAt: new Date('2026-10-04T00:00:00.000Z'),
        timeZone: 'Asia/Chita',
        confirmedAt: new Date('2026-10-04T00:05:00.000Z'),
      }),
    );

    const snapshot = await reader.read();

    expect(snapshot.sleepObservations).toHaveLength(1);
    expect(snapshot.sleepObservations[0]).toMatchObject({ cycleDate: '2026-10-03' });
    expect(changed).toHaveBeenCalledTimes(1);
    unsubscribe();
    database.close();
  });
});
