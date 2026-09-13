import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { cloneEveningCycle } from '../../application';
import {
  DayDate,
  EntityId,
  EVENING_CYCLE_COMPLETION,
  EVENING_CYCLE_MODE,
  EVENING_CYCLE_STATE,
  EveningCycle,
  SLEEP_CHECK_ANSWER,
  SLEEP_CHECK_QUESTION,
  RELAXATION_PRACTICE,
  SCREEN_FREE_STATE,
  type EveningCycleState,
} from '../../domain';
import { LIFE_OS_DATABASE_VERSION, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { IndexedDbEveningCycleRepository } from './IndexedDbEveningCycleRepository';
import { EveningCycleRecordMapper } from './mappers/EveningCycleRecordMapper';

describe('IndexedDbEveningCycleRepository', () => {
  it('round-trips raw mode SKIPPED, timestamp и optional reason без нового domain mode', () => {
    const skipped = EveningCycle.create({
      id: EntityId.create('cycle-skipped-r7'),
      dayId: EntityId.create('day-skipped-r7'),
      dateKey: DayDate.create('2026-08-31'),
      occurredAt: new Date('2026-08-31T22:30:00.000Z'),
    });
    skipped.skip(new Date('2026-08-31T22:31:00.000Z'), 'Нужен сон');

    const record = EveningCycleRecordMapper.toRecord(skipped);
    const restored = EveningCycleRecordMapper.fromRecord(record);

    expect(record.mode).toBe('SKIPPED');
    expect(record.completion).toBe(EVENING_CYCLE_COMPLETION.skipped);
    expect(record.completedAt).toBe('2026-08-31T22:31:00.000Z');
    expect(record.skipReason).toBe('Нужен сон');
    expect(restored.mode).toBe(EVENING_CYCLE_MODE.normal);
    expect(restored.completion).toBe(EVENING_CYCLE_COMPLETION.skipped);
    expect(restored.skipReason).toBe('Нужен сон');
  });

  it('находит последний незавершённый цикл старше суток для recovery', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbEveningCycleRepository(database);
    await repository.createIfAbsent(cycle('2026-08-01', EVENING_CYCLE_STATE.reflecting));
    await repository.createIfAbsent(cycle('2026-08-03', EVENING_CYCLE_STATE.shutdown));
    await repository.createIfAbsent(cycle('2026-08-04', EVENING_CYCLE_STATE.completed));

    const recovered = await repository.findLatestUnfinishedOnOrBefore(DayDate.create('2026-08-06'));

    expect(recovered?.dateKey.toString()).toBe('2026-08-03');
    expect(recovered?.state).toBe(EVENING_CYCLE_STATE.shutdown);
    database.close();
  });

  it('100 конкурентных открытий создают ровно один EveningCycle', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbEveningCycleRepository(database);
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, index) =>
        repository.createIfAbsent(
          EveningCycle.rehydrate({
            id: EntityId.create(`cycle-open-${index}`),
            dayId: EntityId.create('day-shared'),
            dateKey: DayDate.create('2026-08-07'),
            state: EVENING_CYCLE_STATE.notStarted,
            mode: EVENING_CYCLE_MODE.normal,
            startedAt: null,
            updatedAt: new Date('2026-08-07T20:00:00.000Z'),
            completedAt: null,
            version: 1,
          }),
        ),
      ),
    );

    expect(new Set(results.map((result) => result.id.toString())).size).toBe(1);
    expect((await repository.findByDateKey(DayDate.create('2026-08-07')))?.dayId.toString()).toBe(
      'day-shared',
    );
    database.close();
  });

  it.each(Object.values(EVENING_CYCLE_STATE) as readonly EveningCycleState[])(
    'восстанавливает состояние %s после закрытия и повторного открытия IndexedDB',
    async (state) => {
      const database = new LifeOsIndexedDb(new IDBFactory());
      const date = DayDate.create('2026-08-08');
      const completed = state === EVENING_CYCLE_STATE.completed;
      const notStarted = state === EVENING_CYCLE_STATE.notStarted;
      const stored =
        state === EVENING_CYCLE_STATE.sleepCheck
          ? sleepCheckCycle('2026-08-08')
          : EveningCycle.rehydrate({
              id: EntityId.create(`cycle-${state}`),
              dayId: EntityId.create('day-refresh'),
              dateKey: date,
              state,
              mode: EVENING_CYCLE_MODE.normal,
              ...(completed ? { completion: EVENING_CYCLE_COMPLETION.completed } : {}),
              startedAt: notStarted ? null : new Date('2026-08-08T20:00:00.000Z'),
              updatedAt: new Date('2026-08-08T21:00:00.000Z'),
              completedAt: completed ? new Date('2026-08-08T21:00:00.000Z') : null,
              version: 5,
            });
      await new IndexedDbEveningCycleRepository(database).createIfAbsent(stored);
      database.close();

      const restored = await new IndexedDbEveningCycleRepository(database).findByDateKey(date);

      expect(restored?.state).toBe(state);
      expect(restored?.dayId.toString()).toBe(
        state === EVENING_CYCLE_STATE.sleepCheck ? 'day-2026-08-08' : 'day-refresh',
      );
      expect(restored?.dateKey.toString()).toBe('2026-08-08');
      database.close();
    },
  );

  it('отклоняет stale-запись второй вкладки и не смешивает два перехода', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const firstTab = new IndexedDbEveningCycleRepository(database);
    const secondTab = new IndexedDbEveningCycleRepository(database);
    const date = DayDate.create('2026-08-09');
    await firstTab.createIfAbsent(cycle('2026-08-09', EVENING_CYCLE_STATE.resolving));
    const firstSnapshot = cloneEveningCycle((await firstTab.findByDateKey(date))!);
    const secondSnapshot = cloneEveningCycle((await secondTab.findByDateKey(date))!);
    const expectedVersion = firstSnapshot.version;
    firstSnapshot.completeResolving(new Date('2026-08-09T21:01:00.000Z'));
    secondSnapshot.switchMode(
      EVENING_CYCLE_MODE.quick,
      'USER_SELECTED',
      new Date('2026-08-09T21:01:00.000Z'),
    );

    const results = await Promise.all([
      firstTab.saveIfVersionMatches(firstSnapshot, expectedVersion),
      secondTab.saveIfVersionMatches(secondSnapshot, expectedVersion),
    ]);
    const restored = await firstTab.findByDateKey(date);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(restored?.version).toBe(expectedVersion + 1);
    expect([
      `${EVENING_CYCLE_STATE.reflecting}:${EVENING_CYCLE_MODE.normal}`,
      `${EVENING_CYCLE_STATE.resolving}:${EVENING_CYCLE_MODE.quick}`,
    ]).toContain(`${restored?.state}:${restored?.mode}`);
    database.close();
  });

  it('round-trips полный relaxation snapshot без изменения версии базы', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const initialVersion = (await database.open()).version;
    expect(initialVersion).toBe(LIFE_OS_DATABASE_VERSION);
    const repository = new IndexedDbEveningCycleRepository(database);
    const stored = relaxationCycle('2026-08-30', RELAXATION_PRACTICE.breathing, true);

    await repository.createIfAbsent(stored);
    database.close();

    const restored = await repository.findByDateKey(DayDate.create('2026-08-30'));

    expect((await database.open()).version).toBe(initialVersion);
    expect(restored?.relaxation?.defaultPractice).toBe(RELAXATION_PRACTICE.breathing);
    expect(restored?.relaxation?.selectedPractice).toBe(RELAXATION_PRACTICE.breathing);
    expect(restored?.relaxation?.defaultChangedForFuture).toBe(true);
    expect(restored?.relaxation?.screenFreeState).toBe(SCREEN_FREE_STATE.skipped);
    expect(restored?.relaxation?.screenFreeSkippedAt?.toISOString()).toBe(
      '2026-08-30T21:10:00.000Z',
    );
    database.close();
  });

  it('round-trips QUICK relaxation 2 минуты без выдуманных drink и screen-free фактов', async () => {
    const date = '2026-08-31';
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbEveningCycleRepository(database);
    const stored = EveningCycle.create({
      id: EntityId.create('quick-relaxation-cycle'),
      dayId: EntityId.create('quick-relaxation-day'),
      dateKey: DayDate.create(date),
      occurredAt: at(date, '22:20:00'),
    });
    stored.startShort(at(date, '22:21:00'));
    stored.completePreparation(at(date, '22:22:00'));
    stored.initializeRelaxation(RELAXATION_PRACTICE.reading, 15, 25, at(date, '22:23:00'));
    stored.setRelaxationPracticeDuration(2, at(date, '22:24:00'));
    stored.completeRelaxationHygiene(at(date, '22:25:00'));
    stored.completeRelaxationPractice(at(date, '22:27:00'));
    stored.setBeforeRelaxationRatings(3, 3, at(date, '22:27:00'));
    stored.completeRelaxation(at(date, '22:28:00'));

    await repository.createIfAbsent(stored);
    const restored = await repository.findByDateKey(DayDate.create(date));

    expect(restored?.mode).toBe(EVENING_CYCLE_MODE.quick);
    expect(restored?.state).toBe(EVENING_CYCLE_STATE.sleepCheck);
    expect(restored?.relaxation?.practiceDurationMinutes).toBe(2);
    expect(restored?.relaxation?.drinkCompletedAt).toBeNull();
    expect(restored?.relaxation?.screenFreeState).toBe(SCREEN_FREE_STATE.pending);
    database.close();
  });

  it('читает legacy schema-version-1 record без relaxation facts', () => {
    const legacyRecord = EveningCycleRecordMapper.toRecord(
      cycle('2026-08-28', EVENING_CYCLE_STATE.shutdown),
    );

    const restored = EveningCycleRecordMapper.fromRecord(legacyRecord);

    expect(restored.relaxation).toBeNull();
    expect(restored.sleepCheck).toBeNull();
  });

  it('round-trips partial и completed R6 facts в schemaVersion 1 без DB bump', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const initialVersion = (await database.open()).version;
    expect(initialVersion).toBe(LIFE_OS_DATABASE_VERSION);
    const repository = new IndexedDbEveningCycleRepository(database);
    const partial = sleepCheckCycle('2026-08-30');
    partial.setAfterRelaxationRatings(4, 5, at('2026-08-30', '22:11:00'));
    partial.answerSleepCheckQuestion(
      SLEEP_CHECK_QUESTION.calmMind,
      SLEEP_CHECK_ANSWER.yes,
      at('2026-08-30', '22:12:00'),
    );

    await repository.createIfAbsent(partial);
    database.close();
    const restored = await repository.findByDateKey(DayDate.create('2026-08-30'));

    expect((await database.open()).version).toBe(initialVersion);
    expect(EveningCycleRecordMapper.toRecord(partial).schemaVersion).toBe(1);
    expect(restored?.state).toBe(EVENING_CYCLE_STATE.sleepCheck);
    expect(restored?.sleepCheck).toMatchObject({
      calmBefore: 2,
      sleepReadinessBefore: 3,
      calmAfter: 4,
      sleepReadinessAfter: 5,
    });
    expect(restored?.sleepCheck?.initialAnswers).toHaveLength(1);
    database.close();
  });

  it('round-trips завершённый corrective action, capture, retry и R6 completion', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbEveningCycleRepository(database);
    const completed = completedSleepCheckCycle('2026-08-30');

    await repository.createIfAbsent(completed);
    const restored = await repository.findByDateKey(DayDate.create('2026-08-30'));

    expect(restored?.state).toBe(EVENING_CYCLE_STATE.shutdown);
    expect(restored?.sleepCheck?.correctiveAction).toMatchObject({
      questionId: SLEEP_CHECK_QUESTION.holdingThought,
      action: 'CAPTURE_THOUGHT',
      capturedThought: 'Вернуться к смете завтра',
    });
    expect(restored?.sleepCheck?.retriedAnswers).toHaveLength(1);
    expect(restored?.sleepCheck?.completedAt).toEqual(at('2026-08-30', '22:18:00'));
    database.close();
  });

  it('отклоняет malformed R6 rating и unknown question', () => {
    const record = EveningCycleRecordMapper.toRecord(sleepCheckCycle('2026-08-30')) as unknown as {
      readonly sleepCheck?: Record<string, unknown>;
      readonly [key: string]: unknown;
    };

    expect(() =>
      EveningCycleRecordMapper.fromRecord({
        ...record,
        sleepCheck: { ...record.sleepCheck, calmBefore: 0 },
      }),
    ).toThrow();
    expect(() =>
      EveningCycleRecordMapper.fromRecord({
        ...record,
        sleepCheck: {
          ...record.sleepCheck,
          calmAfter: 4,
          sleepReadinessAfter: 4,
          afterRatedAt: at('2026-08-30', '22:11:00').toISOString(),
          initialAnswers: [
            {
              questionId: 'UNKNOWN',
              value: SLEEP_CHECK_ANSWER.yes,
              answeredAt: at('2026-08-30', '22:12:00').toISOString(),
            },
          ],
        },
      }),
    ).toThrow();
  });

  it('не восстанавливает R6 поверх незавершённого R5 snapshot', () => {
    const record = EveningCycleRecordMapper.toRecord(sleepCheckCycle('2026-08-30')) as unknown as {
      readonly relaxation?: Record<string, unknown>;
      readonly [key: string]: unknown;
    };

    expect(() =>
      EveningCycleRecordMapper.fromRecord({
        ...record,
        relaxation: {
          ...record.relaxation,
          practiceCompletedAt: null,
        },
      }),
    ).toThrowError(expect.objectContaining({ code: 'evening_cycle.invariant_violation' }));

    const completedRecord = EveningCycleRecordMapper.toRecord(
      completedSleepCheckCycle('2026-08-30'),
    ) as unknown as {
      readonly relaxation?: Record<string, unknown>;
      readonly [key: string]: unknown;
    };
    expect(() =>
      EveningCycleRecordMapper.fromRecord({
        ...completedRecord,
        relaxation: { ...completedRecord.relaxation, practiceCompletedAt: null },
      }),
    ).toThrowError(expect.objectContaining({ code: 'evening_cycle.invariant_violation' }));
  });

  it('находит последний строго предыдущий явно сохранённый relaxation default', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const repository = new IndexedDbEveningCycleRepository(database);
    await repository.createIfAbsent(
      relaxationCycle('2026-08-27', RELAXATION_PRACTICE.meditation, true),
    );
    await repository.createIfAbsent(cycle('2026-08-28', EVENING_CYCLE_STATE.shutdown));
    await repository.createIfAbsent(
      relaxationCycle('2026-08-29', RELAXATION_PRACTICE.breathing, false),
    );
    await repository.createIfAbsent(
      relaxationCycle('2026-08-30', RELAXATION_PRACTICE.stretching, true),
    );

    const latest = await repository.findLatestWithSavedRelaxationDefaultBefore(
      DayDate.create('2026-08-30'),
    );

    expect(latest?.dateKey.toString()).toBe('2026-08-27');
    expect(latest?.relaxation?.defaultPractice).toBe(RELAXATION_PRACTICE.meditation);
    database.close();
  });

  it.each([
    ['unknown default practice', { defaultPractice: 'YOGA' }],
    ['too short duration', { practiceDurationMinutes: 4 }],
    ['too long duration', { practiceDurationMinutes: 21 }],
    ['decimal duration', { practiceDurationMinutes: 10.5 }],
    ['unknown screen-free state', { screenFreeState: 'PAUSED' }],
    [
      'active screen-free without start timestamp',
      { screenFreeState: SCREEN_FREE_STATE.active, screenFreeStartedAt: null },
    ],
  ])('отклоняет malformed relaxation record: %s', (_label, change) => {
    const record = EveningCycleRecordMapper.toRecord(
      cycle('2026-08-26', EVENING_CYCLE_STATE.shutdown),
    );

    expect(() =>
      EveningCycleRecordMapper.fromRecord({
        ...record,
        relaxation: {
          ...relaxationRecord('2026-08-26'),
          ...change,
        },
      }),
    ).toThrow();
  });
});

