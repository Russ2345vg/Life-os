import { DomainError } from '../../../shared/errors/DomainError';

export const LIFE_OS_DATABASE_NAME = 'lifeos';
export const LIFE_OS_DATABASE_VERSION = 1;

export const LIFE_OS_STORE = {
  days: 'days',
  decisions: 'decisions',
  lifeActions: 'lifeActions',
  actionSessions: 'actionSessions',
} as const;

export class LifeOsIndexedDb {
  readonly #indexedDb: IDBFactory | undefined;
  #database: IDBDatabase | null = null;
  #opening: Promise<IDBDatabase> | null = null;

  public constructor(indexedDb: IDBFactory | null | undefined = globalThis.indexedDB) {
    this.#indexedDb = indexedDb ?? undefined;
  }

  public async open(): Promise<IDBDatabase> {
    if (this.#database !== null) {
      return this.#database;
    }

    if (this.#opening !== null) {
      return this.#opening;
    }

    const opening = this.openDatabase();
    this.#opening = opening;

    try {
      const database = await opening;
      this.#database = database;
      return database;
    } finally {
      this.#opening = null;
    }
  }

  public close(): void {
    this.#database?.close();
    this.#database = null;
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (this.#indexedDb === undefined) {
      return Promise.reject(
        new DomainError('persistence.database_open_failed', 'Браузер не поддерживает IndexedDB.'),
      );
    }

    return new Promise((resolve, reject) => {
      let request: IDBOpenDBRequest;
      let settled = false;
      let upgradeError: unknown;

      try {
        request = this.#indexedDb!.open(LIFE_OS_DATABASE_NAME, LIFE_OS_DATABASE_VERSION);
      } catch (error: unknown) {
        reject(databaseOpenFailed(error));
        return;
      }

      request.addEventListener('upgradeneeded', () => {
        try {
          createVersionOneSchema(request.result);
        } catch (error: unknown) {
          upgradeError = error;
          request.transaction?.abort();
        }
      });

      request.addEventListener('success', () => {
        if (settled) {
          request.result.close();
          return;
        }

        settled = true;
        const database = request.result;
        database.addEventListener('versionchange', () => {
          database.close();
          if (this.#database === database) {
            this.#database = null;
          }
        });
        resolve(database);
      });

      request.addEventListener('error', () => {
        if (!settled) {
          settled = true;
          reject(databaseOpenFailed(upgradeError ?? request.error));
        }
      });

      request.addEventListener('blocked', () => {
        if (!settled) {
          settled = true;
          reject(
            databaseOpenFailed(new Error('Открытие IndexedDB заблокировано другим подключением.')),
          );
        }
      });
    });
  }
}

function createVersionOneSchema(database: IDBDatabase): void {
  const days = database.createObjectStore(LIFE_OS_STORE.days, { keyPath: 'id' });
  days.createIndex('byDate', 'date', { unique: true });

  const decisions = database.createObjectStore(LIFE_OS_STORE.decisions, { keyPath: 'id' });
  decisions.createIndex('byPlannedDate', 'plannedDate', { unique: false });

  const lifeActions = database.createObjectStore(LIFE_OS_STORE.lifeActions, { keyPath: 'id' });
  lifeActions.createIndex('byPlannedDate', 'plannedDate', { unique: false });
  lifeActions.createIndex('byDecisionId', 'decisionId', { unique: false });

  const actionSessions = database.createObjectStore(LIFE_OS_STORE.actionSessions, {
    keyPath: 'id',
  });
  actionSessions.createIndex('byLifeActionId', 'lifeActionId', { unique: false });
  actionSessions.createIndex('byStatus', 'status', { unique: false });
}

function databaseOpenFailed(error: unknown): DomainError {
  return new DomainError(
    'persistence.database_open_failed',
    'Не удалось открыть базу данных IndexedDB.',
    { cause: error },
  );
}
