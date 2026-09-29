import { Project } from '../../../domain';
import { ProjectRecordMapper } from '../mappers/ProjectRecordMapper';
import { GOAL_MIGRATION_BACKUP, GOAL_MIGRATION_BINDINGS } from './LegacyProjectGoalMigration';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { EntityId, GOAL_STAGE, GOAL_STATUS } from '../../../domain';
import { IndexedDbGoalRepository } from '../IndexedDbGoalRepository';
import { WalkRecordMapper } from '../mappers/WalkRecordMapper';
import { historyWalk } from '../../../test/helpers/WalkHistoryFixtures';
import { executeIndexedDbRequest } from './IndexedDbRequest';
import {
  LIFE_OS_DATABASE_NAME,
  LIFE_OS_DATABASE_VERSION,
  LIFE_OS_SYNC_STORE,
  LIFE_OS_STORE,
  LifeOsIndexedDb,
} from './LifeOsIndexedDb';

describe('LifeOsIndexedDb', () => {
  it('adds diary storage to v28 without rewriting an existing action', async () => {
    const factory = new IDBFactory();
    const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
      const opened = factory.open(LIFE_OS_DATABASE_NAME, 28);
      opened.onupgradeneeded = () =>
        opened.result.createObjectStore('lifeActions', { keyPath: 'id' });
      opened.onsuccess = () => resolve(opened.result);
      opened.onerror = () => reject(opened.error);
    });
    const saved = { id: 'existing-action', marker: 'unchanged' };
    const write = legacy.transaction('lifeActions', 'readwrite');
    write.objectStore('lifeActions').put(saved);
    await transactionDone(write);
    legacy.close();

    const adapter = new LifeOsIndexedDb(factory);
    const upgraded = await adapter.open();

    expect([...upgraded.objectStoreNames]).toContain(LIFE_OS_STORE.diaryEntries);
    expect(
      await executeIndexedDbRequest(upgraded, 'lifeActions', 'readonly', (store) =>
        store.get('existing-action'),
      ),
    ).toEqual(saved);
    expect(
      indexesOf(
        upgraded.transaction(LIFE_OS_STORE.diaryEntries).objectStore(LIFE_OS_STORE.diaryEntries),
      ),
    ).toEqual({
      byKindAndPeriodStart: false,
      byPeriodKey: true,
    });
    adapter.close();
  });

  it('adds capacity storage to v27 without rewriting an existing action', async () => {
    const factory = new IDBFactory();
    const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
      const opened = factory.open(LIFE_OS_DATABASE_NAME, 27);
      opened.onupgradeneeded = () =>
        opened.result.createObjectStore('lifeActions', { keyPath: 'id' });
      opened.onsuccess = () => resolve(opened.result);
      opened.onerror = () => reject(opened.error);
    });
    const saved = { id: 'existing-action', marker: 'unchanged' };
    const write = legacy.transaction('lifeActions', 'readwrite');
    write.objectStore('lifeActions').put(saved);
    await transactionDone(write);
    legacy.close();
    const adapter = new LifeOsIndexedDb(factory);
    const upgraded = await adapter.open();
    expect([...upgraded.objectStoreNames]).toContain(LIFE_OS_STORE.timeCapacity);
    expect(
      await executeIndexedDbRequest(upgraded, 'lifeActions', 'readonly', (store) =>
        store.get('existing-action'),
      ),
    ).toEqual(saved);
    adapter.close();
  });

  it('returns the same mutation-capturing connection to concurrent open callers', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const [first, second] = await Promise.all([indexedDb.open(), indexedDb.open()]);
    expect(second).toBe(first);
    expect(await indexedDb.open()).toBe(first);
    indexedDb.close();
  });

  it('SYNC-01 upgrades a literal v19 database without changing any existing record', async () => {
    const factory = new IDBFactory();
    const legacy = await openLiteralVersion19Database(factory);
    const expectedByStore: Record<string, object[]> = Object.fromEntries(
      LEGACY_VERSION_19_STORES.map((storeName) => [
        storeName,
        storeName === 'projects'
          ? [
              ProjectRecordMapper.toRecord(
                Project.create({
                  id: EntityId.create('legacy-projects'),
                  title: 'Legacy project',
                  now: new Date('2026-09-01T00:00:00Z'),
                }),
              ),
            ]
          : [{ id: `legacy-${storeName}`, marker: storeName, nested: { preserved: true } }],
      ]),
    );
    const write = legacy.transaction(LEGACY_VERSION_19_STORES, 'readwrite');
    for (const storeName of LEGACY_VERSION_19_STORES) {
      write.objectStore(storeName).put(expectedByStore[storeName]![0]);
    }
    await transactionDone(write);
    legacy.close();

    const adapter = new LifeOsIndexedDb(factory);
    const upgraded = await adapter.open();

    expect(upgraded.version).toBe(LIFE_OS_DATABASE_VERSION);
    for (const storeName of LEGACY_VERSION_19_STORES) {
      expect(
        await executeIndexedDbRequest(upgraded, storeName, 'readonly', (store) => store.getAll()),
      ).toEqual(
        storeName === 'goals'
          ? expect.arrayContaining(expectedByStore[storeName]!)
          : expectedByStore[storeName],
      );
      const transaction = upgraded.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      expect(
        [...store.indexNames].map((indexName) => ({
          name: indexName,
          keyPath: store.index(indexName).keyPath,
          unique: store.index(indexName).unique,
        })),
      ).toEqual(
        storeName === 'goals'
          ? [
              { name: 'byDirectionId', keyPath: 'directionId', unique: false },
              { name: 'bySphereId', keyPath: 'sphereId', unique: false },
              { name: 'byStatus', keyPath: 'status', unique: false },
            ]
          : (LEGACY_VERSION_19_INDEXES[storeName] ?? []),
      );
    }
    for (const storeName of SYNC_01_TECHNICAL_STORES) {
      expect([...upgraded.objectStoreNames]).toContain(storeName);
      expect(
        await executeIndexedDbRequest(upgraded, storeName, 'readonly', (store) => store.getAll()),
      ).toEqual([]);
    }
    adapter.close();
  });

  it('WALK-14 opens v17 Walk outcome and return context unchanged while adding empty Capture storage', async () => {
    const factory = new IDBFactory();
    const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(LIFE_OS_DATABASE_NAME, 17);
      request.onupgradeneeded = () => {
        for (const name of Object.values(LIFE_OS_STORE)) {
          if (name === LIFE_OS_STORE.walkCaptures || name === LIFE_OS_STORE.exerciseDefinitions) {
            continue;
          }
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
    adapter.close();
  });

  it('создаёт текущую схему с domain и изолированными technical object stores', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());

    const database = await indexedDb.open();

    expect(database.name).toBe(LIFE_OS_DATABASE_NAME);
    expect(database.version).toBe(LIFE_OS_DATABASE_VERSION);
    expect([...database.objectStoreNames]).toEqual([
      LIFE_OS_STORE.actionSessions,
      LIFE_OS_STORE.balanceMonthlySnapshots,
      LIFE_OS_STORE.contributionLinks,
      LIFE_OS_STORE.days,
      LIFE_OS_STORE.decisions,
      LIFE_OS_STORE.diaryEntries,
      LIFE_OS_STORE.directionIndicators,
      LIFE_OS_STORE.directions,
      LIFE_OS_STORE.eveningCycles,
      LIFE_OS_STORE.exerciseDefinitions,
      LIFE_OS_STORE.focusPeriods,
      GOAL_MIGRATION_BACKUP,
      GOAL_MIGRATION_BINDINGS,
      LIFE_OS_STORE.goals,
      LIFE_OS_STORE.inboxIdeas,
      LIFE_OS_STORE.journal,
      LIFE_OS_STORE.lifeActions,
      LIFE_OS_STORE.morningCycles,
      LIFE_OS_STORE.periodDecisions,
      LIFE_OS_STORE.periodMemberships,
      LIFE_OS_STORE.planningPeriods,
      LIFE_OS_STORE.preparationPlans,
      LIFE_OS_STORE.preparationRules,
      LIFE_OS_STORE.progressContributions,
      LIFE_OS_STORE.projects,
      LIFE_OS_STORE.recommendationApplications,
      LIFE_OS_STORE.recurrenceRules,
      LIFE_OS_STORE.routineBlocks,
      LIFE_OS_STORE.routineOccurrenceExecutions,
      LIFE_OS_STORE.routineOccurrenceOverrides,
      LIFE_OS_STORE.sleepSchedules,
      LIFE_OS_STORE.spheres,
      LIFE_OS_SYNC_STORE.appliedEvents,
      LIFE_OS_SYNC_STORE.attachmentQueue,
      LIFE_OS_SYNC_STORE.conflicts,
      LIFE_OS_SYNC_STORE.cursor,
      LIFE_OS_SYNC_STORE.deviceCache,
      LIFE_OS_SYNC_STORE.objectMeta,
      LIFE_OS_SYNC_STORE.outbox,
      LIFE_OS_SYNC_STORE.quarantine,
      LIFE_OS_SYNC_STORE.settings,
      LIFE_OS_SYNC_STORE.snapshotMeta,
      LIFE_OS_STORE.taskScenarios,
      LIFE_OS_STORE.timeCapacity,
      LIFE_OS_STORE.tomorrowPlans,
      LIFE_OS_STORE.walkCaptures,
      LIFE_OS_STORE.walks,
    ]);

    const transaction = database.transaction(Object.values(LIFE_OS_STORE), 'readonly');
    for (const storeName of Object.values(LIFE_OS_STORE)) {
      expect(transaction.objectStore(storeName).keyPath).toBe('id');
    }
    expect(
      Object.fromEntries(
        Object.entries(LIFE_OS_SYNC_STORE).map(([key, storeName]) => [
          key,
          database.transaction(storeName).objectStore(storeName).keyPath,
        ]),
      ),
    ).toEqual({
      appliedEvents: 'eventId',
      attachmentQueue: 'attachmentId',
      conflicts: 'conflictId',
      cursor: 'spaceId',
      deviceCache: 'deviceId',
      objectMeta: 'objectId',
      outbox: 'eventId',
      quarantine: 'quarantineId',
      settings: 'id',
      snapshotMeta: 'snapshotId',
    });

    indexedDb.close();
  });

  it('добавляет единый каталог упражнений при обновлении literal v18 без потери данных', async () => {
    const factory = new IDBFactory();
    const legacy = await openLiteralVersion18Database(factory);
    const morningRecord = { id: 'morning-v18', dateKey: '2026-08-27', version: 3 };
    const transaction = legacy.transaction(LIFE_OS_STORE.morningCycles, 'readwrite');
    transaction.objectStore(LIFE_OS_STORE.morningCycles).put(morningRecord);
    await transactionDone(transaction);
    legacy.close();

    const adapter = new LifeOsIndexedDb(factory);
    const upgraded = await adapter.open();
    const restoredMorning = await executeIndexedDbRequest(
      upgraded,
      LIFE_OS_STORE.morningCycles,
      'readonly',
      (store) => store.get('morning-v18'),
    );
    const definitions = await executeIndexedDbRequest<Array<{ name: string }>>(
      upgraded,
      'exerciseDefinitions',
      'readonly',
      (store) => store.getAll(),
    );

    expect(upgraded.version).toBe(LIFE_OS_DATABASE_VERSION);
    expect(restoredMorning).toEqual(morningRecord);
    expect(
      indexesOf(upgraded.transaction('exerciseDefinitions').objectStore('exerciseDefinitions')),
    ).toEqual({
      byNormalizedName: true,
    });
    expect(definitions).toHaveLength(5);
    expect(definitions.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['Отжимания', 'Подтягивания', 'Приседания', 'Планка', 'Пресс']),
    );
    adapter.close();
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
    expect(indexesOf(transaction.objectStore(LIFE_OS_STORE.diaryEntries))).toEqual({
      byKindAndPeriodStart: false,
      byPeriodKey: true,
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
    expect(indexesOf(transaction.objectStore(LIFE_OS_STORE.exerciseDefinitions))).toEqual({
      byNormalizedName: true,
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
      bySphereId: false,
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
    expect([...secondConnection.objectStoreNames]).toHaveLength(47);
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
    ).toEqual({ byDirectionId: false, bySphereId: false, byStatus: false });
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
    ).toEqual({ byDirectionId: false, bySphereId: false, byStatus: false });
    indexedDb.close();
  });
});

