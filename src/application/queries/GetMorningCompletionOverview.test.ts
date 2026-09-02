import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  EXERCISE_MEASUREMENT_TYPE,
  MORNING_PHYSICAL_STATUS,
  MorningCycle,
} from '../../domain';
import {
  MORNING_COMPLETION_STATUS,
  GetMorningCompletionOverview,
} from './GetMorningCompletionOverview';

const DATE = DayDate.create('2026-08-23');

describe('GetMorningCompletionOverview', () => {
  it('агрегирует реальные подходы MOR-03, паузы, время утра и главное действие', async () => {
    const cycle = createExecutedCycle();
    const query = new GetMorningCompletionOverview(
      { findByDateKey: async () => cycle },
      {
        execute: async () => ({
          decisionId: EntityId.create('decision-main'),
          decisionTitle: 'Подготовить релиз',
          expectedResult: 'Стабильная сборка',
          firstStepId: EntityId.create('action-first'),
          firstStepTitle: 'Проверить critical path',
          scheduledTime: '08:00–09:30',
          completed: false,
          ready: true,
          candidates: [],
        }),
      },
    );

    const overview = await query.execute(DATE);

    expect(overview).toMatchObject({
      status: MORNING_COMPLETION_STATUS.ready,
      canStartWorkBlock: true,
      startedAt: at('07:12'),
      completedAt: at('07:30'),
      durationMs: 18 * 60_000,
      quickStart: { waterCompleted: true, coldShower: 'completed' },
      physical: {
        skipped: false,
        exerciseCount: 2,
        completedSets: 2,
        totalRepetitions: 12,
        totalDurationSeconds: 45,
        sessionDurationMs: 6 * 60_000,
      },
      mainAction: {
        title: 'Подготовить релиз',
        scheduledTime: '08:00–09:30',
        expectedResult: 'Стабильная сборка',
        firstStepTitle: 'Проверить critical path',
        status: 'ready',
      },
    });
  });

  it('показывает partial_allowed только для реального разрешённого пропуска', async () => {
    const cycle = MorningCycle.rehydrate({
      id: EntityId.create('partial-cycle'),
      dayId: EntityId.create('partial-day'),
      dateKey: DATE,
      state: 'READY_TO_WORK',
      startedAt: at('07:12'),
      finishedAt: null,
      shortenedMode: true,
      stageStates: [
        { stageId: 'quick_start.cold_shower', status: 'SKIPPED', updatedAt: at('07:14') },
        { stageId: 'main_action.selection', status: 'SKIPPED', updatedAt: at('07:20') },
      ],
      waterCompletedAt: at('07:13'),
      waterAmountMl: 250,
      physicalStatus: MORNING_PHYSICAL_STATUS.skipped,
      physicalUpdatedAt: at('07:18'),
      updatedAt: at('07:20'),
      version: 6,
    });
    const query = new GetMorningCompletionOverview(
      { findByDateKey: async () => cycle },
      { execute: async () => emptyMainAction() },
    );

    const overview = await query.execute(DATE);

    expect(overview?.status).toBe(MORNING_COMPLETION_STATUS.partialAllowed);
    expect(overview?.mainAction.status).toBe('skipped');
    expect(overview?.physical.skipped).toBe(true);
  });
});

function createExecutedCycle(): MorningCycle {
  const cycle = MorningCycle.create({
    id: EntityId.create('cycle'),
    dayId: EntityId.create('day'),
    dateKey: DATE,
    occurredAt: at('06:50'),
  });
  cycle.start(at('07:12'));
  cycle.completeWater(at('07:13'), 250);
  cycle.completeColdShower(at('07:14'));
  cycle.selectPhysicalExercise(
    EntityId.create('push-ups'),
    EXERCISE_MEASUREMENT_TYPE.repetitions,
    at('07:15'),
  );
  cycle.adjustPhysicalExercise(
    EntityId.create('push-ups'),
    { field: 'sets', delta: -1 },
    at('07:15'),
  );
  cycle.adjustPhysicalExercise(
    EntityId.create('push-ups'),
    { field: 'sets', delta: -1 },
    at('07:15'),
  );
  cycle.selectPhysicalExercise(
    EntityId.create('plank'),
    EXERCISE_MEASUREMENT_TYPE.duration,
    at('07:15'),
  );
  cycle.adjustPhysicalExercise(EntityId.create('plank'), { field: 'sets', delta: -1 }, at('07:15'));
  cycle.adjustPhysicalExercise(EntityId.create('plank'), { field: 'sets', delta: -1 }, at('07:15'));
  cycle.startPhysicalExecution(at('07:16'));
  cycle.completePhysicalSet(
    EntityId.create('push-ups'),
    1,
    { measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions, actualReps: 12 },
    at('07:18'),
  );
  cycle.advancePhysicalExecution(at('07:18'));
  cycle.pausePhysicalExecution(at('07:19'));
  cycle.resumePhysicalExecution(at('07:21'));
  cycle.completePhysicalSet(
    EntityId.create('plank'),
    1,
    { measurementType: EXERCISE_MEASUREMENT_TYPE.duration, actualDurationSeconds: 45 },
    at('07:23'),
  );
  cycle.completePhysicalExecution(at('07:24'));
  cycle.markReadyToWork(true, at('07:30'));
  return cycle;
}

function emptyMainAction() {
  return {
    decisionId: null,
    decisionTitle: null,
    expectedResult: null,
    firstStepId: null,
    firstStepTitle: null,
    scheduledTime: null,
    completed: false,
    ready: false,
    candidates: [],
  } as const;
}

function at(time: string): Date {
  return new Date(`2026-08-23T${time}:00.000+09:00`);
}
