import { DomainError } from '../../../shared/errors/DomainError';

export const LIFE_OS_DATABASE_NAME = 'lifeos';
export const LIFE_OS_DATABASE_VERSION = 17;

export const LIFE_OS_STORE = {
  days: 'days',
  decisions: 'decisions',
  lifeActions: 'lifeActions',
  actionSessions: 'actionSessions',
  routineBlocks: 'routineBlocks',
  routineOccurrenceOverrides: 'routineOccurrenceOverrides',
  routineOccurrenceExecutions: 'routineOccurrenceExecutions',
  walks: 'walks',
  spheres: 'spheres',
  journal: 'journal',
  directions: 'directions',
  projects: 'projects',
  eveningCycles: 'eveningCycles',
  tomorrowPlans: 'tomorrowPlans',
  preparationPlans: 'preparationPlans',
  preparationRules: 'preparationRules',
  recommendationApplications: 'recommendationApplications',
  morningCycles: 'morningCycles',
  goals: 'goals',
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

      request.addEventListener('upgradeneeded', (event) => {
        try {
          const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
          if (oldVersion < 1) createVersionOneSchema(request.result);
          if (oldVersion < 2) createVersionTwoSchema(request.result);
          if (oldVersion < 3) createVersionThreeSchema(request.result);
          if (oldVersion < 4) createVersionFourSchema(request.result);
          if (oldVersion < 5) createVersionFiveSchema(request.result);
          if (oldVersion < 6) createVersionSixSchema(request.transaction);
          if (oldVersion < 7) createVersionSevenSchema(request.result);
          if (oldVersion < 8) createVersionEightSchema(request.result);
          if (oldVersion < 9) createVersionNineSchema(request.result);
          if (oldVersion < 10) createVersionTenSchema(request.transaction);
          if (oldVersion < 11) createVersionElevenSchema(request.result);
          if (oldVersion < 12) createVersionTwelveSchema(request.result);
          if (oldVersion < 13) createVersionThirteenSchema(request.result);
          if (oldVersion < 14) createVersionFourteenSchema(request.result);
          if (oldVersion < 15) createVersionFifteenSchema(request.result);
          if (oldVersion < 16) createVersionSixteenSchema(request.result);
          if (oldVersion < 17) createVersionSeventeenSchema(request.transaction);
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

function createVersionSeventeenSchema(transaction: IDBTransaction | null): void {
  if (transaction === null) {
    throw new Error('Транзакция обновления IndexedDB недоступна.');
  }
  transaction
    .objectStore(LIFE_OS_STORE.goals)
    .createIndex('byDirectionId', 'directionId', { unique: false });
}

function createVersionSixteenSchema(database: IDBDatabase): void {
  const goals = database.createObjectStore(LIFE_OS_STORE.goals, { keyPath: 'id' });
  goals.createIndex('byStatus', 'status', { unique: false });
}

function createVersionFifteenSchema(database: IDBDatabase): void {
  const cycles = database.createObjectStore(LIFE_OS_STORE.morningCycles, { keyPath: 'id' });
  cycles.createIndex('byDayId', 'dayId', { unique: true });
  cycles.createIndex('byDateKey', 'dateKey', { unique: true });
}

function createVersionFourteenSchema(database: IDBDatabase): void {
  const applications = database.createObjectStore(LIFE_OS_STORE.recommendationApplications, {
    keyPath: 'id',
  });
  applications.createIndex('byStatus', 'status', { unique: false });
}

function createVersionThirteenSchema(database: IDBDatabase): void {
  const plans = database.createObjectStore(LIFE_OS_STORE.preparationPlans, { keyPath: 'id' });
  plans.createIndex('byCycleId', 'cycleId', { unique: true });
  plans.createIndex('byTomorrowPlanId', 'tomorrowPlanId', { unique: true });
  plans.createIndex('byTargetDayId', 'targetDayId', { unique: true });
  plans.createIndex('byStatus', 'status', { unique: false });
  database.createObjectStore(LIFE_OS_STORE.preparationRules, { keyPath: 'id' });
}

function createVersionTwelveSchema(database: IDBDatabase): void {
  const plans = database.createObjectStore(LIFE_OS_STORE.tomorrowPlans, { keyPath: 'id' });
  plans.createIndex('byCycleId', 'cycleId', { unique: true });
  plans.createIndex('byTargetDateKey', 'targetDateKey', { unique: true });
  plans.createIndex('byStatus', 'status', { unique: false });
}

function createVersionElevenSchema(database: IDBDatabase): void {
  const cycles = database.createObjectStore(LIFE_OS_STORE.eveningCycles, { keyPath: 'id' });
  cycles.createIndex('byDayId', 'dayId', { unique: true });
  cycles.createIndex('byDateKey', 'dateKey', { unique: true });
  cycles.createIndex('byState', 'state', { unique: false });
}

function createVersionTenSchema(transaction: IDBTransaction | null): void {
  if (transaction === null) {
    throw new Error('Транзакция обновления IndexedDB недоступна.');
  }
  transaction
    .objectStore(LIFE_OS_STORE.decisions)
    .createIndex('byProjectId', 'projectId', { unique: false });
}

function createVersionNineSchema(database: IDBDatabase): void {
  const directions = database.createObjectStore(LIFE_OS_STORE.directions, { keyPath: 'id' });
  directions.createIndex('bySphereId', 'sphereId', { unique: false });
  directions.createIndex('byStatus', 'status', { unique: false });

  const projects = database.createObjectStore(LIFE_OS_STORE.projects, { keyPath: 'id' });
  projects.createIndex('bySphereId', 'sphereId', { unique: false });
  projects.createIndex('byDirectionId', 'directionId', { unique: false });
  projects.createIndex('byStatus', 'status', { unique: false });
}

function createVersionEightSchema(database: IDBDatabase): void {
  const journal = database.createObjectStore(LIFE_OS_STORE.journal, { keyPath: 'id' });
  journal.createIndex('byEffectiveDate', 'effectiveDate', { unique: false });
  journal.createIndex('byOccurredAt', 'occurredAt', { unique: false });
  journal.createIndex('bySubjectId', 'subjectId', { unique: false });
  journal.createIndex('bySphereId', 'sphereId', { unique: false });
}

function createVersionSevenSchema(database: IDBDatabase): void {
  const spheres = database.createObjectStore(LIFE_OS_STORE.spheres, { keyPath: 'id' });
  spheres.createIndex('byNormalizedName', 'normalizedName', { unique: true });
  spheres.createIndex('byStatus', 'status', { unique: false });
}

function createVersionFiveSchema(database: IDBDatabase): void {
  const walks = database.createObjectStore(LIFE_OS_STORE.walks, { keyPath: 'id' });
  walks.createIndex('byDate', 'date', { unique: false });
}

function createVersionSixSchema(transaction: IDBTransaction | null): void {
  if (transaction === null) {
    throw new Error('Транзакция обновления IndexedDB недоступна.');
  }
  transaction.objectStore(LIFE_OS_STORE.walks).createIndex('byStatus', 'status', { unique: false });
}

function createVersionFourSchema(database: IDBDatabase): void {
  const executions = database.createObjectStore(LIFE_OS_STORE.routineOccurrenceExecutions, {
    keyPath: 'id',
  });
  executions.createIndex('byOccurrence', 'occurrenceKey', { unique: true });
  executions.createIndex('byStatus', 'status', { unique: false });
}

function createVersionThreeSchema(database: IDBDatabase): void {
  const overrides = database.createObjectStore(LIFE_OS_STORE.routineOccurrenceOverrides, {
    keyPath: 'id',
  });
  overrides.createIndex('byOccurrence', 'occurrenceKey', { unique: true });
  overrides.createIndex('byTargetDate', 'targetDate', { unique: false });
}

function createVersionTwoSchema(database: IDBDatabase): void {
  const routineBlocks = database.createObjectStore(LIFE_OS_STORE.routineBlocks, { keyPath: 'id' });
  routineBlocks.createIndex('byAnchorDate', 'anchorDate', { unique: false });
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
