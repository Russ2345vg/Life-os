import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  EVENING_HISTORY_RANGE_KIND,
  GetEveningAnalytics,
  GetEveningHistory,
} from '../../application';
import {
  DayDate,
  EntityId,
  EVENING_CYCLE_COMPLETION,
  EVENING_CYCLE_MODE,
  EVENING_CYCLE_STATE,
} from '../../domain';
import {
  LEGACY_COMPLETED_EVENING_CYCLE,
  LEGACY_EVENING_CYCLES,
  LEGACY_PREPARATION_PLAN,
  LEGACY_SHUTDOWN_EVENING_CYCLE,
  LEGACY_SKIPPED_EVENING_CYCLE,
  LEGACY_TOMORROW_PLAN,
} from '../../test/fixtures/EveningE1E11LegacyFixtures';
import { IndexedDbEveningCycleRepository } from './IndexedDbEveningCycleRepository';
import { IndexedDbEveningHistoryReader } from './IndexedDbEveningHistoryReader';
import { IndexedDbPreparationPlanRepository } from './IndexedDbPreparationPlanRepository';
import { IndexedDbTomorrowPlanRepository } from './IndexedDbTomorrowPlanRepository';
import {
  LIFE_OS_DATABASE_NAME,
  LIFE_OS_DATABASE_VERSION,
  LIFE_OS_STORE,
  LifeOsIndexedDb,
} from './indexed-db/LifeOsIndexedDb';