function openDatabaseVersion16(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(LIFE_OS_DATABASE_NAME, 16);
    request.addEventListener('upgradeneeded', () => {
      for (const storeName of Object.values(LIFE_OS_STORE)) {
        if (
          storeName === LIFE_OS_STORE.walkCaptures ||
          storeName === LIFE_OS_STORE.exerciseDefinitions
        ) {
          continue;
        }
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
          storeName !== LIFE_OS_STORE.walkCaptures &&
          storeName !== LIFE_OS_STORE.exerciseDefinitions
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
    transaction.addEventListener('abort', () => reject(transaction.error));
  });
}

function openLiteralVersion18Database(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(LIFE_OS_DATABASE_NAME, 18);
    request.addEventListener('upgradeneeded', () => {
      for (const name of Object.values(LIFE_OS_STORE)) {
        if (name === 'exerciseDefinitions') continue;
        const store = request.result.createObjectStore(name, { keyPath: 'id' });
        if (name === LIFE_OS_STORE.morningCycles) {
          store.createIndex('byDayId', 'dayId', { unique: true });
          store.createIndex('byDateKey', 'dateKey', { unique: true });
        }
      }
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

const LEGACY_VERSION_19_STORES = [
  'days',
  'decisions',
  'lifeActions',
  'actionSessions',
  'routineBlocks',
  'routineOccurrenceOverrides',
  'routineOccurrenceExecutions',
  'walks',
  'walkCaptures',
  'spheres',
  'journal',
  'directions',
  'projects',
  'eveningCycles',
  'exerciseDefinitions',
  'tomorrowPlans',
  'preparationPlans',
  'preparationRules',
  'recommendationApplications',
  'morningCycles',
  'goals',
] as const;

const SYNC_01_TECHNICAL_STORES = [
  'sync_outbox',
  'sync_object_meta',
  'sync_cursor',
  'sync_conflicts',
  'sync_device_cache',
  'sync_attachment_queue',
  'sync_snapshot_meta',
  'sync_settings',
  'sync_quarantine',
  'sync_applied_events',
] as const;

type LegacyStoreName = (typeof LEGACY_VERSION_19_STORES)[number];

const LEGACY_VERSION_19_INDEXES: Partial<
  Readonly<
    Record<
      LegacyStoreName,
      readonly Readonly<{ name: string; keyPath: string | string[]; unique: boolean }>[]
    >
  >
> = {
  days: [{ name: 'byDate', keyPath: 'date', unique: true }],
  decisions: [
    { name: 'byPlannedDate', keyPath: 'plannedDate', unique: false },
    { name: 'byProjectId', keyPath: 'projectId', unique: false },
  ],
  lifeActions: [
    { name: 'byDecisionId', keyPath: 'decisionId', unique: false },
    { name: 'byPlannedDate', keyPath: 'plannedDate', unique: false },
  ],
  actionSessions: [
    { name: 'byLifeActionId', keyPath: 'lifeActionId', unique: false },
    { name: 'byStatus', keyPath: 'status', unique: false },
  ],
  routineBlocks: [{ name: 'byAnchorDate', keyPath: 'anchorDate', unique: false }],
  routineOccurrenceOverrides: [
    { name: 'byOccurrence', keyPath: ['routineBlockId', 'occurrenceDate'], unique: true },
    { name: 'byTargetDate', keyPath: 'targetDate', unique: false },
  ],
  routineOccurrenceExecutions: [
    { name: 'byOccurrence', keyPath: ['routineBlockId', 'occurrenceDate'], unique: true },
    { name: 'byStatus', keyPath: 'status', unique: false },
  ],
  walks: [
    { name: 'byDate', keyPath: 'date', unique: false },
    { name: 'byStatus', keyPath: 'status', unique: false },
  ],
  walkCaptures: [
    { name: 'byStatus', keyPath: 'status', unique: false },
    { name: 'byWalkId', keyPath: 'walkId', unique: false },
  ],
  spheres: [
    { name: 'byNormalizedName', keyPath: 'normalizedName', unique: true },
    { name: 'byStatus', keyPath: 'status', unique: false },
  ],
  journal: [
    { name: 'byEffectiveDate', keyPath: 'effectiveDate', unique: false },
    { name: 'byOccurredAt', keyPath: 'occurredAt', unique: false },
    { name: 'bySphereId', keyPath: 'sphereId', unique: false },
    { name: 'bySubjectId', keyPath: 'subjectId', unique: false },
  ],
  directions: [
    { name: 'bySphereId', keyPath: 'sphereId', unique: false },
    { name: 'byStatus', keyPath: 'status', unique: false },
  ],
  projects: [
    { name: 'byDirectionId', keyPath: 'directionId', unique: false },
    { name: 'bySphereId', keyPath: 'sphereId', unique: false },
    { name: 'byStatus', keyPath: 'status', unique: false },
  ],
  eveningCycles: [
    { name: 'byDateKey', keyPath: 'dateKey', unique: true },
    { name: 'byDayId', keyPath: 'dayId', unique: true },
    { name: 'byState', keyPath: 'state', unique: false },
  ],
  exerciseDefinitions: [{ name: 'byNormalizedName', keyPath: 'normalizedName', unique: true }],
  tomorrowPlans: [
    { name: 'byCycleId', keyPath: 'cycleId', unique: true },
    { name: 'byStatus', keyPath: 'status', unique: false },
    { name: 'byTargetDateKey', keyPath: 'targetDateKey', unique: true },
  ],
  preparationPlans: [
    { name: 'byCycleId', keyPath: 'cycleId', unique: false },
    { name: 'byStatus', keyPath: 'status', unique: false },
    { name: 'byTargetDayId', keyPath: 'targetDayId', unique: true },
    { name: 'byTomorrowPlanId', keyPath: 'tomorrowPlanId', unique: false },
  ],
  recommendationApplications: [{ name: 'byStatus', keyPath: 'status', unique: false }],
  morningCycles: [
    { name: 'byDateKey', keyPath: 'dateKey', unique: true },
    { name: 'byDayId', keyPath: 'dayId', unique: true },
  ],
  goals: [
    { name: 'byDirectionId', keyPath: 'directionId', unique: false },
    { name: 'byStatus', keyPath: 'status', unique: false },
  ],
};

function openLiteralVersion19Database(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(LIFE_OS_DATABASE_NAME, 19);
    request.addEventListener('upgradeneeded', () => {
      for (const storeName of LEGACY_VERSION_19_STORES) {
        const store = request.result.createObjectStore(storeName, { keyPath: 'id' });
        for (const index of LEGACY_VERSION_19_INDEXES[storeName] ?? []) {
          store.createIndex(index.name, index.keyPath, { unique: index.unique });
        }
      }
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

function indexesOf(store: IDBObjectStore): Readonly<Record<string, boolean>> {
  return Object.fromEntries(
    [...store.indexNames].map((indexName) => [indexName, store.index(indexName).unique]),
  );
}
