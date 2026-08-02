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
    expect([...secondConnection.objectStoreNames]).toHaveLength(4);
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
});

function indexesOf(store: IDBObjectStore): Readonly<Record<string, boolean>> {
  return Object.fromEntries(
    [...store.indexNames].map((indexName) => [indexName, store.index(indexName).unique]),
  );
}
