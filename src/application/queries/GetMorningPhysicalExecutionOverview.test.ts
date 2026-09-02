import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  EXERCISE_DEFINITION_SOURCE,
  EXERCISE_MEASUREMENT_TYPE,
  ExerciseDefinition,
  MORNING_CYCLE_STATE,
  MORNING_PHYSICAL_STATUS,
  MorningCycle,
  type MorningPhysicalPlanItem,
} from '../../domain';
import {
  InMemoryExerciseDefinitionRepository,
  InMemoryMorningCycleRepository,
} from '../../infrastructure';
import { FakeClock, FakeCurrentDateProvider } from '../../test/helpers/Fakes';
import {
  GetMorningPhysicalExecutionOverview,
  MORNING_PHYSICAL_EXECUTION_VIEW_STATE,
  resolveMorningPhysicalExecutionOverview,
} from './GetMorningPhysicalExecutionOverview';

const TODAY = DayDate.create('2026-08-28');
const YESTERDAY = DayDate.create('2026-08-27');
const PLAN: readonly MorningPhysicalPlanItem[] = [
  {
    exerciseDefinitionId: EntityId.create('push-ups'),
    measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
    sets: 2,
    targetReps: 10,
  },
  {
    exerciseDefinitionId: EntityId.create('plank'),
    measurementType: EXERCISE_MEASUREMENT_TYPE.duration,
    sets: 3,
    targetDurationSeconds: 30,
  },
];

