import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  confirmSleepObservation,
  type SleepObservation,
} from '../../domain/sleep/SleepObservation';
import { IndexedDbSleepObservationRepository } from './IndexedDbSleepObservationRepository';
import {
  LIFE_OS_DATABASE_NAME,
  LIFE_OS_DATABASE_VERSION,
  LIFE_OS_STORE,
  LifeOsIndexedDb,
} from './indexed-db/LifeOsIndexedDb';
import { SleepObservationRecordMapper } from './mappers/SleepObservationRecordMapper';

describe('Sleep observation persistence', () => {
  it('round-trips a confirmed observation as schema v1 ISO data', () => {
    const observation = confirmedObservation('2026-10-03');
    const record = SleepObservationRecordMapper.toRecord(observation);

    expect(record).toEqual({
      schemaVersion: 1,
      id: 'sleep-observation:2026-10-03',
      cycleDate: '2026-10-03',
      nightCycleId: 'night-2026-10-03',
      wentToBedAt: '2026-10-03T14:30:00.000Z',
      wokeAt: '2026-10-04T00:00:00.000Z',
      wakeSource: 'MANUAL',
      wakeOccurrenceId: null,
      timeZone: 'Asia/Chita',
      confirmedAt: '2026-10-04T00:05:00.000Z',
      createdAt: '2026-10-04T00:05:00.000Z',
      updatedAt: '2026-10-04T00:05:00.000Z',
    });
    expect(SleepObservationRecordMapper.fromRecord(record)).toEqual(observation);
  });

  it.each([
    { cycleDate: '2026-02-30' },
    { timeZone: 'Mars/Olympus' },
    { wokeAt: 'not-a-date' },
    { wakeSource: 'DELIVERED' },
  ])('rejects a malformed record: %j', (change) => {
    const record = { ...SleepObservationRecordMapper.toRecord(confirmedObservation()), ...change };
    expect(() => SleepObservationRecordMapper.fromRecord(record)).toThrow();
  });

  it('upgrades a version 31 database and preserves the sleep schedule store', async () => {
    const factory = new IDBFactory();
    const legacy = await openLegacy31(factory);
    legacy.close();

    const database = new LifeOsIndexedDb(factory);
    const opened = await database.open();

    expect(opened.version).toBe(LIFE_OS_DATABASE_VERSION);
    expect(opened.objectStoreNames.contains(LIFE_OS_STORE.sleepSchedules)).toBe(true);
    expect(opened.objectStoreNames.contains(LIFE_OS_STORE.sleepObservations)).toBe(true);
    const store = opened
      .transaction(LIFE_OS_STORE.sleepObservations)
      .objectStore(LIFE_OS_STORE.sleepObservations);
    expect(store.keyPath).toBe('id');
    expect(Array.from(store.indexNames)).toEqual(['byCycleDate', 'byUpdatedAt']);
    await expect(
      request(
        opened.transaction('sleepSchedules').objectStore('sleepSchedules').get('sleep-schedule'),
      ),
    ).resolves.toEqual({
      id: 'sleep-schedule',
      schemaVersion: 1,
      version: 7,
    });
    database.close();
  });

  it('saves one observation per cycle and lists a bounded newest-first period', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbSleepObservationRepository(database);
    await repository.save(confirmedObservation('2026-10-01'));
    await repository.save(confirmedObservation('2026-10-03'));
    await repository.save(confirmedObservation('2026-10-02'));
    await repository.save({
      ...confirmedObservation('2026-10-02'),
      wokeAt: new Date('2026-10-03T00:30:00.000Z'),
      updatedAt: new Date('2026-10-03T00:35:00.000Z'),
      confirmedAt: new Date('2026-10-03T00:35:00.000Z'),
    });

    await expect(repository.getByCycleDate('2026-10-02')).resolves.toMatchObject({
      wokeAt: new Date('2026-10-03T00:30:00.000Z'),
    });
    await expect(repository.list({ from: '2026-10-02', to: '2026-10-03' })).resolves.toEqual([
      expect.objectContaining({ cycleDate: '2026-10-03' }),
      expect.objectContaining({ cycleDate: '2026-10-02' }),
    ]);
    database.close();
  });
});

function confirmedObservation(cycleDate = '2026-10-03'): SleepObservation {
  const day = Number(cycleDate.slice(-2));
  return confirmSleepObservation(null, {
    id: `sleep-observation:${cycleDate}`,
    cycleDate,
    nightCycleId: `night-${cycleDate}`,
    wentToBedAt: new Date(Date.UTC(2026, 9, day, 14, 30)),
    wokeAt: new Date(Date.UTC(2026, 9, day + 1, 0, 0)),
    timeZone: 'Asia/Chita',
    confirmedAt: new Date(Date.UTC(2026, 9, day + 1, 0, 5)),
  });
}

function openLegacy31(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const opening = factory.open(LIFE_OS_DATABASE_NAME, 31);
    opening.addEventListener('upgradeneeded', () => {
      const schedule = opening.result.createObjectStore('sleepSchedules', { keyPath: 'id' });
      schedule.put({ id: 'sleep-schedule', schemaVersion: 1, version: 7 });
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
