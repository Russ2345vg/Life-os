import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { EntityId, GOAL_STAGE, GOAL_STATUS } from '../../../domain';
import { IndexedDbGoalRepository } from '../IndexedDbGoalRepository';
import { IndexedDbWalkRepository } from '../IndexedDbWalkRepository';
import { WalkRecordMapper } from '../mappers/WalkRecordMapper';
import { historyWalk } from '../../../test/helpers/WalkHistoryFixtures';
import { executeIndexedDbRequest } from './IndexedDbRequest';
import {
  LIFE_OS_DATABASE_NAME,
  LIFE_OS_DATABASE_VERSION,
  LIFE_OS_STORE,
  LifeOsIndexedDb,
} from './LifeOsIndexedDb';

describe('LifeOsIndexedDb', () => {
  it('WALK-14 opens v17 Walk outcome and return context unchanged while adding empty Capture storage', async () => {
    const factory = new IDBFactory();
    const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(LIFE_OS_DATABASE_NAME, 17);
      request.onupgradeneeded = () => {
        for (const name of Object.values(LIFE_OS_STORE)) {
          if (name === LIFE_OS_STORE.walkCaptures) continue;
          const store = request.result.createObjectStore(name, { keyPath: 'id' });
          if (name === LIFE_OS_STORE.walks) {
            store.createIndex('byDate', 'date');
            store.createIndex('byStatus', 'status');
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const entity = { type: 'decision', id: EntityId.create('v17-decision') } as const;
    const walk = historyWalk('v17-walk', {
      beforeState: { energy: 3, tension: 8, clarity: 4 },
      afterState: { energy: 5, tension: 5, clarity: 6 },
      impact: 'better',
      result: 'Сохранённый вывод v17',
      linkedEntity: entity,
      returnContext: { origin: 'decision', entity, nextStep: null },
      reentry: {
        status: 'pending',
        preparedAt: new Date('2026-08-26T08:30:00Z'),
        resolvedAt: null,
        action: { kind: 'reviewResult', destination: 'decision', entity, nextStep: null },
      },
    });
    const record = WalkRecordMapper.toRecord(walk);
    const tx = legacy.transaction(['walks', 'decisions', 'routineBlocks', 'goals'], 'readwrite');
    tx.objectStore('walks').put(record);
    for (const name of ['decisions', 'routineBlocks', 'goals'])
      tx.objectStore(name).put({ id: `v17-${name}`, title: `Existing ${name}` });
    await transactionDone(tx);
    legacy.close();
    const adapter = new LifeOsIndexedDb(factory);
    const upgraded = await adapter.open();
    expect(
      await executeIndexedDbRequest(upgraded, 'walks', 'readonly', (store) => store.getAll()),
    ).toEqual([record]);
    expect(
      await executeIndexedDbRequest(upgraded, 'walkCaptures', 'readonly', (store) =>
        store.getAll(),
      ),
    ).toEqual([]);
    for (const name of ['decisions', 'routineBlocks', 'goals']) {
      expect(
        await executeIndexedDbRequest(upgraded, name, 'readonly', (store) => store.getAll()),
      ).toEqual([{ id: `v17-${name}`, title: `Existing ${name}` }]);
    }
    adapter.close();
    const restored = await new IndexedDbWalkRepository(adapter).findById(walk.id);
    expect(restored).not.toBeNull();
    expect(WalkRecordMapper.toRecord(restored!)).toEqual(record);
    adapter.close();
  });

  it('создаёт текущую схему и все object store с ключом id', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());

    const database = await indexedDb.open();

    expect(database.name).toBe(LIFE_OS_DATABASE_NAME);
    expect(database.version).toBe(LIFE_OS_DATABASE_VERSION);
    expect([...database.objectStoreNames]).toEqual([
      LIFE_OS_STORE.actionSessions,
      LIFE_OS_STORE.days,
      LIFE_OS_STORE.decisions,
      LIFE_OS_STORE.directions,
      LIFE_OS_STORE.eveningCycles,
      LIFE_OS_STORE.goals,
      LIFE_OS_STORE.journal,
      LIFE_OS_STORE.lifeActions,
      LIFE_OS_STORE.morningCycles,
      LIFE_OS_STORE.preparationPlans,
      LIFE_OS_STORE.preparationRules,
      LIFE_OS_STORE.projects,
      LIFE_OS_STORE.recommendationApplications,
      LIFE_OS_STORE.routineBlocks,
      LIFE_OS_STORE.routineOccurrenceExecutions,
      LIFE_OS_STORE.routineOccurrenceOverrides,
      LIFE_OS_STORE.spheres,
      LIFE_OS_STORE.tomorrowPlans,
      LIFE_OS_STORE.walkCaptures,
      LIFE_OS_STORE.walks,
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
      byProjectId: false,
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
    expect(indexesOf(transaction.objectStore(LIFE_OS_STORE.walks))).toEqual({
      byDate: false,
      byStatus: false,
    });
    expect(indexesOf(transaction.objectStore(LIFE_OS_STORE.walkCaptures))).toEqual({
      byStatus: false,
      byWalkId: false,
    });
    expect(indexesOf(transaction.objectStore(LIFE_OS_STORE.spheres))).toEqual({
      byNormalizedName: true,
      byStatus: false,
    });
    expect(indexesOf(transaction.objectStore(LIFE_OS_STORE.journal))).toEqual({
      byEffectiveDate: false,
      byOccurredAt: false,
      bySphereId: false,
      bySubjectId: false,
    });
    expect(indexesOf(transaction.objectStore(LIFE_OS_STORE.directions))).toEqual({
      bySphereId: false,
      byStatus: false,
    });
    expect(indexesOf(transaction.objectStore(LIFE_OS_STORE.projects))).toEqual({
      byDirectionId: false,
      bySphereId: false,
      byStatus: false,
    });
    expect(indexesOf(transaction.objectStore(LIFE_OS_STORE.eveningCycles))).toEqual({
      byDateKey: true,
      byDayId: true,
      byState: false,
    });
    expect(indexesOf(transaction.objectStore(LIFE_OS_STORE.tomorrowPlans))).toEqual({
      byCycleId: true,
      byStatus: false,
      byTargetDateKey: true,
    });
    expect(indexesOf(transaction.objectStore(LIFE_OS_STORE.preparationPlans))).toEqual({
      byCycleId: true,
      byStatus: false,
      byTargetDayId: true,
      byTomorrowPlanId: true,
    });
    expect(indexesOf(transaction.objectStore(LIFE_OS_STORE.preparationRules))).toEqual({});
    expect(indexesOf(transaction.objectStore(LIFE_OS_STORE.recommendationApplications))).toEqual({
      byStatus: false,
    });
    expect(indexesOf(transaction.objectStore(LIFE_OS_STORE.morningCycles))).toEqual({
      byDateKey: true,
      byDayId: true,
    });
    expect(indexesOf(transaction.objectStore(LIFE_OS_STORE.goals))).toEqual({
      byDirectionId: false,
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
    expect([...secondConnection.objectStoreNames]).toHaveLength(20);
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

    expect(upgraded.version).toBe(LIFE_OS_DATABASE_VERSION);
    expect([...upgraded.objectStoreNames]).toContain(LIFE_OS_STORE.routineBlocks);
    expect([...upgraded.objectStoreNames]).toContain(LIFE_OS_STORE.routineOccurrenceOverrides);
    expect([...upgraded.objectStoreNames]).toContain(LIFE_OS_STORE.routineOccurrenceExecutions);
    expect([...upgraded.objectStoreNames]).toContain(LIFE_OS_STORE.walks);
    expect(restored).toMatchObject({ id: 'day-legacy', date: '2026-08-01' });
    indexedDb.close();
  });

  it('migrates the E10.4 version 13 database and keeps existing data', async () => {
    const factory = new IDBFactory();
    const legacy = await openVersion13Database(factory);
    const transaction = legacy.transaction(LIFE_OS_STORE.days, 'readwrite');
    transaction.objectStore(LIFE_OS_STORE.days).put({ id: 'day-before-e10-5' });
    await transactionDone(transaction);
    legacy.close();

    const indexedDb = new LifeOsIndexedDb(factory);
    const upgraded = await indexedDb.open();
    const restored = await executeIndexedDbRequest(
      upgraded,
      LIFE_OS_STORE.days,
      'readonly',
      (store) => store.get('day-before-e10-5'),
    );

    expect(upgraded.version).toBe(LIFE_OS_DATABASE_VERSION);
    expect(restored).toEqual({ id: 'day-before-e10-5' });
    expect([...upgraded.objectStoreNames]).toContain(LIFE_OS_STORE.recommendationApplications);
    expect(
      indexesOf(
        upgraded
          .transaction(LIFE_OS_STORE.recommendationApplications)
          .objectStore(LIFE_OS_STORE.recommendationApplications),
      ),
    ).toEqual({ byStatus: false });
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
    expect(upgraded.version).toBe(LIFE_OS_DATABASE_VERSION);
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
    expect(upgraded.version).toBe(LIFE_OS_DATABASE_VERSION);
    expect(restored).toMatchObject({ id: 'override-13-3', type: 'skipped' });
    expect([...upgraded.objectStoreNames]).toContain(LIFE_OS_STORE.routineOccurrenceExecutions);
    indexedDb.close();
  });

  it('migrates the completed stage 13 database without losing execution records', async () => {
    const factory = new IDBFactory();
    const legacy = await openStage13Database(factory);
    const transaction = legacy.transaction(LIFE_OS_STORE.routineOccurrenceExecutions, 'readwrite');
    transaction.objectStore(LIFE_OS_STORE.routineOccurrenceExecutions).put({
      id: 'execution-stage-13',
      occurrenceKey: 'routine-1\u00002026-08-08',
      routineBlockId: 'routine-1',
      occurrenceDate: '2026-08-08',
      status: 'completed',
    });
    await transactionDone(transaction);
    legacy.close();

    const indexedDb = new LifeOsIndexedDb(factory);
    const upgraded = await indexedDb.open();
    const restored = await executeIndexedDbRequest(
      upgraded,
      LIFE_OS_STORE.routineOccurrenceExecutions,
      'readonly',
      (store) => store.get('execution-stage-13'),
    );

    expect(upgraded.version).toBe(LIFE_OS_DATABASE_VERSION);
    expect(restored).toMatchObject({ id: 'execution-stage-13', status: 'completed' });
    expect([...upgraded.objectStoreNames]).toContain(LIFE_OS_STORE.walks);
    const walkStore = upgraded.transaction(LIFE_OS_STORE.walks).objectStore(LIFE_OS_STORE.walks);
    expect(indexesOf(walkStore)).toEqual({ byDate: false, byStatus: false });
    indexedDb.close();
  });

  it('migrates stage 14.1 walks without rewriting records and adds the status index', async () => {
    const factory = new IDBFactory();
    const legacy = await openStage141Database(factory);
    const transaction = legacy.transaction(LIFE_OS_STORE.walks, 'readwrite');
    transaction.objectStore(LIFE_OS_STORE.walks).put({
      schemaVersion: 1,
      id: 'walk-stage-14-1',
      date: '2026-08-08',
      type: 'mindful',
      createdAt: '2026-08-08T08:00:00.000Z',
      updatedAt: '2026-08-08T08:00:00.000Z',
      version: 1,
    });
    await transactionDone(transaction);
    legacy.close();

    const indexedDb = new LifeOsIndexedDb(factory);
    const upgraded = await indexedDb.open();
    const restored = await executeIndexedDbRequest(
      upgraded,
      LIFE_OS_STORE.walks,
      'readonly',
      (store) => store.get('walk-stage-14-1'),
    );

    expect(upgraded.version).toBe(LIFE_OS_DATABASE_VERSION);
    expect(
      indexesOf(upgraded.transaction(LIFE_OS_STORE.walks).objectStore(LIFE_OS_STORE.walks)),
    ).toEqual({ byDate: false, byStatus: false });
    expect(restored).toEqual({
      schemaVersion: 1,
      id: 'walk-stage-14-1',
      date: '2026-08-08',
      type: 'mindful',
      createdAt: '2026-08-08T08:00:00.000Z',
      updatedAt: '2026-08-08T08:00:00.000Z',
      version: 1,
    });
    indexedDb.close();
  });

  it('migrates the completed stage 14 database without losing walks and adds spheres', async () => {
    const factory = new IDBFactory();
    const legacy = await openStage14Database(factory);
    const transaction = legacy.transaction(LIFE_OS_STORE.walks, 'readwrite');
    transaction.objectStore(LIFE_OS_STORE.walks).put({
      schemaVersion: 1,
      id: 'walk-stage-14',
      date: '2026-08-08',
      type: 'physical',
      status: 'planned',
      mode: null,
      startedAt: null,
      endedAt: null,
      timerTargetMinutes: null,
      reflectionQuestion: null,
      result: null,
      photo: null,
      createdAt: '2026-08-08T08:00:00.000Z',
      updatedAt: '2026-08-08T08:00:00.000Z',
      version: 1,
    });
    await transactionDone(transaction);
    legacy.close();

    const indexedDb = new LifeOsIndexedDb(factory);
    const upgraded = await indexedDb.open();
    const restored = await executeIndexedDbRequest(
      upgraded,
      LIFE_OS_STORE.walks,
      'readonly',
      (store) => store.get('walk-stage-14'),
    );

    expect(upgraded.version).toBe(LIFE_OS_DATABASE_VERSION);
    expect(restored).toMatchObject({ id: 'walk-stage-14', type: 'physical', version: 1 });
    expect(
      indexesOf(upgraded.transaction(LIFE_OS_STORE.spheres).objectStore(LIFE_OS_STORE.spheres)),
    ).toEqual({ byNormalizedName: true, byStatus: false });
    indexedDb.close();
  });

  it('migrates stage 15 without losing records or inventing journal history', async () => {
    const factory = new IDBFactory();
    const legacy = await openStage15Database(factory);
    const transaction = legacy.transaction(LIFE_OS_STORE.decisions, 'readwrite');
    transaction.objectStore(LIFE_OS_STORE.decisions).put({
      id: 'decision-stage-15',
      plannedDate: '2026-08-09',
      title: 'Существующее решение',
    });
    await transactionDone(transaction);
    legacy.close();

    const indexedDb = new LifeOsIndexedDb(factory);
    const upgraded = await indexedDb.open();
    const restored = await executeIndexedDbRequest(
      upgraded,
      LIFE_OS_STORE.decisions,
      'readonly',
      (store) => store.get('decision-stage-15'),
    );
    const journal = await executeIndexedDbRequest<unknown[]>(
      upgraded,
      LIFE_OS_STORE.journal,
      'readonly',
      (store) => store.getAll(),
    );

    expect(upgraded.version).toBe(LIFE_OS_DATABASE_VERSION);
    expect(restored).toMatchObject({ id: 'decision-stage-15' });
    expect(journal).toEqual([]);
    indexedDb.close();
  });

  it('migrates a database version 15 without losing existing records and adds goals', async () => {
    const factory = new IDBFactory();
    const legacy = await openDatabaseVersion15(factory);
    const transaction = legacy.transaction('decisions', 'readwrite');
    transaction.objectStore('decisions').put({
      id: 'decision-before-goals',
      title: 'Существующее решение',
    });
    await transactionDone(transaction);
    legacy.close();

    const indexedDb = new LifeOsIndexedDb(factory);
    const upgraded = await indexedDb.open();
    const restored = await executeIndexedDbRequest(
      upgraded,
      LIFE_OS_STORE.decisions,
      'readonly',
      (store) => store.get('decision-before-goals'),
    );

    expect(upgraded.version).toBe(LIFE_OS_DATABASE_VERSION);
    expect(restored).toEqual({
      id: 'decision-before-goals',
      title: 'Существующее решение',
    });
    expect([...upgraded.objectStoreNames]).toContain(LIFE_OS_STORE.goals);
    expect(
      indexesOf(upgraded.transaction(LIFE_OS_STORE.goals).objectStore(LIFE_OS_STORE.goals)),
    ).toEqual({ byDirectionId: false, byStatus: false });
    indexedDb.close();
  });

  it('migrates a database version 16 without losing existing Goals and adds Direction index', async () => {
    const factory = new IDBFactory();
    const legacy = await openDatabaseVersion16(factory);
    const legacyGoal = {
      schemaVersion: 1,
      id: 'goal-before-direction-index',
      title: 'Существующая цель',
      description: null,
      whyImportant: null,
      whyNow: null,
      status: GOAL_STATUS.active,
      stage: GOAL_STAGE.activeGoal,
      intentionLevel: null,
      horizon: null,
      progressType: null,
      progress: null,
      achievementCriteria: null,
      nextProgress: null,
      coverImage: null,
      createdAt: '2026-08-23T08:00:00.000Z',
      updatedAt: '2026-08-23T08:00:00.000Z',
      archivedAt: null,
      version: 1,
    };
    const transaction = legacy.transaction(LIFE_OS_STORE.goals, 'readwrite');
    transaction.objectStore(LIFE_OS_STORE.goals).put(legacyGoal);
    await transactionDone(transaction);
    legacy.close();

    const indexedDb = new LifeOsIndexedDb(factory);
    const upgraded = await indexedDb.open();
    const restored = await executeIndexedDbRequest(
      upgraded,
      LIFE_OS_STORE.goals,
      'readonly',
      (store) => store.get('goal-before-direction-index'),
    );

    expect(upgraded.version).toBe(LIFE_OS_DATABASE_VERSION);
    expect(restored).toEqual(legacyGoal);
    const repository = new IndexedDbGoalRepository(indexedDb);
    await expect(
      repository.findById(EntityId.create('goal-before-direction-index')),
    ).resolves.toMatchObject({
      directionId: null,
      status: GOAL_STATUS.active,
    });
    expect(
      indexesOf(upgraded.transaction(LIFE_OS_STORE.goals).objectStore(LIFE_OS_STORE.goals)),
    ).toEqual({ byDirectionId: false, byStatus: false });
    indexedDb.close();
  });
});

function openDatabaseVersion16(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(LIFE_OS_DATABASE_NAME, 16);
    request.addEventListener('upgradeneeded', () => {
      for (const storeName of Object.values(LIFE_OS_STORE)) {
        if (storeName === LIFE_OS_STORE.walkCaptures) continue;
        const store = request.result.createObjectStore(storeName, { keyPath: 'id' });
        if (storeName === LIFE_OS_STORE.goals) {
          store.createIndex('byStatus', 'status', { unique: false });
        }
      }
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

function openDatabaseVersion15(factory: IDBFactory): Promise<IDBDatabase> {
  const legacyStores = [
    'days',
    'decisions',
    'lifeActions',
    'actionSessions',
    'routineBlocks',
    'routineOccurrenceOverrides',
    'routineOccurrenceExecutions',
    'walks',
    'spheres',
    'journal',
    'directions',
    'projects',
    'eveningCycles',
    'tomorrowPlans',
    'preparationPlans',
    'preparationRules',
    'recommendationApplications',
    'morningCycles',
  ] as const;
  return new Promise((resolve, reject) => {
    const request = factory.open(LIFE_OS_DATABASE_NAME, 15);
    request.addEventListener('upgradeneeded', () => {
      for (const storeName of legacyStores) {
        request.result.createObjectStore(storeName, { keyPath: 'id' });
      }
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

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

function openVersion13Database(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(LIFE_OS_DATABASE_NAME, 13);
    request.addEventListener('upgradeneeded', () => {
      for (const storeName of Object.values(LIFE_OS_STORE)) {
        if (
          storeName !== LIFE_OS_STORE.recommendationApplications &&
          storeName !== LIFE_OS_STORE.morningCycles &&
          storeName !== LIFE_OS_STORE.goals &&
          storeName !== LIFE_OS_STORE.walkCaptures
        ) {
          request.result.createObjectStore(storeName, { keyPath: 'id' });
        }
      }
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

function openStage13Database(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(LIFE_OS_DATABASE_NAME, 4);
    request.addEventListener('upgradeneeded', () => {
      request.result.createObjectStore(LIFE_OS_STORE.days, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.decisions, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.lifeActions, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.actionSessions, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.routineBlocks, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.routineOccurrenceOverrides, {
        keyPath: 'id',
      });
      request.result.createObjectStore(LIFE_OS_STORE.routineOccurrenceExecutions, {
        keyPath: 'id',
      });
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

function openStage141Database(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(LIFE_OS_DATABASE_NAME, 5);
    request.addEventListener('upgradeneeded', () => {
      request.result.createObjectStore(LIFE_OS_STORE.days, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.decisions, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.lifeActions, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.actionSessions, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.routineBlocks, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.routineOccurrenceOverrides, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.routineOccurrenceExecutions, {
        keyPath: 'id',
      });
      const walks = request.result.createObjectStore(LIFE_OS_STORE.walks, { keyPath: 'id' });
      walks.createIndex('byDate', 'date', { unique: false });
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

function openStage14Database(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(LIFE_OS_DATABASE_NAME, 6);
    request.addEventListener('upgradeneeded', () => {
      request.result.createObjectStore(LIFE_OS_STORE.days, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.decisions, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.lifeActions, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.actionSessions, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.routineBlocks, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.routineOccurrenceOverrides, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.routineOccurrenceExecutions, {
        keyPath: 'id',
      });
      const walks = request.result.createObjectStore(LIFE_OS_STORE.walks, { keyPath: 'id' });
      walks.createIndex('byDate', 'date', { unique: false });
      walks.createIndex('byStatus', 'status', { unique: false });
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

function openStage15Database(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(LIFE_OS_DATABASE_NAME, 7);
    request.addEventListener('upgradeneeded', () => {
      const days = request.result.createObjectStore(LIFE_OS_STORE.days, { keyPath: 'id' });
      days.createIndex('byDate', 'date', { unique: true });
      const decisions = request.result.createObjectStore(LIFE_OS_STORE.decisions, {
        keyPath: 'id',
      });
      decisions.createIndex('byPlannedDate', 'plannedDate', { unique: false });
      const actions = request.result.createObjectStore(LIFE_OS_STORE.lifeActions, {
        keyPath: 'id',
      });
      actions.createIndex('byPlannedDate', 'plannedDate', { unique: false });
      actions.createIndex('byDecisionId', 'decisionId', { unique: false });
      const sessions = request.result.createObjectStore(LIFE_OS_STORE.actionSessions, {
        keyPath: 'id',
      });
      sessions.createIndex('byLifeActionId', 'lifeActionId', { unique: false });
      sessions.createIndex('byStatus', 'status', { unique: false });
      request.result.createObjectStore(LIFE_OS_STORE.routineBlocks, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.routineOccurrenceOverrides, { keyPath: 'id' });
      request.result.createObjectStore(LIFE_OS_STORE.routineOccurrenceExecutions, {
        keyPath: 'id',
      });
      const walks = request.result.createObjectStore(LIFE_OS_STORE.walks, { keyPath: 'id' });
      walks.createIndex('byDate', 'date', { unique: false });
      walks.createIndex('byStatus', 'status', { unique: false });
      const spheres = request.result.createObjectStore(LIFE_OS_STORE.spheres, { keyPath: 'id' });
      spheres.createIndex('byNormalizedName', 'normalizedName', { unique: true });
      spheres.createIndex('byStatus', 'status', { unique: false });
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
