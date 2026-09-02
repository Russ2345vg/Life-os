import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  EXERCISE_MEASUREMENT_TYPE,
  MORNING_CYCLE_STATE,
  MORNING_PHYSICAL_STATUS,
  MORNING_PHYSICAL_SET_STATUS,
  MORNING_SHORTENED_ACTION,
  MORNING_SHORTENED_MODE_STATE,
  MORNING_STAGE_ID,
  MORNING_STAGE_STATUS,
  MorningCycle,
} from '../../../domain';
import { MorningCycleRecordMapper } from './MorningCycleRecordMapper';

const STARTED_AT = new Date('2026-08-23T22:12:00.000Z');
const UPDATED_AT = new Date('2026-08-23T22:20:00.000Z');
const EXECUTION_STARTED_AT = new Date('2026-08-23T22:21:00.000Z');
const FIRST_RESULT_AT = new Date('2026-08-23T22:22:00.000Z');
const ADVANCED_AT = new Date('2026-08-23T22:23:00.000Z');
const PAUSED_AT = new Date('2026-08-23T22:24:00.000Z');
const SECOND_RESULT_AT = new Date('2026-08-23T22:25:00.000Z');
const COMPLETED_AT = new Date('2026-08-23T22:26:00.000Z');

describe('MorningCycleRecordMapper', () => {
  it('round-trip сохраняет состояние перед стартом, а legacy-запись оставляет пустой', () => {
    const cycle = MorningCycle.create({
      id: EntityId.create('start-state-cycle'),
      dayId: EntityId.create('start-state-day'),
      dateKey: DayDate.create('2026-08-24'),
      occurredAt: new Date('2026-08-23T21:50:00.000Z'),
    });
    cycle.recordStartState({ energy: 6, clarity: 7, mood: 'спокойный' }, STARTED_AT);

    const record = MorningCycleRecordMapper.toRecord(cycle);
    const restored = MorningCycleRecordMapper.fromRecord(record);

    expect(record.startState).toEqual({
      energy: 6,
      clarity: 7,
      mood: 'спокойный',
      recordedAt: STARTED_AT.toISOString(),
    });
    expect(restored.startState).toEqual({
      energy: 6,
      clarity: 7,
      mood: 'спокойный',
      recordedAt: STARTED_AT,
    });
  });

  it('round-trip сохраняет running execution с pending repetition и duration подходами', () => {
    const cycle = createExecutionCycle();

    const record = MorningCycleRecordMapper.toRecord(cycle);
    const restored = MorningCycleRecordMapper.fromRecord(record);
    const executionRecord = record.physicalExecution;

    expect(executionRecord).toMatchObject({
      startedAt: EXECUTION_STARTED_AT.toISOString(),
      completedAt: null,
      pausedAt: null,
      pauseIntervals: [],
      activeSetIndex: 0,
    });
    expect(executionRecord?.sets[0]).toMatchObject({
      measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
      status: MORNING_PHYSICAL_SET_STATUS.pending,
      actualReps: null,
      resolvedAt: null,
    });
    expect(executionRecord?.sets[0]).not.toHaveProperty('actualDurationSeconds');
    expect(executionRecord?.sets[1]).toMatchObject({
      measurementType: EXERCISE_MEASUREMENT_TYPE.duration,
      status: MORNING_PHYSICAL_SET_STATUS.pending,
      actualDurationSeconds: null,
      resolvedAt: null,
    });
    expect(executionRecord?.sets[1]).not.toHaveProperty('actualReps');
    expect(restored.physicalExecution?.startedAt).toEqual(EXECUTION_STARTED_AT);
    expect(restored.physicalExecution?.sets).toHaveLength(2);
  });

  it('round-trip сохраняет ожидающую safe-boundary стратегию выполнения', () => {
    const cycle = createExecutionCycle();
    cycle.activateShortened(
      {
        coldShower: MORNING_SHORTENED_ACTION.keep,
        physical: MORNING_SHORTENED_ACTION.shorten,
        mirror: MORNING_SHORTENED_ACTION.keep,
      },
      new Date('2026-08-23T22:21:30.000Z'),
    );

    const record = MorningCycleRecordMapper.toRecord(cycle);
    const restored = MorningCycleRecordMapper.fromRecord(record);

    expect(record.physicalExecution).toMatchObject({
      suppressedSetIndexes: [],
      pendingRemainingSetStrategy: 'shorten',
    });
    expect(restored.physicalExecution?.pendingRemainingSetStrategy).toBe('shorten');
  });

  it('round-trip сохраняет paused execution после продвижения', () => {
    const cycle = createExecutionCycle();
    cycle.completePhysicalSet(
      EntityId.create('push-ups'),
      1,
      { measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions, actualReps: 14 },
      FIRST_RESULT_AT,
    );
    cycle.advancePhysicalExecution(ADVANCED_AT);
    cycle.pausePhysicalExecution(PAUSED_AT);

    const restored = MorningCycleRecordMapper.fromRecord(MorningCycleRecordMapper.toRecord(cycle));

    expect(restored.physicalExecution?.activeSetIndex).toBe(1);
    expect(restored.physicalExecution?.pausedAt).toEqual(PAUSED_AT);
    expect(restored.physicalExecution?.sets[0]).toMatchObject({
      status: MORNING_PHYSICAL_SET_STATUS.completed,
      actualReps: 14,
      resolvedAt: FIRST_RESULT_AT,
    });
  });

  it('round-trip сохраняет результат и паузу с одинаковой меткой времени', () => {
    const cycle = createExecutionCycle();
    cycle.completePhysicalSet(
      EntityId.create('push-ups'),
      1,
      { measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions, actualReps: 14 },
      FIRST_RESULT_AT,
    );
    cycle.pausePhysicalExecution(FIRST_RESULT_AT);

    const restored = MorningCycleRecordMapper.fromRecord(MorningCycleRecordMapper.toRecord(cycle));

    expect(restored.physicalExecution?.pausedAt).toEqual(FIRST_RESULT_AT);
    expect(restored.physicalExecution?.sets[0]).toMatchObject({
      status: MORNING_PHYSICAL_SET_STATUS.completed,
      actualReps: 14,
      resolvedAt: FIRST_RESULT_AT,
    });
  });

  it('round-trip сохраняет resolved execution до ручного продвижения', () => {
    const cycle = createExecutionCycle();
    cycle.completePhysicalSet(
      EntityId.create('push-ups'),
      1,
      { measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions, actualReps: 14 },
      FIRST_RESULT_AT,
    );

    const record = MorningCycleRecordMapper.toRecord(cycle);
    const restored = MorningCycleRecordMapper.fromRecord(record);

    expect(record.physicalExecution?.activeSetIndex).toBe(0);
    expect(record.physicalExecution?.sets[0]).toMatchObject({
      status: MORNING_PHYSICAL_SET_STATUS.completed,
      actualReps: 14,
      resolvedAt: FIRST_RESULT_AT.toISOString(),
    });
    expect(record.physicalExecution?.sets[0]).not.toHaveProperty('actualDurationSeconds');
    expect(restored.physicalExecution?.currentSet.status).toBe(
      MORNING_PHYSICAL_SET_STATUS.completed,
    );
  });

  it('round-trip сохраняет completed execution и skipped подход без actual-полей', () => {
    const cycle = createExecutionCycle();
    cycle.skipPhysicalSet(EntityId.create('push-ups'), 1, FIRST_RESULT_AT);
    cycle.advancePhysicalExecution(ADVANCED_AT);
    cycle.completePhysicalSet(
      EntityId.create('plank'),
      1,
      { measurementType: EXERCISE_MEASUREMENT_TYPE.duration, actualDurationSeconds: 42 },
      SECOND_RESULT_AT,
    );
    cycle.completePhysicalExecution(COMPLETED_AT);

    const record = MorningCycleRecordMapper.toRecord(cycle);
    const restored = MorningCycleRecordMapper.fromRecord(record);

    expect(record.physicalExecution?.completedAt).toBe(COMPLETED_AT.toISOString());
    expect(record.physicalExecution?.sets[0]).toMatchObject({
      status: MORNING_PHYSICAL_SET_STATUS.skipped,
      resolvedAt: FIRST_RESULT_AT.toISOString(),
    });
    expect(record.physicalExecution?.sets[0]).not.toHaveProperty('actualReps');
    expect(record.physicalExecution?.sets[0]).not.toHaveProperty('actualDurationSeconds');
    expect(record.physicalExecution?.sets[1]).toMatchObject({
      status: MORNING_PHYSICAL_SET_STATUS.completed,
      actualDurationSeconds: 42,
    });
    expect(record.physicalExecution?.sets[1]).not.toHaveProperty('actualReps');
    expect(restored.physicalExecution?.completedAt).toEqual(COMPLETED_AT);
  });

  it('сохраняет и восстанавливает lifecycle, shortened marker и этапы', () => {
    const cycle = MorningCycle.rehydrate({
      id: EntityId.create('cycle'),
      dayId: EntityId.create('day'),
      dateKey: DayDate.create('2026-08-24'),
      state: MORNING_CYCLE_STATE.readyToWork,
      startedAt: STARTED_AT,
      finishedAt: null,
      shortenedMode: true,
      shortenedModeState: MORNING_SHORTENED_MODE_STATE.shortenedActive,
      shortenedConfiguration: {
        coldShower: MORNING_SHORTENED_ACTION.keep,
        physical: MORNING_SHORTENED_ACTION.skip,
        mirror: MORNING_SHORTENED_ACTION.keep,
      },
      stageStates: [
        {
          stageId: MORNING_STAGE_ID.coldShower,
          status: MORNING_STAGE_STATUS.completed,
          updatedAt: UPDATED_AT,
        },
        {
          stageId: MORNING_STAGE_ID.mirror,
          status: MORNING_STAGE_STATUS.completed,
          updatedAt: UPDATED_AT,
        },
      ],
      waterCompletedAt: UPDATED_AT,
      waterAmountMl: 250,
      physicalStatus: MORNING_PHYSICAL_STATUS.skipped,
      physicalUpdatedAt: UPDATED_AT,
      physicalPlanItems: [
        {
          exerciseDefinitionId: EntityId.create('push-ups'),
          measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
          sets: 4,
          targetReps: 12,
        },
        {
          exerciseDefinitionId: EntityId.create('plank'),
          measurementType: EXERCISE_MEASUREMENT_TYPE.duration,
          sets: 3,
          targetDurationSeconds: 45,
        },
      ],
      updatedAt: UPDATED_AT,
      version: 5,
    });

    const record = MorningCycleRecordMapper.toRecord(cycle);
    const restored = MorningCycleRecordMapper.fromRecord(record);

    expect(record).toMatchObject({
      schemaVersion: 1,
      state: MORNING_CYCLE_STATE.readyToWork,
      finishedAt: null,
      shortenedMode: true,
      shortenedModeState: MORNING_SHORTENED_MODE_STATE.shortenedActive,
      shortenedConfiguration: {
        coldShower: MORNING_SHORTENED_ACTION.keep,
        physical: MORNING_SHORTENED_ACTION.skip,
        mirror: MORNING_SHORTENED_ACTION.keep,
      },
      stageStates: [
        {
          stageId: MORNING_STAGE_ID.coldShower,
          status: MORNING_STAGE_STATUS.completed,
          updatedAt: UPDATED_AT.toISOString(),
        },
        {
          stageId: MORNING_STAGE_ID.mirror,
          status: MORNING_STAGE_STATUS.completed,
          updatedAt: UPDATED_AT.toISOString(),
        },
      ],
    });
    expect(restored.state).toBe(MORNING_CYCLE_STATE.readyToWork);
    expect(restored.shortenedMode).toBe(true);
    expect(restored.shortenedModeState).toBe(MORNING_SHORTENED_MODE_STATE.shortenedActive);
    expect(restored.shortenedConfiguration?.physical).toBe(MORNING_SHORTENED_ACTION.skip);
    expect(restored.stageStates).toEqual([
      {
        stageId: MORNING_STAGE_ID.coldShower,
        status: MORNING_STAGE_STATUS.completed,
        updatedAt: UPDATED_AT,
      },
      {
        stageId: MORNING_STAGE_ID.mirror,
        status: MORNING_STAGE_STATUS.completed,
        updatedAt: UPDATED_AT,
      },
    ]);
    expect(restored.physicalPlanItems).toEqual([
      {
        exerciseDefinitionId: EntityId.create('push-ups'),
        measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
        sets: 4,
        targetReps: 12,
      },
      {
        exerciseDefinitionId: EntityId.create('plank'),
        measurementType: EXERCISE_MEASUREMENT_TYPE.duration,
        sets: 3,
        targetDurationSeconds: 45,
      },
    ]);
  });

  it.each([
    ['отсутствующие поля', {}],
    [
      'null в новых nullable-полях',
      { state: null, finishedAt: null, shortenedMode: null, stageStates: null },
    ],
  ])('безопасно читает legacy-запись: %s', (_label, additions) => {
    const restored = MorningCycleRecordMapper.fromRecord({
      schemaVersion: 1,
      id: 'legacy-cycle',
      dayId: 'legacy-day',
      dateKey: '2026-08-24',
      startedAt: STARTED_AT.toISOString(),
      waterCompletedAt: null,
      waterAmountMl: null,
      physicalStatus: MORNING_PHYSICAL_STATUS.notConfigured,
      physicalUpdatedAt: null,
      updatedAt: UPDATED_AT.toISOString(),
      version: 2,
      ...additions,
    });

    expect(restored.state).toBe(MORNING_CYCLE_STATE.inProgress);
    expect(restored.finishedAt).toBeNull();
    expect(restored.shortenedMode).toBe(false);
    expect(restored.stageStates).toEqual([]);
    expect(restored.physicalPlanItems).toEqual([]);
    expect(restored.startState).toBeNull();
  });

  it('восстанавливает legacy-запись без startedAt как NOT_STARTED', () => {
    const restored = MorningCycleRecordMapper.fromRecord({
      schemaVersion: 1,
      id: 'legacy-cycle',
      dayId: 'legacy-day',
      dateKey: '2026-08-24',
      startedAt: null,
      waterCompletedAt: null,
      waterAmountMl: null,
      physicalStatus: MORNING_PHYSICAL_STATUS.notConfigured,
      physicalUpdatedAt: null,
      updatedAt: UPDATED_AT.toISOString(),
      version: 1,
    });

    expect(restored.state).toBe(MORNING_CYCLE_STATE.notStarted);
  });

  it('отклоняет неизвестные lifecycle и stage statuses', () => {
    const valid = MorningCycleRecordMapper.toRecord(
      MorningCycle.create({
        id: EntityId.create('cycle'),
        dayId: EntityId.create('day'),
        dateKey: DayDate.create('2026-08-24'),
        occurredAt: UPDATED_AT,
      }),
    );

    expect(() => MorningCycleRecordMapper.fromRecord({ ...valid, state: 'UNKNOWN' })).toThrowError(
      'Поле state содержит неизвестное состояние.',
    );
    expect(() =>
      MorningCycleRecordMapper.fromRecord({
        ...valid,
        stageStates: [{ stageId: 'water', status: 'UNKNOWN', updatedAt: null }],
      }),
    ).toThrowError('Поле stageStates содержит неизвестное состояние этапа.');
  });

  it.each([
    [
      'неизвестный тип измерения',
      [{ exerciseDefinitionId: 'push-ups', measurementType: 'UNKNOWN', sets: 3, targetReps: 10 }],
    ],
    [
      'несовместимую цель',
      [
        {
          exerciseDefinitionId: 'push-ups',
          measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
          sets: 3,
          targetReps: 10,
          targetDurationSeconds: 30,
        },
      ],
    ],
    [
      'повтор определения',
      [
        {
          exerciseDefinitionId: 'push-ups',
          measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
          sets: 3,
          targetReps: 10,
        },
        {
          exerciseDefinitionId: 'push-ups',
          measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
          sets: 2,
          targetReps: 8,
        },
      ],
    ],
  ])('отклоняет некорректный физический план: %s', (_label, physicalPlanItems) => {
    const valid = MorningCycleRecordMapper.toRecord(
      MorningCycle.create({
        id: EntityId.create('cycle'),
        dayId: EntityId.create('day'),
        dateKey: DayDate.create('2026-08-24'),
        occurredAt: UPDATED_AT,
      }),
    );

    expect(() =>
      MorningCycleRecordMapper.fromRecord({ ...valid, physicalPlanItems }),
    ).toThrowError();
  });

  it('отклоняет известные некорректные physicalExecution записи как persistence.invalid_record', () => {
    const valid = MorningCycleRecordMapper.toRecord(createExecutionCycle());
    const execution = valid.physicalExecution!;
    const repetition = execution.sets[0]!;
    const duration = execution.sets[1]!;
    const malformedExecutions: ReadonlyArray<readonly [string, unknown]> = [
      ['open pause before start', { ...execution, pausedAt: '2026-08-23T22:20:59.000Z' }],
      [
        'closed pause with reversed chronology',
        {
          ...execution,
          pauseIntervals: [
            {
              startedAt: '2026-08-23T22:22:00.000Z',
              endedAt: '2026-08-23T22:21:30.000Z',
            },
          ],
        },
      ],
      [
        'overlapping pauses',
        {
          ...execution,
          pauseIntervals: [
            {
              startedAt: '2026-08-23T22:21:10.000Z',
              endedAt: '2026-08-23T22:21:20.000Z',
            },
            {
              startedAt: '2026-08-23T22:21:15.000Z',
              endedAt: '2026-08-23T22:21:25.000Z',
            },
          ],
        },
      ],
      ['empty sets', { ...execution, sets: [] }],
      ['out-of-range active index', { ...execution, activeSetIndex: 2 }],
      ['duplicate identities', { ...execution, sets: [repetition, { ...repetition }] }],
      ['wrong set order against plan', { ...execution, sets: [duration, repetition] }],
      [
        'resolved entry after active index',
        {
          ...execution,
          sets: [
            repetition,
            {
              ...duration,
              status: MORNING_PHYSICAL_SET_STATUS.completed,
              actualDurationSeconds: 30,
              resolvedAt: FIRST_RESULT_AT.toISOString(),
            },
          ],
        },
      ],
      [
        'pending result timestamp',
        {
          ...execution,
          sets: [{ ...repetition, resolvedAt: FIRST_RESULT_AT.toISOString() }, duration],
        },
      ],
      [
        'completed null actual',
        {
          ...execution,
          sets: [
            {
              ...repetition,
              status: MORNING_PHYSICAL_SET_STATUS.completed,
              actualReps: null,
              resolvedAt: FIRST_RESULT_AT.toISOString(),
            },
            duration,
          ],
        },
      ],
      [
        'skipped actual field',
        {
          ...execution,
          sets: [
            {
              exerciseDefinitionId: repetition.exerciseDefinitionId,
              setNumber: repetition.setNumber,
              measurementType: repetition.measurementType,
              status: MORNING_PHYSICAL_SET_STATUS.skipped,
              actualReps: 5,
              resolvedAt: FIRST_RESULT_AT.toISOString(),
            },
            duration,
          ],
        },
      ],
      [
        'crossed measurement actual',
        { ...execution, sets: [{ ...repetition, actualDurationSeconds: 30 }, duration] },
      ],
      [
        'unknown set status',
        { ...execution, sets: [{ ...repetition, status: 'UNKNOWN' }, duration] },
      ],
      [
        'unknown measurement type',
        { ...execution, sets: [{ ...repetition, measurementType: 'UNKNOWN' }, duration] },
      ],
    ];

    for (const [label, physicalExecution] of malformedExecutions) {
      expectPersistenceInvalidRecord(label, { ...valid, physicalExecution });
    }
  });
});