describe('R9 Evening Ritual v2 backward compatibility', () => {
  it('upgrades literal E1-E11 records without rewriting them and exposes the current read model', async () => {
    const factory = new IDBFactory();
    const legacy = await openVersion13EveningDatabase(factory);
    await seedLegacyEveningRecords(legacy);
    legacy.close();

    const database = new LifeOsIndexedDb(factory);
    const upgraded = await database.open();

    expect(upgraded.version).toBe(LIFE_OS_DATABASE_VERSION);
    expect(eveningSchemaOf(upgraded)).toEqual({
      eveningCycles: { byDateKey: true, byDayId: true, byState: false },
      tomorrowPlans: { byCycleId: true, byStatus: false, byTargetDateKey: true },
      preparationPlans: {
        byCycleId: true,
        byStatus: false,
        byTargetDayId: true,
        byTomorrowPlanId: true,
      },
    });
    await expect(readRawEveningRecords(upgraded)).resolves.toEqual({
      cycles: LEGACY_EVENING_CYCLES,
      tomorrowPlans: [LEGACY_TOMORROW_PLAN],
      preparationPlans: [LEGACY_PREPARATION_PLAN],
    });

    const cycleRepository = new IndexedDbEveningCycleRepository(database);
    const completed = await cycleRepository.findByDayId(
      EntityId.create(LEGACY_COMPLETED_EVENING_CYCLE.dayId),
    );
    const shutdown = await cycleRepository.findByDateKey(
      DayDate.create(LEGACY_SHUTDOWN_EVENING_CYCLE.dateKey),
    );
    const skipped = await cycleRepository.findById(
      EntityId.create(LEGACY_SKIPPED_EVENING_CYCLE.id),
    );

    expect(completed).toMatchObject({
      state: EVENING_CYCLE_STATE.completed,
      completion: EVENING_CYCLE_COMPLETION.completed,
      relaxation: null,
      sleepCheck: null,
    });
    expect(completed?.decisionIds.map(String)).toEqual(['legacy-decision-primary']);
    expect(completed?.lifeActionIds.map(String)).toEqual(['legacy-action-first']);
    expect(completed?.openLoopReferences[0]).toMatchObject({
      entityType: 'DECISION',
      requirement: 'REQUIRES_RESOLUTION',
      sourceVersion: 4,
    });
    expect(completed?.openLoopReferences[0]?.entityId.toString()).toBe('legacy-decision-primary');
    expect(completed?.openLoopResolutions[0]?.entityId.toString()).toBe('legacy-decision-primary');
    expect(
      completed?.reflectionQuestions.map((question) => question.sourceEntityIds.map(String)),
    ).toEqual([['legacy-decision-primary'], ['legacy-decision-primary'], ['legacy-action-first']]);
    expect(completed?.reflectionResults.map((result) => result.answer)).toEqual([
      'Начинать с одного ясного шага.',
      ['ENERGY_LOW', 'TOO_LARGE'],
      null,
    ]);
    expect(
      completed?.reflectionResults.map((result) => result.sourceEntityIds.map(String)),
    ).toEqual([['legacy-decision-primary'], ['legacy-decision-primary'], ['legacy-action-first']]);
    expect(completed?.reflectionSignals[0]?.sourceEntityId.toString()).toBe(
      'legacy-decision-primary',
    );
    expect(shutdown).toMatchObject({ state: EVENING_CYCLE_STATE.shutdown });
    expect(skipped).toMatchObject({
      state: EVENING_CYCLE_STATE.completed,
      mode: EVENING_CYCLE_MODE.normal,
      completion: EVENING_CYCLE_COMPLETION.skipped,
    });

    const tomorrow = await new IndexedDbTomorrowPlanRepository(database).findByCycleId(
      EntityId.create(LEGACY_COMPLETED_EVENING_CYCLE.id),
    );
    const preparation = await new IndexedDbPreparationPlanRepository(database).findByTomorrowPlanId(
      EntityId.create(LEGACY_TOMORROW_PLAN.id),
    );
    expect(tomorrow).toMatchObject({
      firstAttentionItem: null,
      planningQuality: 'FULL',
    });
    expect(tomorrow?.cycleId.toString()).toBe(LEGACY_COMPLETED_EVENING_CYCLE.id);
    expect(tomorrow?.sourceDayId.toString()).toBe(LEGACY_COMPLETED_EVENING_CYCLE.dayId);
    expect(tomorrow?.targetDayId.toString()).toBe(LEGACY_PREPARATION_PLAN.targetDayId);
    expect(tomorrow?.directionId?.toString()).toBe('legacy-direction');
    expect(tomorrow?.primaryDecisionId?.toString()).toBe('legacy-decision-primary');
    expect(tomorrow?.firstActionId?.toString()).toBe('legacy-action-first');
    expect(tomorrow?.supportingDecisionIds.map(String)).toEqual(['legacy-decision-supporting']);
    expect(preparation?.cycleId.toString()).toBe(LEGACY_COMPLETED_EVENING_CYCLE.id);
    expect(preparation?.tomorrowPlanId.toString()).toBe(LEGACY_TOMORROW_PLAN.id);
    expect(preparation?.targetDayId.toString()).toBe(LEGACY_TOMORROW_PLAN.targetDayId);
    expect(preparation?.items.map((item) => item.recommendedDurationMinutes)).toEqual([null, null]);
    expect(preparation?.items.map((item) => item.sourceId?.toString() ?? null)).toEqual([
      'legacy-project',
      'legacy-action-first',
    ]);

    const historyQuery = new GetEveningHistory(new IndexedDbEveningHistoryReader(database));
    const range = {
      kind: EVENING_HISTORY_RANGE_KIND.custom,
      startDate: DayDate.create('2026-08-01'),
      endDate: DayDate.create('2026-08-03'),
    } as const;
    const history = await historyQuery.execute(range);
    const analytics = await new GetEveningAnalytics(historyQuery, {
      findByRecommendationIds: async () => [],
    }).execute(range);

    expect(history.items.map((item) => item.cycleId)).toEqual([
      LEGACY_SKIPPED_EVENING_CYCLE.id,
      LEGACY_SHUTDOWN_EVENING_CYCLE.id,
      LEGACY_COMPLETED_EVENING_CYCLE.id,
    ]);
    expect(
      history.items.find((item) => item.cycleId === LEGACY_COMPLETED_EVENING_CYCLE.id),
    ).toMatchObject({
      dayId: LEGACY_COMPLETED_EVENING_CYCLE.dayId,
      dateKey: LEGACY_COMPLETED_EVENING_CYCLE.dateKey,
      reflectionAnswerCount: 2,
      hasTomorrowPlan: true,
      tomorrowPlanStatus: 'COMPLETED',
      preparationState: 'COMPLETED',
      preparationItems: { total: 2, completed: 1, skipped: 1, required: 1 },
    });
    expect(
      history.items.find((item) => item.cycleId === LEGACY_COMPLETED_EVENING_CYCLE.id)
        ?.reflectionAnswers,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          questionId: 'legacy-reflection-multi-choice',
          answer: ['ENERGY_LOW', 'TOO_LARGE'],
        }),
      ]),
    );
    expect(analytics.summary).toMatchObject({
      cycleCount: 3,
      completedCount: 1,
      skippedCount: 1,
      reflectionAnswerCount: 2,
    });
    database.close();
  });

  it('recovers the same legacy history after refresh and repeated upgrade opens without duplicates', async () => {
    const factory = new IDBFactory();
    const legacy = await openVersion13EveningDatabase(factory);
    await seedLegacyEveningRecords(legacy);
    legacy.close();

    const firstDatabase = new LifeOsIndexedDb(factory);
    const firstConnection = await firstDatabase.open();
    const firstRaw = await readRawEveningRecords(firstConnection);
    const firstHistory = await readLegacyHistory(firstDatabase);
    const firstExerciseCount = await countStore(firstConnection, LIFE_OS_STORE.exerciseDefinitions);
    firstDatabase.close();

    const refreshedDatabase = new LifeOsIndexedDb(factory);
    const refreshedConnection = await refreshedDatabase.open();
    const repeatedConnection = await refreshedDatabase.open();

    expect(repeatedConnection).toBe(refreshedConnection);
    await expect(readRawEveningRecords(refreshedConnection)).resolves.toEqual(firstRaw);
    await expect(readLegacyHistory(refreshedDatabase)).resolves.toEqual(firstHistory);
    await expect(countStore(refreshedConnection, LIFE_OS_STORE.eveningCycles)).resolves.toBe(3);
    await expect(countStore(refreshedConnection, LIFE_OS_STORE.tomorrowPlans)).resolves.toBe(1);
    await expect(countStore(refreshedConnection, LIFE_OS_STORE.preparationPlans)).resolves.toBe(1);
    await expect(countStore(refreshedConnection, LIFE_OS_STORE.exerciseDefinitions)).resolves.toBe(
      firstExerciseCount,
    );
    refreshedDatabase.close();
  });

  it('rejects a partial nested R5 write without synthesizing a legacy history item', async () => {
    const factory = new IDBFactory();
    const database = new LifeOsIndexedDb(factory);
    const connection = await database.open();
    const malformed = {
      ...LEGACY_COMPLETED_EVENING_CYCLE,
      id: 'partial-relaxation-cycle',
      dayId: 'partial-relaxation-day',
      dateKey: '2026-08-04',
      relaxation: {
        defaultPractice: 'BREATHING',
      },
    };
    const transaction = connection.transaction(LIFE_OS_STORE.eveningCycles, 'readwrite');
    transaction.objectStore(LIFE_OS_STORE.eveningCycles).add(malformed);
    await observeTransaction(transaction);

    await expect(
      new IndexedDbEveningCycleRepository(database).findById(EntityId.create(malformed.id)),
    ).rejects.toMatchObject({ code: 'persistence.invalid_record' });
    await expect(
      new GetEveningHistory(new IndexedDbEveningHistoryReader(database)).execute({
        kind: EVENING_HISTORY_RANGE_KIND.custom,
        startDate: DayDate.create(malformed.dateKey),
        endDate: DayDate.create(malformed.dateKey),
      }),
    ).rejects.toMatchObject({ code: 'persistence.invalid_record' });
    database.close();
  });

  it('aborts a failed version upgrade and leaves the v18 database and Evening history intact', async () => {
    const factory = new IDBFactory();
    const legacy = await openConflictingVersion18Database(factory);
    const transaction = legacy.transaction(LIFE_OS_STORE.eveningCycles, 'readwrite');
    transaction.objectStore(LIFE_OS_STORE.eveningCycles).add(LEGACY_COMPLETED_EVENING_CYCLE);
    await observeTransaction(transaction);
    legacy.close();

    await expect(new LifeOsIndexedDb(factory).open()).rejects.toMatchObject({
      code: 'persistence.database_open_failed',
    });

    const restored = await openExistingVersion(factory, 18);
    expect(restored.version).toBe(18);
    expect([...restored.objectStoreNames]).toContain(LIFE_OS_STORE.exerciseDefinitions);
    await expect(
      observeRequest(
        restored
          .transaction(LIFE_OS_STORE.eveningCycles, 'readonly')
          .objectStore(LIFE_OS_STORE.eveningCycles)
          .get(LEGACY_COMPLETED_EVENING_CYCLE.id),
      ),
    ).resolves.toEqual(LEGACY_COMPLETED_EVENING_CYCLE);
    restored.close();
  });
});