describe('GetMorningPhysicalExecutionOverview', () => {
  it('разрешает все публичные состояния выполнения', () => {
    const running = runningCycle();
    const paused = runningCycle();
    paused.pausePhysicalExecution(at('07:03'));
    const awaitingAdvance = runningCycle();
    awaitingAdvance.completePhysicalSet(
      EntityId.create('push-ups'),
      1,
      { measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions, actualReps: 14 },
      at('07:02'),
    );
    const readyToFinish = resolvedCycle();
    const completed = resolvedCycle();
    completed.completePhysicalExecution(at('07:10'));

    const scenarios = [
      [readyCycle(), MORNING_PHYSICAL_EXECUTION_VIEW_STATE.unavailable],
      [
        legacyCycle(MORNING_PHYSICAL_STATUS.inProgress, PLAN),
        MORNING_PHYSICAL_EXECUTION_VIEW_STATE.recoverable,
      ],
      [
        legacyCycle(MORNING_PHYSICAL_STATUS.inProgress, []),
        MORNING_PHYSICAL_EXECUTION_VIEW_STATE.unrecoverable,
      ],
      [running, MORNING_PHYSICAL_EXECUTION_VIEW_STATE.running],
      [paused, MORNING_PHYSICAL_EXECUTION_VIEW_STATE.paused],
      [awaitingAdvance, MORNING_PHYSICAL_EXECUTION_VIEW_STATE.awaitingAdvance],
      [readyToFinish, MORNING_PHYSICAL_EXECUTION_VIEW_STATE.readyToFinish],
      [completed, MORNING_PHYSICAL_EXECUTION_VIEW_STATE.completed],
      [
        legacyCycle(MORNING_PHYSICAL_STATUS.done),
        MORNING_PHYSICAL_EXECUTION_VIEW_STATE.legacyCompleted,
      ],
      [
        legacyCycle(MORNING_PHYSICAL_STATUS.skipped),
        MORNING_PHYSICAL_EXECUTION_VIEW_STATE.legacyCompleted,
      ],
    ] as const;

    expect(scenarios.map(([cycle]) => resolve(cycle).state)).toEqual(
      scenarios.map(([, state]) => state),
    );
  });

  it('возвращает immutable current set с планом, фактом и 1-based позициями', () => {
    const cycle = runningCycle();
    cycle.completePhysicalSet(
      EntityId.create('push-ups'),
      1,
      { measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions, actualReps: 14 },
      at('07:02'),
    );

    const overview = resolve(cycle);

    expect(overview.currentSet).toMatchObject({
      exerciseDefinitionId: EntityId.create('push-ups'),
      name: 'Отжимания',
      exerciseIndex: 1,
      exerciseCount: 2,
      setNumber: 1,
      setCount: 2,
      globalSetIndex: 1,
      globalSetCount: 5,
      measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
      targetReps: 10,
      status: 'COMPLETED',
      actualReps: 14,
      resolvedAt: at('07:02'),
    });
    expect(overview.canAdvance).toBe(true);
    expect(overview.canResolve).toBe(false);
    expect(Object.isFrozen(overview)).toBe(true);
    expect(Object.isFrozen(overview.currentSet)).toBe(true);
  });

  it('считает только реальные результаты и фиксирует elapsed на pause и completion', () => {
    const paused = runningCycle();
    paused.pausePhysicalExecution(at('07:03'));
    const pausedOverview = resolve(paused, TODAY, at('07:20'));
    expect(pausedOverview.workedDurationMs).toBe(3 * 60_000);
    expect(pausedOverview.canResume).toBe(true);
    expect(pausedOverview.canResolve).toBe(false);

    const completed = resolvedCycle();
    completed.completePhysicalExecution(at('07:10'));
    const completedOverview = resolve(completed, TODAY, at('08:00'));
    expect(completedOverview).toMatchObject({
      workedDurationMs: 10 * 60_000,
      selectedExerciseCount: 2,
      totalSets: 5,
      resolvedSets: 5,
      completedSets: 3,
      skippedSets: 2,
      totalActualReps: 14,
      totalActualDurationSeconds: 75,
      canPause: false,
      canFinish: false,
    });
  });

  it('разрешает финальное завершение на паузе после последнего resolved set', () => {
    const cycle = resolvedCycle();
    cycle.pausePhysicalExecution(at('07:10'));

    const overview = resolve(cycle, TODAY, at('07:20'));

    expect(overview.state).toBe(MORNING_PHYSICAL_EXECUTION_VIEW_STATE.paused);
    expect(overview.canFinish).toBe(true);
    expect(overview.canAdvance).toBe(false);
    expect(overview.canResolve).toBe(false);
  });

  it('отдаёт 1-based позиции второго упражнения и защитную копию resolvedAt', () => {
    const cycle = resolvedCycle();

    const first = resolve(cycle);
    expect(first.currentSet).toMatchObject({
      exerciseIndex: 2,
      exerciseCount: 2,
      setNumber: 3,
      setCount: 3,
      globalSetIndex: 5,
      globalSetCount: 5,
      resolvedAt: at('07:09'),
    });
    first.currentSet?.resolvedAt?.setUTCFullYear(2000);

    expect(resolve(cycle).currentSet?.resolvedAt).toEqual(at('07:09'));
  });

  it('отключает mutation capabilities для исторической даты', () => {
    const overview = resolve(runningCycle(YESTERDAY), YESTERDAY, at('07:05'));

    expect(overview.mutable).toBe(false);
    expect(overview.canRecover).toBe(false);
    expect(overview.canPause).toBe(false);
    expect(overview.canResume).toBe(false);
    expect(overview.canResolve).toBe(false);
    expect(overview.canAdvance).toBe(false);
    expect(overview.canFinish).toBe(false);
  });

  it('читает cycle и все definitions через repository-backed запрос', async () => {
    const cycle = runningCycle();
    const cycles = new InMemoryMorningCycleRepository();
    await cycles.createIfAbsent(cycle);
    const query = new GetMorningPhysicalExecutionOverview(
      cycles,
      new InMemoryExerciseDefinitionRepository(definitions()),
      new FakeCurrentDateProvider(TODAY),
      new FakeClock(at('07:05')),
    );

    const overview = await query.execute(TODAY);

    expect(overview.state).toBe(MORNING_PHYSICAL_EXECUTION_VIEW_STATE.running);
    expect(overview.workedDurationMs).toBe(5 * 60_000);
    expect(overview.currentSet?.name).toBe('Отжимания');
  });

  it('разрешает архивное определение, но отклоняет отсутствующее или несовместимое', () => {
    const archived = definitions();
    archived[0]!.archive(at('06:50'));
    expect(() => resolve(runningCycle(), TODAY, at('07:05'), archived)).not.toThrow();

    expect(() => resolve(runningCycle(), TODAY, at('07:05'), archived.slice(1))).toThrowError(
      'План физической активации ссылается на отсутствующее упражнение.',
    );
    const mismatched = [
      definition('push-ups', 'Отжимания', EXERCISE_MEASUREMENT_TYPE.duration),
      archived[1]!,
    ];
    expect(() => resolve(runningCycle(), TODAY, at('07:05'), mismatched)).toThrowError(
      'План физической активации ссылается на отсутствующее упражнение.',
    );
  });
});

