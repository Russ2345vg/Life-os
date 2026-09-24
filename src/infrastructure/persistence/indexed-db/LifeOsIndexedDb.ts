import {
  GOAL_MIGRATION_BACKUP,
  GOAL_MIGRATION_BINDINGS,
  upgradeLegacyProjects,
  withLegacyGoalIngress,
} from './LegacyProjectGoalMigration';
import { DomainError } from '../../../shared/errors/DomainError';
import {
  EXERCISE_DEFINITION_SOURCE,
  SYSTEM_EXERCISE_DEFINITION_SEEDS,
  normalizeExerciseDefinitionName,
} from '../../../domain';
import type {
  SyncEntityType,
  SyncEntityRegistration,
} from '../../../application/sync/SyncRegistry';

interface IndexedDbSyncMutationRecorder {
  recordUpsert<TRecord extends object>(
    transaction: IDBTransaction,
    entityType: SyncEntityType,
    record: Readonly<TRecord>,
  ): Promise<boolean>;
  recordTombstone(
    transaction: IDBTransaction,
    entityType: SyncEntityType,
    objectId: string,
    previous?: Readonly<Record<string, unknown>>,
  ): Promise<boolean>;
  notifyCommitted(recorded: boolean): void;
}

export const SINGLETON_SYNC_STORES = [
  'days',
  'morningCycles',
  'eveningCycles',
  'tomorrowPlans',
  'preparationPlans',
  'sleepSchedules',
] as const;

interface MutationCaptureConfiguration {
  readonly recorder: IndexedDbSyncMutationRecorder;
  readonly entityTypeByStore: ReadonlyMap<string, SyncEntityType>;
  readonly manuallyCapturedTypes: ReadonlySet<SyncEntityType>;
}

export const LIFE_OS_DATABASE_NAME = 'lifeos';
export const LIFE_OS_DATABASE_VERSION = 27;

export const LIFE_OS_DOMAIN_STORE = {
  directionIndicators: 'directionIndicators',
  balanceMonthlySnapshots: 'balanceMonthlySnapshots',
  planningPeriods: 'planningPeriods',
  periodMemberships: 'periodMemberships',
  periodDecisions: 'periodDecisions',
  contributionLinks: 'contributionLinks',
  progressContributions: 'progressContributions',
  recurrenceRules: 'recurrenceRules',
  days: 'days',
  decisions: 'decisions',
  lifeActions: 'lifeActions',
  actionSessions: 'actionSessions',
  routineBlocks: 'routineBlocks',
  routineOccurrenceOverrides: 'routineOccurrenceOverrides',
  routineOccurrenceExecutions: 'routineOccurrenceExecutions',
  walks: 'walks',
  walkCaptures: 'walkCaptures',
  spheres: 'spheres',
  journal: 'journal',
  directions: 'directions',
  projects: 'projects',
  eveningCycles: 'eveningCycles',
  exerciseDefinitions: 'exerciseDefinitions',
  tomorrowPlans: 'tomorrowPlans',
  preparationPlans: 'preparationPlans',
  preparationRules: 'preparationRules',
  recommendationApplications: 'recommendationApplications',
  morningCycles: 'morningCycles',
  goals: 'goals',
  inboxIdeas: 'inboxIdeas',
  focusPeriods: 'focusPeriods',
  taskScenarios: 'taskScenarios',
  sleepSchedules: 'sleepSchedules',
} as const;

export const LIFE_OS_STORE = LIFE_OS_DOMAIN_STORE;

export const LIFE_OS_SYNC_STORE = {
  outbox: 'sync_outbox',
  objectMeta: 'sync_object_meta',
  cursor: 'sync_cursor',
  conflicts: 'sync_conflicts',
  deviceCache: 'sync_device_cache',
  attachmentQueue: 'sync_attachment_queue',
  snapshotMeta: 'sync_snapshot_meta',
  settings: 'sync_settings',
  quarantine: 'sync_quarantine',
  appliedEvents: 'sync_applied_events',
} as const;

