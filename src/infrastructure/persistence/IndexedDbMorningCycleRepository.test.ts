import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { cloneMorningCycle } from '../../application';
import {
  DayDate,
  EntityId,
  EXERCISE_MEASUREMENT_TYPE,
  MORNING_CYCLE_STATE,
  MORNING_PHYSICAL_STATUS,
  MORNING_STAGE_ID,
  MORNING_STAGE_STATUS,
  MorningCycle,
} from '../../domain';
import { IndexedDbMorningCycleRepository } from './IndexedDbMorningCycleRepository';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { MorningCycleRecordMapper } from './mappers/MorningCycleRecordMapper';

const DATE = DayDate.create('2026-08-23');
const START = new Date('2026-08-23T07:12:00.000+09:00');
const WATER = new Date('2026-08-23T07:14:00.000+09:00');
const EXECUTION_START = new Date('2026-08-23T07:16:00.000+09:00');
const FIRST_RESULT = new Date('2026-08-23T07:18:00.000+09:00');
const ADVANCED = new Date('2026-08-23T07:19:00.000+09:00');
const PAUSED = new Date('2026-08-23T07:20:00.000+09:00');
const LATER = new Date('2026-08-23T08:00:00.000+09:00');

describe('IndexedDbMorningCycleRepository', () => {
  it('восстанавливает paused execution с результатом и worked duration после нового открытия', async () => {
    const factory = new IDBFactory();
    const firstDatabase = new LifeOsIndexedDb(factory);
    const repository = new IndexedDbMorningCycleRepository(firstDatabase);
    const cycle = morningCycle('cycle-with-execution');
    cycle.start(START);
    cycle.selectPhysicalExercise(
      EntityId.create('morning-exercise.push-ups'),
      EXERCISE_MEASUREMENT_TYPE.repetitions,
      WATER,
    );
    cycle.startPhysicalExecution(EXECUTION_START);
    cycle.completePhysicalSet(
      EntityId.create('morning-exercise.push-ups'),
      1,
      { measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions, actualReps: 14 },
      FIRST_RESULT,
    );
    cycle.advancePhysicalExecution(ADVANCED);
    cycle.pausePhysicalExecution(PAUSED);
    await repository.createIfAbsent(cycle);
    firstDatabase.close();

    const reopenedDatabase = new LifeOsIndexedDb(factory);
    const restored = await new IndexedDbMorningCycleRepository(reopenedDatabase).findByDateKey(
      DATE,
    );

    expect(restored?.physicalExecution?.activeSetIndex).toBe(1);
    expect(restored?.physicalExecution?.pausedAt).toEqual(PAUSED);
    expect(restored?.physicalExecution?.sets[0]).toMatchObject({
      status: 'COMPLETED',
      actualReps: 14,
      resolvedAt: FIRST_RESULT,
    });
    expect(restored?.physicalExecution?.workedDurationAt(LATER)).toBe(4 * 60_000);
    reopenedDatabase.close();
  });

  it('повторно открывает результат и паузу с одинаковой меткой времени', async () => {
    const factory = new IDBFactory();
    const firstDatabase = new LifeOsIndexedDb(factory);
    const cycle = morningCycle('cycle-with-boundary-pause');
    cycle.start(START);
    cycle.selectPhysicalExercise(
      EntityId.create('morning-exercise.push-ups'),
      EXERCISE_MEASUREMENT_TYPE.repetitions,
      WATER,
    );
    cycle.startPhysicalExecution(EXECUTION_START);
    cycle.completePhysicalSet(
      EntityId.create('morning-exercise.push-ups'),
      1,
      { measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions, actualReps: 14 },
      FIRST_RESULT,
    );
    cycle.pausePhysicalExecution(FIRST_RESULT);
    await new IndexedDbMorningCycleRepository(firstDatabase).createIfAbsent(cycle);
    firstDatabase.close();

    const reopenedDatabase = new LifeOsIndexedDb(factory);
    const restored = await new IndexedDbMorningCycleRepository(reopenedDatabase).findByDateKey(
      DATE,
    );

    expect(restored?.physicalExecution?.pausedAt).toEqual(FIRST_RESULT);
    expect(restored?.physicalExecution?.currentSet).toMatchObject({
      status: 'COMPLETED',
      actualReps: 14,
      resolvedAt: FIRST_RESULT,
    });
    reopenedDatabase.close();
  });

  it('восстанавливает raw legacy записи с отсутствующим и null physicalExecution', async () => {
    const factory = new IDBFactory();
    const firstDatabase = new LifeOsIndexedDb(factory);
    const missingSource = MorningCycleRecordMapper.toRecord(
      morningCycleFor('legacy-missing', 'legacy-missing-day', '2026-08-21'),
    );
    const nullSource = MorningCycleRecordMapper.toRecord(
      morningCycleFor('legacy-null', 'legacy-null-day', '2026-08-22'),
    );
    const missingExecution = { ...missingSource };
    Reflect.deleteProperty(missingExecution, 'physicalExecution');
    await putRawMorningCycleRecords(firstDatabase, [
      missingExecution,
      { ...nullSource, physicalExecution: null },
    ]);
    firstDatabase.close();

    const reopenedDatabase = new LifeOsIndexedDb(factory);
    const repository = new IndexedDbMorningCycleRepository(reopenedDatabase);
    const restoredMissing = await repository.findByDateKey(DayDate.create('2026-08-21'));
    const restoredNull = await repository.findByDateKey(DayDate.create('2026-08-22'));

    expect(restoredMissing?.physicalExecution).toBeNull();
    expect(restoredNull?.physicalExecution).toBeNull();
    reopenedDatabase.close();
  });

  it('восстанавливает старт, воду и пропуск после повторного открытия', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbMorningCycleRepository(database);
    const cycle = morningCycle('cycle');
    cycle.start(START);
    cycle.completeWater(WATER, 250);
    cycle.skipPhysical(new Date('2026-08-23T07:16:00.000+09:00'));
    await repository.createIfAbsent(cycle);
    database.close();

    const restored = await new IndexedDbMorningCycleRepository(database).findByDateKey(DATE);

    expect(restored?.startedAt).toEqual(START);
    expect(restored?.waterCompletedAt).toEqual(WATER);
    expect(restored?.waterAmountMl).toBe(250);
    expect(restored?.physicalStatus).toBe('SKIPPED');
    database.close();
  });

  it('сохраняет выбранный физический план после повторного открытия', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbMorningCycleRepository(database);
    const cycle = morningCycle('cycle-with-physical-plan');
    cycle.start(START);
    cycle.selectPhysicalExercise(
      EntityId.create('morning-exercise.push-ups'),
      EXERCISE_MEASUREMENT_TYPE.repetitions,
      WATER,
    );
    cycle.selectPhysicalExercise(
      EntityId.create('morning-exercise.plank'),
      EXERCISE_MEASUREMENT_TYPE.duration,
      WATER,
    );
    cycle.adjustPhysicalExercise(
      EntityId.create('morning-exercise.plank'),
      { field: 'target', delta: 1 },
      WATER,
    );
    await repository.createIfAbsent(cycle);
    database.close();

    const restored = await new IndexedDbMorningCycleRepository(database).findByDateKey(DATE);

    expect(restored?.physicalPlanItems).toEqual([
      {
        exerciseDefinitionId: EntityId.create('morning-exercise.push-ups'),
        measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
        sets: 3,
        targetReps: 10,
      },
      {
        exerciseDefinitionId: EntityId.create('morning-exercise.plank'),
        measurementType: EXERCISE_MEASUREMENT_TYPE.duration,
        sets: 3,
        targetDurationSeconds: 35,
      },
    ]);
    database.close();
  });

  it('восстанавливает новый lifecycle и snapshots этапов после повторного открытия', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbMorningCycleRepository(database);
    const cycle = MorningCycle.rehydrate({
      id: EntityId.create('cycle-with-foundation'),
      dayId: EntityId.create('day-with-foundation'),
      dateKey: DATE,
      state: MORNING_CYCLE_STATE.readyToWork,
      startedAt: START,
      finishedAt: null,
      shortenedMode: true,
      stageStates: [
        {
          stageId: 'water',
          status: MORNING_STAGE_STATUS.completed,
          updatedAt: WATER,
        },
      ],
      waterCompletedAt: WATER,
      waterAmountMl: 250,
      physicalStatus: MORNING_PHYSICAL_STATUS.notConfigured,
      physicalUpdatedAt: null,
      updatedAt: WATER,
      version: 4,
    });
    await repository.createIfAbsent(cycle);
    database.close();

    const restored = await new IndexedDbMorningCycleRepository(database).findByDateKey(DATE);

    expect(restored?.state).toBe(MORNING_CYCLE_STATE.readyToWork);
    expect(restored?.shortenedMode).toBe(true);
    expect(restored?.stageStates).toEqual([
      {
        stageId: 'water',
        status: MORNING_STAGE_STATUS.completed,
        updatedAt: WATER,
      },
    ]);
    database.close();
  });

  it('восстанавливает выбранный cold shower факт после повторного открытия', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbMorningCycleRepository(database);
    const cycle = morningCycle('cycle-with-cold-shower');
    cycle.start(START);
    cycle.skipColdShower(WATER);
    await repository.createIfAbsent(cycle);
    database.close();

    const restored = await new IndexedDbMorningCycleRepository(database).findByDateKey(DATE);

    expect(restored?.stageStates).toContainEqual({
      stageId: MORNING_STAGE_ID.coldShower,
      status: MORNING_STAGE_STATUS.skipped,
      updatedAt: WATER,
    });
    database.close();
  });

  it('восстанавливает завершённый Mirror после повторного открытия', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbMorningCycleRepository(database);
    const cycle = morningCycle('cycle-with-mirror');
    const showerAt = new Date('2026-08-23T07:15:00.000+09:00');
    const physicalAt = new Date('2026-08-23T07:16:00.000+09:00');
    const mirrorAt = new Date('2026-08-23T07:17:00.000+09:00');
    cycle.start(START);
    cycle.completeWater(WATER, 250);
    cycle.completeColdShower(showerAt);
    cycle.skipPhysical(physicalAt);
    cycle.completeMirror(mirrorAt);
    await repository.createIfAbsent(cycle);
    database.close();

    const restored = await new IndexedDbMorningCycleRepository(database).findByDateKey(DATE);

    expect(restored?.stageStates).toContainEqual({
      stageId: MORNING_STAGE_ID.mirror,
      status: MORNING_STAGE_STATUS.completed,
      updatedAt: mirrorAt,
    });
    expect(
      restored?.stageStates.find((stage) => stage.stageId === MORNING_STAGE_ID.mirror)?.updatedAt,
    ).not.toBe(mirrorAt);
    database.close();
  });

  it('находит последний активный запуск строго до даты и пропускает terminal-записи', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbMorningCycleRepository(database);
    const older = morningCycleFor('older', 'older-day', '2026-08-20');
    older.start(new Date('2026-08-19T22:00:00.000Z'));
    const previous = morningCycleFor('previous', 'previous-day', '2026-08-21');
    previous.start(new Date('2026-08-20T22:00:00.000Z'));
    const terminal = morningCycleFor('terminal', 'terminal-day', '2026-08-22');
    terminal.start(new Date('2026-08-21T22:00:00.000Z'));
    terminal.abandon(new Date('2026-08-21T23:00:00.000Z'));
    const boundary = morningCycleFor('boundary', 'boundary-day', '2026-08-23');
    boundary.start(START);
    await repository.createIfAbsent(older);
    await repository.createIfAbsent(terminal);
    await repository.createIfAbsent(previous);
    await repository.createIfAbsent(boundary);

    const found = await repository.findLatestUnfinishedBefore(DATE);

    expect(found?.id.equals(previous.id)).toBe(true);
    database.close();
  });

  it('читает включённый диапазон истории от новой даты к старой', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbMorningCycleRepository(database);
    await repository.createIfAbsent(morningCycleFor('older', 'older-day', '2026-08-20'));
    await repository.createIfAbsent(morningCycleFor('start', 'start-day', '2026-08-21'));
    await repository.createIfAbsent(morningCycleFor('end', 'end-day', '2026-08-23'));
    await repository.createIfAbsent(morningCycleFor('newer', 'newer-day', '2026-08-24'));

    const found = await repository.findBetween(
      DayDate.create('2026-08-21'),
      DayDate.create('2026-08-23'),
    );

    expect(found.map((cycle) => cycle.id.toString())).toEqual(['end', 'start']);
    database.close();
  });

  it('создаёт одну запись при конкурентном первом запуске', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbMorningCycleRepository(database);
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, index) =>
        repository.createIfAbsent(morningCycle(`cycle-${index}`)),
      ),
    );

    expect(new Set(results.map((cycle) => cycle.id.toString())).size).toBe(1);
    expect((await repository.findByDayId(EntityId.create('day')))?.dateKey.equals(DATE)).toBe(true);
    database.close();
  });

  it('отклоняет устаревшую версию второй вкладки', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbMorningCycleRepository(database);
    await repository.createIfAbsent(morningCycle('cycle'));
    const first = cloneMorningCycle((await repository.findByDateKey(DATE))!);
    const second = cloneMorningCycle((await repository.findByDateKey(DATE))!);
    const version = first.version;
    first.start(START);
    second.start(new Date('2026-08-23T08:00:00.000+09:00'));

    const results = await Promise.all([
      repository.saveIfVersionMatches(first, version),
      repository.saveIfVersionMatches(second, version),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await repository.findByDateKey(DATE))?.version).toBe(version + 1);
    database.close();
  });

  it('регистрирует store и уникальные индексы схемы', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const opened = await database.open();
    const transaction = opened.transaction(LIFE_OS_STORE.morningCycles, 'readonly');
    const store = transaction.objectStore(LIFE_OS_STORE.morningCycles);

    expect(store.indexNames.contains('byDayId')).toBe(true);
    expect(store.indexNames.contains('byDateKey')).toBe(true);
    expect(store.index('byDayId').unique).toBe(true);
    expect(store.index('byDateKey').unique).toBe(true);
    database.close();
  });
});

function morningCycle(id: string): MorningCycle {
  return morningCycleFor(id, 'day', DATE.toString());
}

function morningCycleFor(id: string, dayId: string, date: string): MorningCycle {
  return MorningCycle.create({
    id: EntityId.create(id),
    dayId: EntityId.create(dayId),
    dateKey: DayDate.create(date),
    occurredAt: new Date('2026-08-23T06:50:00.000+09:00'),
  });
}

async function putRawMorningCycleRecords(
  database: LifeOsIndexedDb,
  records: readonly object[],
): Promise<void> {
  const opened = await database.open();
  await new Promise<void>((resolve, reject) => {
    const transaction = opened.transaction(LIFE_OS_STORE.morningCycles, 'readwrite');
    const store = transaction.objectStore(LIFE_OS_STORE.morningCycles);
    for (const record of records) store.put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