function createExecutionCycle(): MorningCycle {
  const cycle = MorningCycle.rehydrate({
    id: EntityId.create('execution-cycle'),
    dayId: EntityId.create('execution-day'),
    dateKey: DayDate.create('2026-08-24'),
    state: MORNING_CYCLE_STATE.inProgress,
    startedAt: STARTED_AT,
    finishedAt: null,
    shortenedMode: false,
    stageStates: [],
    waterCompletedAt: null,
    waterAmountMl: null,
    physicalStatus: MORNING_PHYSICAL_STATUS.ready,
    physicalUpdatedAt: UPDATED_AT,
    physicalPlanItems: [
      {
        exerciseDefinitionId: EntityId.create('push-ups'),
        measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
        sets: 1,
        targetReps: 10,
      },
      {
        exerciseDefinitionId: EntityId.create('plank'),
        measurementType: EXERCISE_MEASUREMENT_TYPE.duration,
        sets: 1,
        targetDurationSeconds: 30,
      },
    ],
    updatedAt: UPDATED_AT,
    version: 3,
  });
  cycle.startPhysicalExecution(EXECUTION_STARTED_AT);
  return cycle;
}

function expectPersistenceInvalidRecord(label: string, record: unknown): void {
  try {
    MorningCycleRecordMapper.fromRecord(record);
  } catch (error: unknown) {
    expect(error, label).toMatchObject({ code: 'persistence.invalid_record' });
    return;
  }
  throw new Error(`Expected malformed record to fail: ${label}`);
}