function cycle(date: string, state: EveningCycleState): EveningCycle {
  const completed = state === EVENING_CYCLE_STATE.completed;
  return EveningCycle.rehydrate({
    id: EntityId.create(`cycle-${date}`),
    dayId: EntityId.create(`day-${date}`),
    dateKey: DayDate.create(date),
    state,
    mode: EVENING_CYCLE_MODE.normal,
    startedAt: new Date(`${date}T20:00:00.000Z`),
    updatedAt: new Date(`${date}T21:00:00.000Z`),
    completedAt: completed ? new Date(`${date}T21:00:00.000Z`) : null,
    version: 1,
  });
}

function relaxationCycle(
  date: string,
  practice: (typeof RELAXATION_PRACTICE)[keyof typeof RELAXATION_PRACTICE],
  persistAsDefault: boolean,
): EveningCycle {
  const result = cycle(date, EVENING_CYCLE_STATE.relaxing);
  result.initializeRelaxation(RELAXATION_PRACTICE.reading, 15, 25, at(date, '21:00:00'));
  result.chooseRelaxationPractice(practice, persistAsDefault, at(date, '21:01:00'));
  result.completeRelaxationDrink(at(date, '21:02:00'));
  result.completeRelaxationHygiene(at(date, '21:03:00'));
  result.completeRelaxationPractice(at(date, '21:04:00'));
  result.skipRelaxationScreenFree(at(date, '21:10:00'));
  return result;
}