export class LifeOsIndexedDb {
  #balanceStores: readonly string[] = [];
  #balanceRefresh: ((tx: IDBTransaction) => Promise<void>) | null = null;
  public configureBalanceSnapshots(
    stores: readonly string[],
    refresh: (tx: IDBTransaction) => Promise<void>,
  ): void {
    this.#balanceStores = stores;
    this.#balanceRefresh = refresh;
  }
  public balanceTransactionStores(stores: readonly string[]): string[] {
    return [...new Set([...stores, ...this.#balanceStores])];
  }
  public async refreshBalanceSnapshots(
    tx: IDBTransaction,
    completion?: Promise<void>,
  ): Promise<void> {
    const settled = completion?.catch(() => undefined);
    try {
      await this.#balanceRefresh?.(tx);
    } catch (error: unknown) {
      try {
        tx.abort();
      } catch {
        /* Transaction already settled. */
      }
      await settled;
      throw error;
    }
  }
  readonly #indexedDb: IDBFactory | undefined;
  #database: IDBDatabase | null = null;
  #exposedDatabase: IDBDatabase | null = null;
  #opening: Promise<IDBDatabase> | null = null;
  #mutationCapture: MutationCaptureConfiguration | null = null;
  #captureSuppressionDepth = 0;
  readonly #commitListeners = new Set<(stores: readonly string[]) => void>();

  public subscribeCommits(listener: (stores: readonly string[]) => void): () => void {
    this.#commitListeners.add(listener);
    return () => {
      this.#commitListeners.delete(listener);
    };
  }

  public constructor(indexedDb: IDBFactory | null | undefined = globalThis.indexedDB) {
    this.#indexedDb = indexedDb ?? undefined;
  }

  public async open(): Promise<IDBDatabase> {
    if (this.#exposedDatabase !== null) {
      return this.#exposedDatabase;
    }

    if (this.#opening !== null) {
      return this.#opening;
    }

    const opening = this.openDatabase().then((database) => {
      this.#database = database;
      this.#exposedDatabase = createMutationCapturingDatabase(
        database,
        () => this.#mutationCapture,
        () => this.#captureSuppressionDepth > 0,
        (stores) => {
          for (const listener of this.#commitListeners) {
            try {
              listener(stores);
            } catch {
              /* Observers cannot invalidate an already committed save. */
            }
          }
        },
      );
      return this.#exposedDatabase;
    });
    this.#opening = opening;

    try {
      return await opening;
    } finally {
      this.#opening = null;
    }
  }

  public close(): void {
    this.#database?.close();
    this.#database = null;
    this.#exposedDatabase = null;
  }

  public configureSyncMutationCapture(
    recorder: IndexedDbSyncMutationRecorder,
    registrations: readonly SyncEntityRegistration[],
    manuallyCapturedTypes: readonly SyncEntityType[] = [],
  ): void {
    this.#mutationCapture = {
      recorder,
      entityTypeByStore: new Map(
        registrations
          .filter(
            ({ storageKind, readiness }) =>
              storageKind === 'indexed_db' && readiness === 'sync_ready',
          )
          .filter(({ entityType }) => entityType !== 'project')
          .map(({ storeName, entityType }) => [storeName, entityType]),
      ),
      manuallyCapturedTypes: new Set(manuallyCapturedTypes),
    };
  }

  public withMutationCaptureSuppressed<T>(operation: () => Promise<T>): Promise<T> {
    this.#captureSuppressionDepth += 1;
    try {
      return operation();
    } finally {
      this.#captureSuppressionDepth -= 1;
    }
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
          if (oldVersion < 18) createVersionEighteenSchema(request.result);
          if (oldVersion < 19) createVersionNineteenSchema(request.result);
          if (oldVersion < 20) createVersionTwentySchema(request.result);
          if (oldVersion < 21) createVersionTwentyOneSchema(request.transaction);
          if (oldVersion < 23) {
            for (const store of [LIFE_OS_STORE.inboxIdeas, LIFE_OS_STORE.focusPeriods]) {
              if (!request.result.objectStoreNames.contains(store))
                request.result.createObjectStore(store, { keyPath: 'id' });
            }
          }
          if (oldVersion < 24) {
            for (const store of [
              LIFE_OS_STORE.planningPeriods,
              LIFE_OS_STORE.periodMemberships,
              LIFE_OS_STORE.periodDecisions,
              LIFE_OS_STORE.contributionLinks,
              LIFE_OS_STORE.progressContributions,
              LIFE_OS_STORE.recurrenceRules,
            ]) {
              if (!request.result.objectStoreNames.contains(store))
                request.result.createObjectStore(store, { keyPath: 'id' });
            }
          }
          if (oldVersion < 25) {
            for (const name of [
              LIFE_OS_STORE.directionIndicators,
              LIFE_OS_STORE.balanceMonthlySnapshots,
            ])
              if (!request.result.objectStoreNames.contains(name))
                request.result.createObjectStore(name, { keyPath: 'id' });
          }
          if (oldVersion < 26) createVersionTwentySixSchema(request.result);
          if (
            oldVersion < 27 &&
            !request.result.objectStoreNames.contains(LIFE_OS_STORE.taskScenarios)
          )
            request.result.createObjectStore(LIFE_OS_STORE.taskScenarios, { keyPath: 'id' });
          if (oldVersion < 22 && request.transaction)
            upgradeLegacyProjects(request.result, request.transaction);
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
            this.#exposedDatabase = null;
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

function createMutationCapturingDatabase(
  database: IDBDatabase,
  configuration: () => MutationCaptureConfiguration | null,
  isSuppressed: () => boolean,
  onCommitted: (stores: readonly string[]) => void,
): IDBDatabase {
  return new Proxy(database, {
    get(target, property) {
      if (property === 'transaction') {
        return (
          storeNames: string | string[],
          mode?: IDBTransactionMode,
          options?: IDBTransactionOptions,
        ): IDBTransaction => {
          const resolvedMode = mode ?? 'readonly';
          const configured = configuration();
          const requested = typeof storeNames === 'string' ? [storeNames] : [...storeNames];
          if (resolvedMode === 'readwrite' && requested.includes('projects')) {
            for (const name of [
              'goals',
              GOAL_MIGRATION_BACKUP,
              GOAL_MIGRATION_BINDINGS,
              ...SINGLETON_SYNC_STORES,
              LIFE_OS_SYNC_STORE.settings,
              LIFE_OS_SYNC_STORE.objectMeta,
              LIFE_OS_SYNC_STORE.outbox,
              LIFE_OS_SYNC_STORE.attachmentQueue,
            ]) {
              if (!requested.includes(name)) requested.push(name);
            }
          }
          const observe = (transaction: IDBTransaction): IDBTransaction => {
            return resolvedMode === 'readwrite'
              ? withLegacyGoalIngress(
                  observeCommittedWrites(transaction, (stores) =>
                    onCommitted(
                      stores.includes('projects') ? [...new Set([...stores, 'goals'])] : stores,
                    ),
                  ),
                  (goal) => {
                    if (!configured) return;
                    let recorded = false;
                    transaction.addEventListener('complete', () =>
                      configured.recorder.notifyCommitted(recorded),
                    );
                    void configured.recorder
                      .recordUpsert(transaction, 'goal', goal)
                      .then((value) => {
                        recorded = value;
                      })
                      .catch(() => {
                        try {
                          transaction.abort();
                        } catch {
                          /* Already aborted. */
                        }
                      });
                  },
                )
              : transaction;
          };
          const captured =
            resolvedMode === 'readwrite' && configured !== null && !isSuppressed()
              ? requested
                  .map((storeName) => configured.entityTypeByStore.get(storeName))
                  .filter(
                    (entityType): entityType is SyncEntityType =>
                      entityType !== undefined && !configured.manuallyCapturedTypes.has(entityType),
                  )
              : [];
          if (captured.length === 0 || configured === null) {
            return observe(openTransaction(target, requested, mode, options));
          }
          const scope = new Set(requested);
          for (const storeName of SINGLETON_SYNC_STORES) scope.add(storeName);
          for (const storeName of Object.values(LIFE_OS_SYNC_STORE)) {
            if (
              storeName === LIFE_OS_SYNC_STORE.settings ||
              storeName === LIFE_OS_SYNC_STORE.objectMeta ||
              storeName === LIFE_OS_SYNC_STORE.outbox ||
              storeName === LIFE_OS_SYNC_STORE.attachmentQueue
            ) {
              scope.add(storeName);
            }
          }
          const transaction = openTransaction(target, [...scope], resolvedMode, options);
          return createMutationCapturingTransaction(observe(transaction), configured);
        };
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function openTransaction(
  database: IDBDatabase,
  storeNames: string | string[],
  mode?: IDBTransactionMode,
  options?: IDBTransactionOptions,
): IDBTransaction {
  if (options !== undefined) return database.transaction(storeNames, mode, options);
  if (mode !== undefined) return database.transaction(storeNames, mode);
  return database.transaction(storeNames);
}

function observeCommittedWrites(
  transaction: IDBTransaction,
  notify: (stores: readonly string[]) => void,
): IDBTransaction {
  const changed = new Set<string>();
  transaction.addEventListener('complete', () => {
    if (changed.size) notify([...changed]);
  });
  return new Proxy(transaction, {
    get(target, property) {
      if (property === 'objectStore')
        return (name: string) =>
          new Proxy(target.objectStore(name), {
            get(store, method) {
              const value: unknown = Reflect.get(store, method, store);
              if (typeof value !== 'function') return value;
              if (['put', 'add', 'delete', 'clear'].includes(String(method)))
                return (...args: unknown[]) => {
                  const request = Reflect.apply(value, store, args) as IDBRequest;
                  request.addEventListener('success', () => changed.add(name));
                  return request;
                };
              return value.bind(store);
            },
          });
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(target, property, value) {
      return Reflect.set(target, property, value, target);
    },
  });
}

function createMutationCapturingTransaction(
  transaction: IDBTransaction,
  configuration: MutationCaptureConfiguration,
): IDBTransaction {
  let captureChain = Promise.resolve();
  let recorded = false;
  const capture = (operation: () => Promise<boolean>): void => {
    captureChain = captureChain
      .then(operation)
      .then((didRecord) => {
        recorded ||= didRecord;
      })
      .catch(() => {
        try {
          transaction.abort();
        } catch {
          // The transaction has already failed or completed.
        }
      });
  };
  transaction.addEventListener('complete', () => {
    void captureChain.then(() => configuration.recorder.notifyCommitted(recorded));
  });
  return new Proxy(transaction, {
    get(target, property) {
      if (property === 'objectStore') {
        return (storeName: string): IDBObjectStore => {
          const store = target.objectStore(storeName);
          const entityType = configuration.entityTypeByStore.get(storeName);
          if (entityType === undefined || configuration.manuallyCapturedTypes.has(entityType)) {
            return store;
          }
          return createMutationCapturingObjectStore(
            store,
            target,
            entityType,
            configuration,
            capture,
          );
        };
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(target, property, value) {
      return Reflect.set(target, property, value, target);
    },
  });
}

function createMutationCapturingObjectStore(
  store: IDBObjectStore,
  transaction: IDBTransaction,
  entityType: SyncEntityType,
  configuration: MutationCaptureConfiguration,
  capture: (operation: () => Promise<boolean>) => void,
): IDBObjectStore {
  return new Proxy(store, {
    get(target, property) {
      if (property === 'add' || property === 'put') {
        return (value: object, key?: IDBValidKey): IDBRequest<IDBValidKey> => {
          const request =
            key === undefined ? target[property](value) : target[property](value, key);
          capture(() => configuration.recorder.recordUpsert(transaction, entityType, value));
          return request;
        };
      }
      if (property === 'delete') {
        return (key: IDBValidKey | IDBKeyRange): IDBRequest<undefined> => {
          const before =
            typeof key === 'string'
              ? (target.get(key) as IDBRequest<Readonly<Record<string, unknown>> | undefined>)
              : null;
          const previous =
            before === null
              ? Promise.resolve(undefined)
              : new Promise<Readonly<Record<string, unknown>> | undefined>((resolve, reject) => {
                  before.onsuccess = () => resolve(before.result);
                  before.onerror = () => reject(before.error);
                });
          const request = target.delete(key);
          if (typeof key === 'string') {
            capture(async () =>
              configuration.recorder.recordTombstone(transaction, entityType, key, await previous),
            );
          }
          return request;
        };
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function createVersionTwentySixSchema(database: IDBDatabase): void {
  if (!database.objectStoreNames.contains(LIFE_OS_STORE.sleepSchedules)) {
    database.createObjectStore(LIFE_OS_STORE.sleepSchedules, { keyPath: 'id' });
  }
}

function createVersionTwentyOneSchema(transaction: IDBTransaction | null): void {
  if (transaction === null) throw new Error('Транзакция обновления IndexedDB недоступна.');
  const outbox = transaction.objectStore(LIFE_OS_SYNC_STORE.outbox);
  outbox.createIndex('byNextAttemptAt', 'nextAttemptAt', { unique: false });
  outbox.createIndex('byLeaseUntil', 'leaseUntil', { unique: false });
  outbox.createIndex('byCreatedAt', 'createdAt', { unique: false });
  transaction
    .objectStore(LIFE_OS_SYNC_STORE.appliedEvents)
    .createIndex('bySequence', 'sequence', { unique: false });
  transaction
    .objectStore(LIFE_OS_SYNC_STORE.quarantine)
    .createIndex('byState', 'state', { unique: false });
}

function createVersionTwentySchema(database: IDBDatabase): void {
  const outbox = database.createObjectStore(LIFE_OS_SYNC_STORE.outbox, { keyPath: 'eventId' });
  outbox.createIndex('byState', 'state', { unique: false });
  outbox.createIndex('byObjectId', 'objectId', { unique: false });

  const objectMeta = database.createObjectStore(LIFE_OS_SYNC_STORE.objectMeta, {
    keyPath: 'objectId',
  });
  objectMeta.createIndex('byEntityType', 'entityType', { unique: false });
  objectMeta.createIndex('bySyncStatus', 'syncStatus', { unique: false });

  database.createObjectStore(LIFE_OS_SYNC_STORE.cursor, { keyPath: 'spaceId' });

  const conflicts = database.createObjectStore(LIFE_OS_SYNC_STORE.conflicts, {
    keyPath: 'conflictId',
  });
  conflicts.createIndex('byObjectId', 'objectId', { unique: false });
  conflicts.createIndex('byResolvedAt', 'resolvedAt', { unique: false });

  const devices = database.createObjectStore(LIFE_OS_SYNC_STORE.deviceCache, {
    keyPath: 'deviceId',
  });
  devices.createIndex('bySpaceId', 'spaceId', { unique: false });
  devices.createIndex('byStatus', 'status', { unique: false });

  const attachments = database.createObjectStore(LIFE_OS_SYNC_STORE.attachmentQueue, {
    keyPath: 'attachmentId',
  });
  attachments.createIndex('byState', 'state', { unique: false });
  attachments.createIndex('byParentObjectId', 'parentObjectId', { unique: false });

  const snapshots = database.createObjectStore(LIFE_OS_SYNC_STORE.snapshotMeta, {
    keyPath: 'snapshotId',
  });
  snapshots.createIndex('byKind', 'kind', { unique: false });
  snapshots.createIndex('byCreatedAt', 'createdAt', { unique: false });

  database.createObjectStore(LIFE_OS_SYNC_STORE.settings, { keyPath: 'id' });

  const quarantine = database.createObjectStore(LIFE_OS_SYNC_STORE.quarantine, {
    keyPath: 'quarantineId',
  });
  quarantine.createIndex('byEntityType', 'entityType', { unique: false });
  quarantine.createIndex('byCreatedAt', 'createdAt', { unique: false });

  const appliedEvents = database.createObjectStore(LIFE_OS_SYNC_STORE.appliedEvents, {
    keyPath: 'eventId',
  });
  appliedEvents.createIndex('byAppliedAt', 'appliedAt', { unique: false });
}

function createVersionNineteenSchema(database: IDBDatabase): void {
  const definitions = database.createObjectStore(LIFE_OS_STORE.exerciseDefinitions, {
    keyPath: 'id',
  });
  definitions.createIndex('byNormalizedName', 'normalizedName', { unique: true });
  const seedTime = new Date(0).toISOString();
  for (const seed of SYSTEM_EXERCISE_DEFINITION_SEEDS) {
    definitions.add({
      schemaVersion: 1,
      id: seed.id,
      name: seed.name,
      normalizedName: normalizeExerciseDefinitionName(seed.name),
      measurementType: seed.measurementType,
      source: EXERCISE_DEFINITION_SOURCE.system,
      createdAt: seedTime,
      updatedAt: seedTime,
      archivedAt: null,
      version: 1,
    });
  }
}

function createVersionEighteenSchema(database: IDBDatabase): void {
  const captures = database.createObjectStore(LIFE_OS_STORE.walkCaptures, { keyPath: 'id' });
  captures.createIndex('byWalkId', 'walkId', { unique: false });
  captures.createIndex('byStatus', 'status', { unique: false });
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