const VERSION_13_STORES = [
  LIFE_OS_STORE.days,
  LIFE_OS_STORE.decisions,
  LIFE_OS_STORE.lifeActions,
  LIFE_OS_STORE.actionSessions,
  LIFE_OS_STORE.routineBlocks,
  LIFE_OS_STORE.routineOccurrenceOverrides,
  LIFE_OS_STORE.routineOccurrenceExecutions,
  LIFE_OS_STORE.walks,
  LIFE_OS_STORE.spheres,
  LIFE_OS_STORE.journal,
  LIFE_OS_STORE.directions,
  LIFE_OS_STORE.projects,
  LIFE_OS_STORE.eveningCycles,
  LIFE_OS_STORE.tomorrowPlans,
  LIFE_OS_STORE.preparationPlans,
  LIFE_OS_STORE.preparationRules,
] as const;

function openVersion13EveningDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(LIFE_OS_DATABASE_NAME, 13);
    request.addEventListener('upgradeneeded', () => {
      for (const name of VERSION_13_STORES) {
        const store = request.result.createObjectStore(name, { keyPath: 'id' });
        if (name === LIFE_OS_STORE.eveningCycles) {
          store.createIndex('byDayId', 'dayId', { unique: true });
          store.createIndex('byDateKey', 'dateKey', { unique: true });
          store.createIndex('byState', 'state', { unique: false });
        }
        if (name === LIFE_OS_STORE.tomorrowPlans) {
          store.createIndex('byCycleId', 'cycleId', { unique: true });
          store.createIndex('byTargetDateKey', 'targetDateKey', { unique: true });
          store.createIndex('byStatus', 'status', { unique: false });
        }
        if (name === LIFE_OS_STORE.preparationPlans) {
          store.createIndex('byCycleId', 'cycleId', { unique: true });
          store.createIndex('byTomorrowPlanId', 'tomorrowPlanId', { unique: true });
          store.createIndex('byTargetDayId', 'targetDayId', { unique: true });
          store.createIndex('byStatus', 'status', { unique: false });
        }
      }
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

function openConflictingVersion18Database(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(LIFE_OS_DATABASE_NAME, 18);
    request.addEventListener('upgradeneeded', () => {
      const cycles = request.result.createObjectStore(LIFE_OS_STORE.eveningCycles, {
        keyPath: 'id',
      });
      cycles.createIndex('byDayId', 'dayId', { unique: true });
      cycles.createIndex('byDateKey', 'dateKey', { unique: true });
      cycles.createIndex('byState', 'state', { unique: false });
      request.result.createObjectStore(LIFE_OS_STORE.exerciseDefinitions, { keyPath: 'id' });
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

function openExistingVersion(factory: IDBFactory, version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(LIFE_OS_DATABASE_NAME, version);
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

async function seedLegacyEveningRecords(database: IDBDatabase): Promise<void> {
  const transaction = database.transaction(
    [LIFE_OS_STORE.eveningCycles, LIFE_OS_STORE.tomorrowPlans, LIFE_OS_STORE.preparationPlans],
    'readwrite',
  );
  const cycles = transaction.objectStore(LIFE_OS_STORE.eveningCycles);
  for (const record of LEGACY_EVENING_CYCLES) cycles.add(record);
  transaction.objectStore(LIFE_OS_STORE.tomorrowPlans).add(LEGACY_TOMORROW_PLAN);
  transaction.objectStore(LIFE_OS_STORE.preparationPlans).add(LEGACY_PREPARATION_PLAN);
  await observeTransaction(transaction);
}

async function readRawEveningRecords(database: IDBDatabase): Promise<{
  readonly cycles: readonly unknown[];
  readonly tomorrowPlans: readonly unknown[];
  readonly preparationPlans: readonly unknown[];
}> {
  const transaction = database.transaction(
    [LIFE_OS_STORE.eveningCycles, LIFE_OS_STORE.tomorrowPlans, LIFE_OS_STORE.preparationPlans],
    'readonly',
  );
  const result = await Promise.all([
    observeRequest<unknown[]>(transaction.objectStore(LIFE_OS_STORE.eveningCycles).getAll()),
    observeRequest<unknown[]>(transaction.objectStore(LIFE_OS_STORE.tomorrowPlans).getAll()),
    observeRequest<unknown[]>(transaction.objectStore(LIFE_OS_STORE.preparationPlans).getAll()),
  ]);
  await observeTransaction(transaction);
  return { cycles: result[0], tomorrowPlans: result[1], preparationPlans: result[2] };
}

async function readLegacyHistory(database: LifeOsIndexedDb) {
  return new GetEveningHistory(new IndexedDbEveningHistoryReader(database)).execute({
    kind: EVENING_HISTORY_RANGE_KIND.custom,
    startDate: DayDate.create('2026-08-01'),
    endDate: DayDate.create('2026-08-03'),
  });
}

function countStore(database: IDBDatabase, storeName: string): Promise<number> {
  return observeRequest(database.transaction(storeName, 'readonly').objectStore(storeName).count());
}

function eveningSchemaOf(database: IDBDatabase): Record<string, Record<string, boolean>> {
  const transaction = database.transaction(
    [LIFE_OS_STORE.eveningCycles, LIFE_OS_STORE.tomorrowPlans, LIFE_OS_STORE.preparationPlans],
    'readonly',
  );
  return {
    eveningCycles: indexesOf(transaction.objectStore(LIFE_OS_STORE.eveningCycles)),
    tomorrowPlans: indexesOf(transaction.objectStore(LIFE_OS_STORE.tomorrowPlans)),
    preparationPlans: indexesOf(transaction.objectStore(LIFE_OS_STORE.preparationPlans)),
  };
}

function indexesOf(store: IDBObjectStore): Record<string, boolean> {
  return Object.fromEntries([...store.indexNames].map((name) => [name, store.index(name).unique]));
}

function observeRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

function observeTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve());
    transaction.addEventListener('abort', () => reject(transaction.error));
    transaction.addEventListener('error', () => reject(transaction.error));
  });
}