function resolve(
  cycle: MorningCycle,
  date = TODAY,
  now = at('07:20'),
  availableDefinitions = definitions(),
) {
  return resolveMorningPhysicalExecutionOverview({
    date,
    currentDate: TODAY,
    cycle,
    definitions: availableDefinitions,
    now,
  });
}

function readyCycle(date = TODAY): MorningCycle {
  return MorningCycle.rehydrate({
    id: EntityId.create(`cycle-${date.toString()}`),
    dayId: EntityId.create(`day-${date.toString()}`),
    dateKey: date,
    state: MORNING_CYCLE_STATE.inProgress,
    startedAt: atFor(date, '06:55'),
    finishedAt: null,
    shortenedMode: false,
    stageStates: [],
    waterCompletedAt: null,
    waterAmountMl: null,
    physicalStatus: MORNING_PHYSICAL_STATUS.ready,
    physicalUpdatedAt: atFor(date, '06:59'),
    physicalPlanItems: PLAN,
    physicalExecution: null,
    updatedAt: atFor(date, '06:59'),
    version: 2,
  });
}

function legacyCycle(
  status:
    | typeof MORNING_PHYSICAL_STATUS.inProgress
    | typeof MORNING_PHYSICAL_STATUS.done
    | typeof MORNING_PHYSICAL_STATUS.skipped,
  plan: readonly MorningPhysicalPlanItem[] = [],
): MorningCycle {
  return MorningCycle.rehydrate({
    id: EntityId.create(`legacy-${status}`),
    dayId: EntityId.create(`legacy-day-${status}`),
    dateKey: TODAY,
    state: MORNING_CYCLE_STATE.inProgress,
    startedAt: at('06:55'),
    finishedAt: null,
    shortenedMode: false,
    stageStates: [],
    waterCompletedAt: null,
    waterAmountMl: null,
    physicalStatus: status,
    physicalUpdatedAt: at('07:00'),
    physicalPlanItems: plan,
    physicalExecution: null,
    updatedAt: at('07:00'),
    version: 3,
  });
}

function runningCycle(date = TODAY): MorningCycle {
  const cycle = readyCycle(date);
  cycle.startPhysicalExecution(atFor(date, '07:00'));
  return cycle;
}

function resolvedCycle(): MorningCycle {
  const cycle = runningCycle();
  cycle.completePhysicalSet(
    EntityId.create('push-ups'),
    1,
    { measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions, actualReps: 14 },
    at('07:01'),
  );
  cycle.advancePhysicalExecution(at('07:02'));
  cycle.skipPhysicalSet(EntityId.create('push-ups'), 2, at('07:03'));
  cycle.advancePhysicalExecution(at('07:04'));
  cycle.completePhysicalSet(
    EntityId.create('plank'),
    1,
    { measurementType: EXERCISE_MEASUREMENT_TYPE.duration, actualDurationSeconds: 30 },
    at('07:05'),
  );
  cycle.advancePhysicalExecution(at('07:06'));
  cycle.skipPhysicalSet(EntityId.create('plank'), 2, at('07:07'));
  cycle.advancePhysicalExecution(at('07:08'));
  cycle.completePhysicalSet(
    EntityId.create('plank'),
    3,
    { measurementType: EXERCISE_MEASUREMENT_TYPE.duration, actualDurationSeconds: 45 },
    at('07:09'),
  );
  return cycle;
}

function definitions(): ExerciseDefinition[] {
  return [
    definition('push-ups', 'Отжимания', EXERCISE_MEASUREMENT_TYPE.repetitions),
    definition('plank', 'Планка', EXERCISE_MEASUREMENT_TYPE.duration),
  ];
}

function definition(
  id: string,
  name: string,
  measurementType:
    typeof EXERCISE_MEASUREMENT_TYPE.repetitions | typeof EXERCISE_MEASUREMENT_TYPE.duration,
): ExerciseDefinition {
  return ExerciseDefinition.create({
    id: EntityId.create(id),
    name,
    measurementType,
    source: EXERCISE_DEFINITION_SOURCE.system,
    occurredAt: at('06:00'),
  });
}

function at(hhmm: string): Date {
  return atFor(TODAY, hhmm);
}

function atFor(date: DayDate, hhmm: string): Date {
  return new Date(`${date.toString()}T${hhmm}:00.000+09:00`);
}
