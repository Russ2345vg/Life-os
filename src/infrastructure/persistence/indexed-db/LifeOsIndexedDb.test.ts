import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { executeIndexedDbRequest } from './IndexedDbRequest';
import {
  LIFE_OS_DATABASE_NAME,
  LIFE_OS_DATABASE_VERSION,
  LIFE_OS_STORE,
  LifeOsIndexedDb,
} from './LifeOsIndexedDb';

describe('LifeOsIndexedDb', () => {
  it('создаёт базу версии 1 и четыре object store с ключом id', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());

    const database = await indexedDb.open();

    expect(database.name).toBe(LIFE_OS_DATABASE_NAME);
    expect(database.version).toBe(LIFE_OS_DATABASE_VERSION);
    expect([...database.objectStoreNames]).toEqual([
      LIFE_OS_STORE.actionSessions,
      LIFE_OS_STORE.days,
      LIFE_OS_STORE.decisions,
      LIFE_OS_STORE.lifeActions,
      LIFE_OS_STORE.routineBlocks,
      LIFE_OS_STORE.routineOccurrenceExecutions,
      LIFE_OS_STORE.routineOccurrenceOverrides,
    ]);

    const transaction = database.transaction(Object.values(LIFE_OS_STORE), 'readonly');
    for (const storeName of Object.values(LIFE_OS_STORE)) {
      expect(transaction.objectStore(storeName).keyPath).toBe('id');
    }

    indexedDb.close();
  });

  it('создаёт минимальные индексы с заданной уникальностью', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();
    const transaction = database.transaction(Object.values(LIFE_OS_STORE), 'readonly');

    expect(indexesOf(transaction.objectStore(LIFE_OS_STORE.days))).toEqual({
      byDate: true,
    });
    expect(indexesOf(transaction.objectStore(LIFE_OS_STORE.decisions))).toEqual({
      byPlannedDate: false,
    });
    expect(indexesOf(transaction.objectStore(LIFE_OS_STORE.lifeActions))).toEqual({
      byDecisionId: false,
      byPlannedDate: false,
    });
    expect(indexesOf(transaction.objectStore(LIFE_OS_STORE.actionSessions))).toEqual({
      byLifeActionId: false,
      byStatus: false,
    });
    expect(indexesOf(transaction.objectStore(LIFE_OS_STORE.routineBlocks))).toEqual({
      byAnchorDate: false,
    });
    expect(indexesOf(transaction.objectStore(LIFE_OS_STORE.routineOccurrenceOverrides))).toEqual({
      byOccurrence: true,
      byTargetDate: false,
    });
    expect(indexesOf(transaction.objectStore(LIFE_OS_STORE.routineOccurrenceExecutions))).toEqual({
      byOccurrence: true,
      byStatus: false,
    });

    indexedDb.close();
  });

  it('сохраняет записи с null в необязательных индексируемых полях', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();

    await executeIndexedDbRequest(database, LIFE_OS_STORE.decisions, 'readwrite', (store) =>
      store.put({ id: 'decision-draft', plannedDate: null }),
    );
    await executeIndexedDbRequest(database, LIFE_OS_STORE.lifeActions, 'readwrite', (store) =>
      store.put({ id: 'action-draft', plannedDate: null, decisionId: null }),
    );

    await expect(
      executeIndexedDbRequest(database, LIFE_OS_STORE.decisions, 'readonly', (store) =>
        store.get('decision-draft'),
      ),
    ).resolves.toMatchObject({ id: 'decision-draft' });
    await expect(
      executeIndexedDbRequest(database, LIFE_OS_STORE.lifeActions, 'readonly', (store) =>
        store.get('action-draft'),
      ),
    ).resolves.toMatchObject({ id: 'action-draft' });

    indexedDb.close();
  });

  it('повторно открывает существующую базу после явного закрытия подключения', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const firstConnection = await indexedDb.open();

    indexedDb.close();
    const secondConnection = await indexedDb.open();

    expect(secondConnection).not.toBe(firstConnection);
    expect([...secondConnection.objectStoreNames]).toHaveLength(7);
    indexedDb.close();
  });

  it('возвращает контролируемую ошибку, если IndexedDB недоступна', async () => {
    const indexedDb = new LifeOsIndexedDb(null);

    await expect(indexedDb.open()).rejects.toMatchObject({
      code: 'persistence.database_open_failed',
    });
  });

  it('возвращает контролируемую ошибку при невозможности начать транзакцию', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const closedConnection = await indexedDb.open();
    indexedDb.close();

    await expect(
      executeIndexedDbRequest(closedConnection, LIFE_OS_STORE.days, 'readonly', (store) =>
        store.get('day-1'),
      ),
    ).rejects.toMatchObject({ code: 'persistence.transaction_failed' });
  });
  it('migrates a version 1 database without losing existing records', async () => {
    const factory = new IDBFactory();
    const legacy = await openLegacyDatabase(factory);
    const transaction = legacy.transaction(LIFE_OS_STORE.days, 'readwrite');
    transaction.objectStore(LIFE_OS_STORE.days).put({ id: 'day-legacy', date: '2026-08-01' });
    await transactionDone(transaction);
    legacy.close();

    const indexedDb = new LifeOsIndexedDb(factory);
    const upgraded = await indexedDb.open();
    const restored = await executeIndexedDbRequest(
      upgraded,
      LIFE_OS_STORE.days,
      'readonly',
      (store) => store.get('day-legacy'),
    );

    expect(upgraded.version).toBe(4);
    expect([...upgraded.objectStoreNames]).toContain(LIFE_OS_STORE.routineBlocks);
    expect([...upgraded.objectStoreNames]).toContain(LIFE_OS_STORE.routineOccurrenceOverrides);
    expect([...upgraded.objectStoreNames]).toContain(LIFE_OS_STORE.routineOccurrenceExecutions);
    expect(restored).toMatchObject({ id: 'day-legacy', date: '2026-08-01' });
    indexedDb.close();
  });

  it('migrates the stage 13.2 database without losing routine blocks', async () => {
    const factory = new IDBFactory();
    const legacy = await openStage132Database(factory);
    const transaction = legacy.transaction(LIFE_OS_STORE.routineBlocks, 'readwrite');
    transaction.objectStore(LIFE_OS_STORE.routineBlocks).put({
      schemaVersion: 1,
      id: 'routine-13-2',
      anchorDate: '2026-08-08',
      title: 'Старый блок',
      startTime: '08:00',
      endTime: '09:00',
      category: 'work',
      recurrence: 'daily',
      selectedWeekdays: [],
      required: true,
      assignment: 'reminder',
      createdAt: '2026-08-08T00:00:00.000Z',
      updatedAt: '2026-08-08T00:00:00.000Z',
      version: 1,
    });
    await transactionDone(transaction);
    legacy.close();

    const indexedDb = new LifeOsIndexedDb(factory);
    const upgraded = await indexedDb.open();
    const restored = await executeIndexedDbRequest(
      upgraded,
      LIFE_OS_STORE.routineBlocks,
      'readonly',
      (store) => store.get('routine-13-2'),
    );
    expect(upgraded.version).toBe(4);
    expect(restored).toMatchObject({ id: 'routine-13-2', title: 'Старый блок' });
    expect([...upgraded.objectStoreNames]).toContain(LIFE_OS_STORE.routineOccurrenceOverrides);
    expect([...upgraded.objectStoreNames]).toContain(LIFE_OS_STORE.routineOccurrenceExecutions);
    indexedDb.close();
  });

  it('migrates the stage 13.3 database without losing occurrence overrides', async () => {
    const factory = new IDBFactory();
    const legacy = await openStage133Database(factory);
    const transaction = legacy.transaction(LIFE_OS_STORE.routineOccurrenceOverrides, 'readwrite');
    transaction.objectStore(LIFE_OS_STORE.routineOccurrenceOverrides).put({
      id: 'override-13-3',
      occurrenceKey: 'routine-1\u00002026-08-08',
      routineBlockId: 'routine-1',
      occurrenceDate: '2026-08-08',
      type: 'skipped',
    });
    await transactionDone(transaction);
    legacy.close();

    const indexedDb = new LifeOsIndexedDb(factory);
    const upgraded = await indexedDb.open();
    const restored = await executeIndexedDbRequest(
      upgraded,
      LIFE_OS_STORE.routineOccurrenceOverrides,
      'readonly',
      (store) => store.get('override-13-3'),
    );
    expect(upgraded.version).toBe(4);
    expect(restored).toMatchObject({ id: 'override-13-3', type: 'skipped' });
    expect([...upgraded.objectStoreNames]).toContain(LIFE_OS_STORE.routineOccurrenceExecutions);
    indexedDb.close();
  });
});

function openLegacyDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(LIFE_OS_DATABASE_NAME, 1);
    request.addEventListener('upgradeneeded', () => {
      request.result.createObjectStore(LIFE_OS_STORE.days, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.decisions, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.lifeActions, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.actionSessions, { keyPath: 'id' });
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

function openStage132Database(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(LIFE_OS_DATABASE_NAME, 2);
    request.addEventListener('upgradeneeded', () => {
      request.result.createObjectStore(LIFE_OS_STORE.days, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.decisions, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.lifeActions, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.actionSessions, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.routineBlocks, { keyPath: 'id' });
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

function openStage133Database(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(LIFE_OS_DATABASE_NAME, 3);
    request.addEventListener('upgradeneeded', () => {
      request.result.createObjectStore(LIFE_OS_STORE.days, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.decisions, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.lifeActions, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.actionSessions, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.routineBlocks, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.routineOccurrenceOverrides, {
        keyPath: 'id',
      });
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve());
    transaction.addEventListener('error', () => reject(transaction.error));
  });
}

function indexesOf(store: IDBObjectStore): Readonly<Record<string, boolean>> {
  return Object.fromEntries(
    [...store.indexNames].map((indexName) => [indexName, store.index(indexName).unique]),
  );
}
