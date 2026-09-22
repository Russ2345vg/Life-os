import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  SLEEP_SCHEDULE_ID,
  ensureNightCycle,
  type SleepScheduleState,
} from '../../domain/sleep/SleepSchedule';
import { IndexedDbSleepScheduleRepository } from './IndexedDbSleepScheduleRepository';
import {
  LIFE_OS_DATABASE_NAME,
  LIFE_OS_DATABASE_VERSION,
  LIFE_OS_STORE,
  LifeOsIndexedDb,
} from './indexed-db/LifeOsIndexedDb';

describe('Sleep schedule persistence migration', () => {
  it('adds only the sleep store when upgrading v25 and preserves planner data byte-for-byte', async () => {
    const factory = new IDBFactory();
    const legacyRecord = {
      id: 'legacy-idea',
      title: 'Сохранённая идея',
      metadata: { source: 'v25', order: [3, 1, 2] },
    };
    const legacy = await openVersion25(factory, legacyRecord);
    expect(Array.from(legacy.objectStoreNames)).toEqual(['inboxIdeas']);
    legacy.close();

    const database = new LifeOsIndexedDb(factory);
    const upgraded = await database.open();

    expect(upgraded.version).toBe(LIFE_OS_DATABASE_VERSION);
    expect(Array.from(upgraded.objectStoreNames)).toEqual(['inboxIdeas', 'sleepSchedules']);
    await expect(
      observeRequest(
        upgraded.transaction('inboxIdeas').objectStore('inboxIdeas').get('legacy-idea'),
      ),
    ).resolves.toEqual(legacyRecord);
    expect(
      upgraded.transaction(LIFE_OS_STORE.sleepSchedules).objectStore(LIFE_OS_STORE.sleepSchedules)
        .keyPath,
    ).toBe('id');
    database.close();
  });

  it('round-trips the full aggregate and repeated saves keep one record', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbSleepScheduleRepository(database);
    const state = fullState();

    await repository.save(state);
    await repository.save(state);

    await expect(repository.load()).resolves.toEqual(state);
    const opened = await database.open();
    await expect(
      observeRequest(
        opened
          .transaction(LIFE_OS_STORE.sleepSchedules)
          .objectStore(LIFE_OS_STORE.sleepSchedules)
          .count(),
      ),
    ).resolves.toBe(1);
    database.close();
  });

  it('reads a stage 1 record without catalog and completion fields using safe defaults', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const opened = await database.open();
    const transaction = opened.transaction(LIFE_OS_STORE.sleepSchedules, 'readwrite');
    transaction.objectStore(LIFE_OS_STORE.sleepSchedules).put({
      schemaVersion: 1,
      id: SLEEP_SCHEDULE_ID,
      version: 1,
      settings: null,
      nightCycles: [],
      wakeOccurrences: [],
      alarmExceptions: [],
    });
    await observeTransaction(transaction);

    const restored = await new IndexedDbSleepScheduleRepository(database).load();

    expect(restored?.preparationGroups.map(({ title }) => title)).toEqual([
      'Комната',
      'Утро',
      'Личное',
    ]);
    expect(restored?.preparationItems).toHaveLength(4);
    database.close();
  });

  it('serializes concurrent aggregate updates without losing a night cycle', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbSleepScheduleRepository(database);
    await repository.save({ ...fullState(), nightCycles: [] });

    await Promise.all([
      repository.update(
        (current) =>
          ensureNightCycle(current!, {
            cycleDate: '2026-09-20',
            preparationItems: [],
            cycleId: 'night-1',
            createdAt: new Date('2026-09-20T12:00:00.000Z'),
          }).state,
      ),
      repository.update(
        (current) =>
          ensureNightCycle(current!, {
            cycleDate: '2026-09-21',
            preparationItems: [],
            cycleId: 'night-2',
            createdAt: new Date('2026-09-20T12:00:00.000Z'),
          }).state,
      ),
    ]);

    expect((await repository.load())?.nightCycles.map(({ cycleDate }) => cycleDate).sort()).toEqual(
      ['2026-09-20', '2026-09-21'],
    );
    database.close();
  });
});

function fullState(): SleepScheduleState {
  return {
    id: SLEEP_SCHEDULE_ID,
    version: 4,
    settings: {
      bedtime: '22:00',
      wakeTime: '07:00',
      timeZone: 'Asia/Chita',
      enabled: true,
      alarmSound: { uri: 'content://alarm/2', title: 'Morning' },
      version: 2,
      updatedAt: new Date('2026-09-20T12:00:00.000Z'),
    },
    preparationGroups: [
      { id: 'room', title: 'Комната', position: 0 },
      { id: 'morning', title: 'Утро', position: 1 },
      { id: 'personal', title: 'Личное', position: 2 },
    ],
    preparationItems: [
      {
        id: 'base-room-air',
        groupId: 'room',
        title: 'Проветрить комнату',
        position: 0,
        kind: 'BASE',
        enabled: true,
      },
    ],
    nightCycles: [
      {
        id: 'night-1',
        cycleDate: '2026-09-20',
        plannedSleepAt: new Date('2026-09-20T13:00:00.000Z'),
        plannedWakeAt: new Date('2026-09-20T22:00:00.000Z'),
        preparationItems: [
          {
            id: 'prepare-1',
            groupId: 'environment',
            groupTitle: 'Среда',
            title: 'Поставить воду',
            position: 0,
            status: 'DONE',
          },
        ],
        preparationCompletionKind: 'ALL_DONE',
        preparationCompletedAt: new Date('2026-09-20T12:15:00.000Z'),
        createdAt: new Date('2026-09-20T12:00:00.000Z'),
      },
    ],
    wakeOccurrences: [
      {
        id: 'wake-1',
        cycleDate: '2026-09-20',
        scheduledAt: new Date('2026-09-20T22:00:00.000Z'),
        status: 'SKIPPED',
        createdAt: new Date('2026-09-20T12:00:00.000Z'),
        updatedAt: new Date('2026-09-20T12:30:00.000Z'),
      },
    ],
    alarmExceptions: [
      {
        id: 'skip-1',
        occurrenceId: 'wake-1',
        kind: 'SKIP_ONCE',
        createdAt: new Date('2026-09-20T12:30:00.000Z'),
      },
    ],
  };
}

function observeTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve());
    transaction.addEventListener('error', () => reject(transaction.error));
    transaction.addEventListener('abort', () => reject(transaction.error));
  });
}

function openVersion25(factory: IDBFactory, legacyRecord: object): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(LIFE_OS_DATABASE_NAME, 25);
    request.addEventListener('upgradeneeded', () => {
      request.result.createObjectStore('inboxIdeas', { keyPath: 'id' }).add(legacyRecord);
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

function observeRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}