function sleepCheckCycle(date: string): EveningCycle {
  const result = relaxationCycle(date, RELAXATION_PRACTICE.reading, false);
  result.setBeforeRelaxationRatings(2, 3, at(date, '21:01:30'));
  result.completeRelaxation(at(date, '22:10:00'));
  return result;
}

function completedSleepCheckCycle(date: string): EveningCycle {
  const completed = sleepCheckCycle(date);
  completed.setAfterRelaxationRatings(4, 5, at(date, '22:11:00'));
  completed.answerSleepCheckQuestion(
    SLEEP_CHECK_QUESTION.calmMind,
    SLEEP_CHECK_ANSWER.yes,
    at(date, '22:12:00'),
  );
  completed.answerSleepCheckQuestion(
    SLEEP_CHECK_QUESTION.holdingThought,
    SLEEP_CHECK_ANSWER.yes,
    at(date, '22:13:00'),
  );
  completed.answerSleepCheckQuestion(
    SLEEP_CHECK_QUESTION.readyForSleep,
    SLEEP_CHECK_ANSWER.yes,
    at(date, '22:14:00'),
  );
  completed.chooseSleepCheckCorrectiveAction(
    SLEEP_CHECK_QUESTION.holdingThought,
    'CAPTURE_THOUGHT',
    at(date, '22:15:00'),
  );
  completed.completeSleepCheckCorrectiveAction(
    SLEEP_CHECK_QUESTION.holdingThought,
    'Вернуться к смете завтра',
    at(date, '22:16:00'),
  );
  completed.retrySleepCheckQuestion(
    SLEEP_CHECK_QUESTION.holdingThought,
    SLEEP_CHECK_ANSWER.no,
    at(date, '22:17:00'),
  );
  completed.completeSleepCheck(at(date, '22:18:00'));
  return completed;
}

function relaxationRecord(date: string) {
  return {
    defaultPractice: RELAXATION_PRACTICE.reading,
    selectedPractice: RELAXATION_PRACTICE.reading,
    defaultChangedForFuture: false,
    practiceDurationMinutes: 15,
    drinkCompletedAt: null,
    hygieneCompletedAt: null,
    practiceTimerStartedAt: null,
    practiceCompletedAt: null,
    screenFreeDurationMinutes: 25,
    screenFreeState: SCREEN_FREE_STATE.pending,
    screenFreeStartedAt: null,
    screenFreeSkippedAt: null,
    screenFreeCompletedAt: null,
    createdAt: `${date}T21:00:00.000Z`,
    updatedAt: `${date}T21:00:00.000Z`,
  };
}

function at(date: string, time: string): Date {
  return new Date(`${date}T${time}.000Z`);
}
