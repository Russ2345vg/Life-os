import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  EXERCISE_MEASUREMENT_TYPE,
  MORNING_CYCLE_STATE,
  MORNING_PHYSICAL_STATUS,
  MORNING_STAGE_ID,
  MORNING_STAGE_STATUS,
  MORNING_SHORTENED_ACTION,
  MorningCycle,
} from '../../domain';
import { InMemoryMorningCycleRepository } from '../../infrastructure';
import { FakeCurrentDateProvider } from '../../test/helpers/Fakes';
import {
  GetMorningCenterOverview,
  MORNING_CENTER_STAGE_ID,
  MORNING_CENTER_STAGE_STATUS,
  MORNING_COLD_SHOWER_PRESENTATION_STATUS,
  MORNING_MIRROR_PRESENTATION_STATUS,
  MORNING_WATER_PRESENTATION_STATUS,
  resolveMorningCenterOverview,
} from './GetMorningCenterOverview';

const TODAY = DayDate.create('2026-08-27');
const YESTERDAY = DayDate.create('2026-08-26');
const STARTED_AT = new Date('2026-08-27T07:00:00.000+09:00');
const UPDATED_AT = new Date('2026-08-27T07:05:00.000+09:00');

describe('GetMorningCenterOverview', () => {
  it('разрешает старт текущего утра без прошлого незавершённого запуска', () => {
    const overview = resolveMorningCenterOverview({
      date: TODAY,
      currentDate: TODAY,
      cycle: null,
      previousUnfinished: null,
    });

    expect(overview).toMatchObject({
      mutable: true,
      cycleState: null,
      canStart: true,
      canUseQuickStart: false,
      canShorten: false,
      canAbandonPrevious: false,
      shortenedMode: false,
      overallProgressPercent: 0,
      remainingMinutes: 27,
      currentStageId: MORNING_CENTER_STAGE_ID.quickStart,
      physicalPlan: { selectedCount: 0, totalSets: 0, estimatedMinutes: 0 },
      mirror: {
        status: MORNING_MIRROR_PRESENTATION_STATUS.pending,
        completedAt: null,
        canOpen: false,
        canComplete: false,
      },
      quickStart: {
        water: MORNING_WATER_PRESENTATION_STATUS.pending,
        coldShower: MORNING_COLD_SHOWER_PRESENTATION_STATUS.pending,
        resolvedCount: 0,
        total: 2,
        completed: false,
      },
    });
    expect(overview.stages.map((stage) => [stage.id, stage.status])).toEqual([
      [MORNING_CENTER_STAGE_ID.quickStart, MORNING_CENTER_STAGE_STATUS.current],
      [MORNING_CENTER_STAGE_ID.physicalActivation, MORNING_CENTER_STAGE_STATUS.upcoming],
      [MORNING_CENTER_STAGE_ID.mirror, MORNING_CENTER_STAGE_STATUS.upcoming],
      [MORNING_CENTER_STAGE_ID.mainAction, MORNING_CENTER_STAGE_STATUS.upcoming],
      [MORNING_CENTER_STAGE_ID.workBlock, MORNING_CENTER_STAGE_STATUS.upcoming],
    ]);
  });

  it('проецирует только сохранённое состояние и закрывает редактирование после Quick Start', () => {
    const cycle = MorningCycle.create({
      id: EntityId.create('state-cycle'),
      dayId: EntityId.create('state-day'),
      dateKey: TODAY,
      occurredAt: new Date('2026-08-27T06:55:00.000+09:00'),
    });
    cycle.recordStartState({ energy: 6, clarity: 7, mood: 'спокойный' }, STARTED_AT);

    const beforeStart = resolveMorningCenterOverview({
      date: TODAY,
      currentDate: TODAY,
      cycle,
      previousUnfinished: null,
    });
    expect(beforeStart.startState).toEqual({
      energy: 6,
      clarity: 7,
      mood: 'спокойный',
      recordedAt: STARTED_AT,
    });
    expect(beforeStart.canRecordStartState).toBe(true);

    cycle.start(STARTED_AT);
    cycle.completeWater(UPDATED_AT, 250);
    cycle.completeColdShower(UPDATED_AT);
    const resolved = resolveMorningCenterOverview({
      date: TODAY,
      currentDate: TODAY,
      cycle,
      previousUnfinished: null,
    });
    expect(resolved.canRecordStartState).toBe(false);
  });

  it('учитывает каждый факт Quick Start в общем прогрессе и ориентире времени', () => {
    const cycle = activeCycle('today', TODAY, STARTED_AT);
    cycle.completeWater(UPDATED_AT, 250);

    const overview = resolveMorningCenterOverview({
      date: TODAY,
      currentDate: TODAY,
      cycle,
      previousUnfinished: null,
    });

    expect(overview.overallProgressPercent).toBe(8);
    expect(overview.remainingMinutes).toBe(26);
    expect(overview.currentStageId).toBe(MORNING_CENTER_STAGE_ID.quickStart);
    expect(overview.canShorten).toBe(true);
  });

  it('выводит завершённый Quick Start из воды и completed shower', () => {
    const cycle = activeCycle('today', TODAY, STARTED_AT);
    cycle.completeWater(UPDATED_AT, 250);
    cycle.completeColdShower(UPDATED_AT);

    const overview = resolveMorningCenterOverview({
      date: TODAY,
      currentDate: TODAY,
      cycle,
      previousUnfinished: null,
    });

    expect(overview.canStart).toBe(false);
    expect(overview.canUseQuickStart).toBe(true);
    expect(overview.quickStart).toEqual({
      water: MORNING_WATER_PRESENTATION_STATUS.completed,
      coldShower: MORNING_COLD_SHOWER_PRESENTATION_STATUS.completed,
      resolvedCount: 2,
      total: 2,
      completed: true,
    });
    expect(overview.overallProgressPercent).toBe(16);
    expect(overview.remainingMinutes).toBe(22);
    expect(overview.currentStageId).toBe(MORNING_CENTER_STAGE_ID.physicalActivation);
    expect(overview.stages[0]?.status).toBe(MORNING_CENTER_STAGE_STATUS.completed);
    expect(overview.stages[1]?.status).toBe(MORNING_CENTER_STAGE_STATUS.current);
  });

  it('показывает реальную сводку плана и не считает READY выполнением физики', () => {
    const cycle = activeCycle('today', TODAY, STARTED_AT);
    cycle.completeWater(UPDATED_AT, 250);
    cycle.skipColdShower(UPDATED_AT);
    cycle.selectPhysicalExercise(
      EntityId.create('morning-exercise.push-ups'),
      EXERCISE_MEASUREMENT_TYPE.repetitions,
      UPDATED_AT,
    );
    cycle.selectPhysicalExercise(
      EntityId.create('morning-exercise.pull-ups'),
      EXERCISE_MEASUREMENT_TYPE.repetitions,
      UPDATED_AT,
    );

    const overview = resolveMorningCenterOverview({
      date: TODAY,
      currentDate: TODAY,
      cycle,
      previousUnfinished: null,
    });

    expect(overview.physicalPlan).toEqual({
      selectedCount: 2,
      totalSets: 6,
      estimatedMinutes: 12,
    });
    expect(overview.stages[1]?.estimatedMinutes).toBe(12);
    expect(overview.currentStageId).toBe(MORNING_CENTER_STAGE_ID.physicalActivation);
    expect(overview.stages[1]?.status).toBe(MORNING_CENTER_STAGE_STATUS.current);
    expect(overview.overallProgressPercent).toBe(15);
    expect(overview.remainingMinutes).toBe(24);
  });

  it('проецирует detailed IN_PROGRESS без ложного завершения physical stage', () => {
    const cycle = detailedPhysicalCycle();

    const overview = resolveMorningCenterOverview({
      date: TODAY,
      currentDate: TODAY,
      cycle,
      previousUnfinished: null,
    });

    expect(overview.physicalExecution).toEqual({
      statusText: 'Выполняется · 2 из 5 подходов',
      resolvedSets: 2,
      totalSets: 5,
      canContinue: true,
    });
    expect(overview.currentStageId).toBe(MORNING_CENTER_STAGE_ID.physicalActivation);
    expect(overview.stages[1]?.status).toBe(MORNING_CENTER_STAGE_STATUS.current);
    expect(overview.overallProgressPercent).toBe(35);

    const historical = resolveMorningCenterOverview({
      date: YESTERDAY,
      currentDate: TODAY,
      cycle: detailedPhysicalCycle(YESTERDAY),
      previousUnfinished: null,
    });
    expect(historical.physicalExecution.canContinue).toBe(false);
  });

  it('проецирует recovery legacy IN_PROGRESS без выдуманного прогресса', () => {
    const recoverable = centerLegacyPhysicalCycle(MORNING_PHYSICAL_STATUS.inProgress, true);
    const unrecoverable = centerLegacyPhysicalCycle(MORNING_PHYSICAL_STATUS.inProgress, false);

    const recoverableOverview = resolveMorningCenterOverview({
      date: TODAY,
      currentDate: TODAY,
      cycle: recoverable,
      previousUnfinished: null,
    });
    const unrecoverableOverview = resolveMorningCenterOverview({
      date: TODAY,
      currentDate: TODAY,
      cycle: unrecoverable,
      previousUnfinished: null,
    });

    expect(recoverableOverview.physicalExecution).toEqual({
      statusText: 'Требуется восстановить выполнение',
      resolvedSets: 0,
      totalSets: 2,
      canContinue: true,
    });
    expect(unrecoverableOverview.physicalExecution).toEqual({
      statusText: 'Выполнение нельзя восстановить',
      resolvedSets: 0,
      totalSets: 0,
      canContinue: false,
    });
  });

  it('после detailed DONE сохраняет факты и переводит текущий этап на главное действие', () => {
    const cycle = detailedPhysicalCycle();
    cycle.completePhysicalSet(
      EntityId.create('plank'),
      1,
      { measurementType: EXERCISE_MEASUREMENT_TYPE.duration, actualDurationSeconds: 30 },
      centerAt('07:10'),
    );
    cycle.advancePhysicalExecution(centerAt('07:11'));
    cycle.skipPhysicalSet(EntityId.create('plank'), 2, centerAt('07:12'));
    cycle.advancePhysicalExecution(centerAt('07:13'));
    cycle.completePhysicalSet(
      EntityId.create('plank'),
      3,
      { measurementType: EXERCISE_MEASUREMENT_TYPE.duration, actualDurationSeconds: 35 },
      centerAt('07:14'),
    );
    cycle.completePhysicalExecution(centerAt('07:15'));

    const overview = resolveMorningCenterOverview({
      date: TODAY,
      currentDate: TODAY,
      cycle,
      previousUnfinished: null,
    });

    expect(overview.physicalExecution).toEqual({
      statusText: null,
      resolvedSets: 5,
      totalSets: 5,
      canContinue: false,
    });
    expect(overview.currentStageId).toBe(MORNING_CENTER_STAGE_ID.mainAction);
    expect(overview.overallProgressPercent).toBe(73);
  });

  it('сохраняет legacy coarse DONE завершённым без detailed progress', () => {
    const cycle = centerLegacyPhysicalCycle(MORNING_PHYSICAL_STATUS.done, false);

    const overview = resolveMorningCenterOverview({
      date: TODAY,
      currentDate: TODAY,
      cycle,
      previousUnfinished: null,
    });

    expect(overview.physicalExecution).toEqual({
      statusText: null,
      resolvedSets: 0,
      totalSets: 0,
      canContinue: false,
    });
    expect(overview.currentStageId).toBe(MORNING_CENTER_STAGE_ID.mainAction);
    expect(overview.overallProgressPercent).toBe(73);
  });

  it('оставляет Mirror необязательным и переносит текущий этап на главное действие', () => {
    const cycle = activeCycle('today', TODAY, STARTED_AT);
    cycle.completeWater(UPDATED_AT, 250);
    cycle.skipColdShower(UPDATED_AT);
    cycle.skipPhysical(UPDATED_AT);

    const overview = resolveMorningCenterOverview({
      date: TODAY,
      currentDate: TODAY,
      cycle,
      previousUnfinished: null,
    });

    expect(overview.currentStageId).toBe(MORNING_CENTER_STAGE_ID.mainAction);
    expect(overview.stages[1]?.status).toBe(MORNING_CENTER_STAGE_STATUS.completed);
    expect(overview.stages[2]?.status).toBe(MORNING_CENTER_STAGE_STATUS.optional);
    expect(overview.stages[3]?.status).toBe(MORNING_CENTER_STAGE_STATUS.current);
    expect(overview.mirror).toEqual({
      status: MORNING_MIRROR_PRESENTATION_STATUS.pending,
      completedAt: null,
      canOpen: true,
      canComplete: true,
    });
  });

  it('показывает ready_to_work как подготовленное утро без ложного completed Mirror', () => {
    const cycle = activeCycle('today', TODAY, STARTED_AT);
    cycle.completeWater(centerAt('07:01'), 250);
    cycle.skipColdShower(centerAt('07:02'));
    cycle.skipPhysical(centerAt('07:03'));
    cycle.markReadyToWork(true, centerAt('07:04'));

    const overview = resolveMorningCenterOverview({
      date: TODAY,
      currentDate: TODAY,
      cycle,
      previousUnfinished: null,
      mainAction: {
        decisionId: EntityId.create('decision-ready'),
        decisionTitle: 'Подготовить релиз',
        expectedResult: 'Стабильная сборка',
        firstStepId: EntityId.create('first-step-ready'),
        firstStepTitle: 'Проверить critical path',
        scheduledTime: '08:00–09:30',
        completed: false,
        ready: true,
        candidates: [],
      },
    });

    expect(overview.cycleState).toBe(MORNING_CYCLE_STATE.readyToWork);
    expect(overview.currentStageId).toBe(MORNING_CENTER_STAGE_ID.workBlock);
    expect(overview.canUseQuickStart).toBe(false);
    expect(overview.stages[2]?.status).toBe(MORNING_CENTER_STAGE_STATUS.optional);
    expect(overview.stages[4]?.status).toBe(MORNING_CENTER_STAGE_STATUS.current);
  });

  it('после Mirror переводит Main Action в current и исключает время настройки', () => {
    const cycle = activeCycle('today', TODAY, STARTED_AT);
    cycle.completeWater(centerAt('07:01'), 250);
    cycle.skipColdShower(centerAt('07:02'));
    cycle.skipPhysical(centerAt('07:03'));
    const completedAt = centerAt('07:04');
    cycle.completeMirror(completedAt);

    const overview = resolveMorningCenterOverview({
      date: TODAY,
      currentDate: TODAY,
      cycle,
      previousUnfinished: null,
    });

    expect(overview.mirror).toEqual({
      status: MORNING_MIRROR_PRESENTATION_STATUS.completed,
      completedAt,
      canOpen: true,
      canComplete: false,
    });
    expect(overview.overallProgressPercent).toBe(47);
    expect(overview.remainingMinutes).toBe(7);
    expect(overview.currentStageId).toBe(MORNING_CENTER_STAGE_ID.mainAction);
    expect(overview.stages.map((stage) => stage.status)).toEqual([
      MORNING_CENTER_STAGE_STATUS.completed,
      MORNING_CENTER_STAGE_STATUS.completed,
      MORNING_CENTER_STAGE_STATUS.completed,
      MORNING_CENTER_STAGE_STATUS.current,
      MORNING_CENTER_STAGE_STATUS.upcoming,
    ]);

    overview.mirror.completedAt?.setUTCFullYear(2000);
    expect(
      resolveMorningCenterOverview({
        date: TODAY,
        currentDate: TODAY,
        cycle,
        previousUnfinished: null,
      }).mirror.completedAt,
    ).toEqual(completedAt);
  });

  it('после готовой проверки главного действия переводит Work Block в current', () => {
    const cycle = activeCycle('today', TODAY, STARTED_AT);
    cycle.completeWater(centerAt('07:01'), 250);
    cycle.skipColdShower(centerAt('07:02'));
    cycle.skipPhysical(centerAt('07:03'));
    cycle.completeMirror(centerAt('07:04'));

    const overview = resolveMorningCenterOverview({
      date: TODAY,
      currentDate: TODAY,
      cycle,
      previousUnfinished: null,
      mainAction: {
        decisionId: EntityId.create('decision'),
        decisionTitle: 'Запустить MOR-05',
        expectedResult: 'Сокращённое утро работает',
        firstStepId: EntityId.create('first-step'),
        firstStepTitle: 'Написать первый тест',
        scheduledTime: '09:00–10:00',
        completed: false,
        ready: true,
        candidates: [],
      },
    });

    expect(overview.currentStageId).toBe(MORNING_CENTER_STAGE_ID.workBlock);
    expect(overview.mainAction.ready).toBe(true);
    expect(overview.stages.map((stage) => stage.status)).toEqual([
      MORNING_CENTER_STAGE_STATUS.completed,
      MORNING_CENTER_STAGE_STATUS.completed,
      MORNING_CENTER_STAGE_STATUS.completed,
      MORNING_CENTER_STAGE_STATUS.completed,
      MORNING_CENTER_STAGE_STATUS.current,
    ]);
  });

  it('использует сокращённый сценарий и сохраняет read-only доступ', () => {
    const historical = activeCycle('historical', YESTERDAY, centerAtFor(YESTERDAY, '07:00'));
    historical.completeWater(centerAtFor(YESTERDAY, '07:01'), 250);
    historical.completeColdShower(centerAtFor(YESTERDAY, '07:02'));
    historical.skipPhysical(centerAtFor(YESTERDAY, '07:03'));
    historical.shorten(centerAtFor(YESTERDAY, '07:04'));
    historical.completeMirror(centerAtFor(YESTERDAY, '07:05'));

    const overview = resolveMorningCenterOverview({
      date: YESTERDAY,
      currentDate: TODAY,
      cycle: historical,
      previousUnfinished: null,
    });

    expect(overview.remainingMinutes).toBe(7);
    expect(overview.mirror).toMatchObject({
      status: MORNING_MIRROR_PRESENTATION_STATUS.completed,
      canOpen: true,
      canComplete: false,
    });
  });

  it('не открывает незавершённый Mirror исторического или закрытого утра', () => {
    const historical = activeCycle('historical', YESTERDAY, centerAtFor(YESTERDAY, '07:00'));
    historical.completeWater(centerAtFor(YESTERDAY, '07:01'), 250);
    historical.skipColdShower(centerAtFor(YESTERDAY, '07:02'));
    historical.skipPhysical(centerAtFor(YESTERDAY, '07:03'));
    const historicalOverview = resolveMorningCenterOverview({
      date: YESTERDAY,
      currentDate: TODAY,
      cycle: historical,
      previousUnfinished: null,
    });

    expect(historicalOverview.mirror).toEqual({
      status: MORNING_MIRROR_PRESENTATION_STATUS.pending,
      completedAt: null,
      canOpen: false,
      canComplete: false,
    });

    const terminal = activeCycle('terminal', TODAY, STARTED_AT);
    terminal.completeWater(centerAt('07:01'), 250);
    terminal.completeColdShower(centerAt('07:02'));
    terminal.skipPhysical(centerAt('07:03'));
    terminal.abandon(centerAt('07:04'));
    const terminalOverview = resolveMorningCenterOverview({
      date: TODAY,
      currentDate: TODAY,
      cycle: terminal,
      previousUnfinished: null,
    });
    expect(terminalOverview.mirror.canOpen).toBe(false);
    expect(terminalOverview.mirror.canComplete).toBe(false);
  });

  it('использует сохранённый сокращённый режим для более короткого ориентира', () => {
    const cycle = activeCycle('today', TODAY, STARTED_AT);
    cycle.shorten(UPDATED_AT);

    const overview = resolveMorningCenterOverview({
      date: TODAY,
      currentDate: TODAY,
      cycle,
      previousUnfinished: null,
    });

    expect(overview.shortenedMode).toBe(true);
    expect(overview.canShorten).toBe(false);
    expect(overview.remainingMinutes).toBe(18);
    expect(overview.stages.map((stage) => stage.estimatedMinutes)).toEqual([5, 5, 5, 5, 2]);
  });

  it('не восстанавливает осознанно пропущенный Mirror после возврата к обычному режиму', () => {
    const cycle = activeCycle('today', TODAY, STARTED_AT);
    cycle.completeWater(centerAt('07:01'), 250);
    cycle.completeColdShower(centerAt('07:02'));
    cycle.skipPhysical(centerAt('07:03'));
    cycle.activateShortened(
      {
        coldShower: MORNING_SHORTENED_ACTION.keep,
        physical: MORNING_SHORTENED_ACTION.keep,
        mirror: MORNING_SHORTENED_ACTION.skip,
      },
      centerAt('07:04'),
    );
    cycle.revertShortened(centerAt('07:05'));

    const overview = resolveMorningCenterOverview({
      date: TODAY,
      currentDate: TODAY,
      cycle,
      previousUnfinished: null,
    });

    expect(overview.mirror.status).toBe(MORNING_MIRROR_PRESENTATION_STATUS.skipped);
    expect(overview.currentStageId).toBe(MORNING_CENTER_STAGE_ID.mainAction);
    expect(overview.stages[2]?.scenarioStatus).toBe('skipped');
  });

  it('считает явный shower skip разрешённым шагом Quick Start', () => {
    const cycle = activeCycle('today', TODAY, STARTED_AT);
    cycle.completeWater(UPDATED_AT, 250);
    cycle.skipColdShower(UPDATED_AT);

    const overview = resolveMorningCenterOverview({
      date: TODAY,
      currentDate: TODAY,
      cycle,
      previousUnfinished: null,
    });

    expect(overview.quickStart.coldShower).toBe(MORNING_COLD_SHOWER_PRESENTATION_STATUS.skipped);
    expect(overview.quickStart.completed).toBe(true);
  });

  it('считает выполненный shower без воды одним разрешённым шагом', () => {
    const cycle = activeCycle('today', TODAY, STARTED_AT);
    cycle.completeColdShower(UPDATED_AT);

    const overview = resolveMorningCenterOverview({
      date: TODAY,
      currentDate: TODAY,
      cycle,
      previousUnfinished: null,
    });

    expect(overview.quickStart).toEqual({
      water: MORNING_WATER_PRESENTATION_STATUS.pending,
      coldShower: MORNING_COLD_SHOWER_PRESENTATION_STATUS.completed,
      resolvedCount: 1,
      total: 2,
      completed: false,
    });
  });

  it('блокирует новый старт до явного закрытия прошлого запуска', () => {
    const previous = activeCycle('yesterday', YESTERDAY, new Date('2026-08-26T07:00:00+09:00'));

    const overview = resolveMorningCenterOverview({
      date: TODAY,
      currentDate: TODAY,
      cycle: null,
      previousUnfinished: previous,
    });

    expect(overview.canStart).toBe(false);
    expect(overview.canAbandonPrevious).toBe(true);
    expect(overview.previousUnfinished?.date.equals(YESTERDAY)).toBe(true);
    expect(overview.previousUnfinished?.startedAt).toEqual(previous.startedAt);
  });

  it('не отдаёт recovery и команды для исторической даты', () => {
    const historical = activeCycle('historical', YESTERDAY, new Date('2026-08-26T07:00:00+09:00'));

    const overview = resolveMorningCenterOverview({
      date: YESTERDAY,
      currentDate: TODAY,
      cycle: historical,
      previousUnfinished: historical,
    });

    expect(overview.mutable).toBe(false);
    expect(overview.previousUnfinished).toBeNull();
    expect(overview.canStart).toBe(false);
    expect(overview.canUseQuickStart).toBe(false);
    expect(overview.canShorten).toBe(false);
    expect(overview.canAbandonPrevious).toBe(false);
  });

  it('не предлагает mutating-команды для terminal цикла текущей даты', () => {
    const terminal = activeCycle('terminal', TODAY, STARTED_AT);
    terminal.abandon(UPDATED_AT);

    const overview = resolveMorningCenterOverview({
      date: TODAY,
      currentDate: TODAY,
      cycle: terminal,
      previousUnfinished: null,
    });

    expect(overview.cycleState).toBe(MORNING_CYCLE_STATE.abandoned);
    expect(overview.canStart).toBe(false);
    expect(overview.canUseQuickStart).toBe(false);
  });

  it('читает текущий и предыдущий цикл через один repository-backed запрос', async () => {
    const repository = new InMemoryMorningCycleRepository();
    const previous = activeCycle('previous', YESTERDAY, new Date('2026-08-26T07:00:00+09:00'));
    const current = activeCycle('current', TODAY, STARTED_AT);
    current.completeWater(UPDATED_AT, 250);
    await repository.createIfAbsent(previous);
    await repository.createIfAbsent(current);

    const overview = await new GetMorningCenterOverview(
      repository,
      new FakeCurrentDateProvider(TODAY),
      {
        execute: async () => ({
          decisionId: null,
          decisionTitle: null,
          expectedResult: null,
          firstStepId: null,
          firstStepTitle: null,
          scheduledTime: null,
          completed: false,
          ready: false,
          candidates: [],
        }),
      },
    ).execute(TODAY);

    expect(overview.startedAt).toEqual(STARTED_AT);
    expect(overview.quickStart.resolvedCount).toBe(1);
    expect(overview.previousUnfinished?.date.equals(YESTERDAY)).toBe(true);
  });
});

function activeCycle(id: string, date: DayDate, startedAt: Date): MorningCycle {
  const cycle = MorningCycle.create({
    id: EntityId.create(id),
    dayId: EntityId.create(`${id}-day`),
    dateKey: date,
    occurredAt: new Date(startedAt.getTime() - 60_000),
  });
  cycle.start(startedAt);
  return cycle;
}

function detailedPhysicalCycle(date = TODAY): MorningCycle {
  const startedAt = centerAtFor(date, '07:00');
  const cycle = MorningCycle.rehydrate({
    id: EntityId.create(`detailed-${date.toString()}`),
    dayId: EntityId.create(`detailed-day-${date.toString()}`),
    dateKey: date,
    state: MORNING_CYCLE_STATE.inProgress,
    startedAt,
    finishedAt: null,
    shortenedMode: false,
    stageStates: [
      {
        stageId: MORNING_STAGE_ID.coldShower,
        status: MORNING_STAGE_STATUS.completed,
        updatedAt: centerAtFor(date, '07:02'),
      },
    ],
    waterCompletedAt: centerAtFor(date, '07:01'),
    waterAmountMl: 250,
    physicalStatus: MORNING_PHYSICAL_STATUS.ready,
    physicalUpdatedAt: centerAtFor(date, '07:03'),
    physicalPlanItems: [
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
    ],
    physicalExecution: null,
    updatedAt: centerAtFor(date, '07:03'),
    version: 4,
  });
  cycle.startPhysicalExecution(centerAtFor(date, '07:04'));
  cycle.completePhysicalSet(
    EntityId.create('push-ups'),
    1,
    { measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions, actualReps: 12 },
    centerAtFor(date, '07:05'),
  );
  cycle.advancePhysicalExecution(centerAtFor(date, '07:06'));
  cycle.skipPhysicalSet(EntityId.create('push-ups'), 2, centerAtFor(date, '07:07'));
  cycle.advancePhysicalExecution(centerAtFor(date, '07:08'));
  return cycle;
}

function centerLegacyPhysicalCycle(
  status: typeof MORNING_PHYSICAL_STATUS.inProgress | typeof MORNING_PHYSICAL_STATUS.done,
  withPlan: boolean,
): MorningCycle {
  return MorningCycle.rehydrate({
    id: EntityId.create(`legacy-center-${String(withPlan)}`),
    dayId: EntityId.create(`legacy-center-day-${String(withPlan)}`),
    dateKey: TODAY,
    state: MORNING_CYCLE_STATE.inProgress,
    startedAt: centerAt('07:00'),
    finishedAt: null,
    shortenedMode: false,
    stageStates: [
      {
        stageId: MORNING_STAGE_ID.coldShower,
        status: MORNING_STAGE_STATUS.completed,
        updatedAt: centerAt('07:02'),
      },
    ],
    waterCompletedAt: centerAt('07:01'),
    waterAmountMl: 250,
    physicalStatus: status,
    physicalUpdatedAt: centerAt('07:03'),
    physicalPlanItems: withPlan
      ? [
          {
            exerciseDefinitionId: EntityId.create('push-ups'),
            measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
            sets: 2,
            targetReps: 10,
          },
        ]
      : [],
    physicalExecution: null,
    updatedAt: centerAt('07:03'),
    version: 4,
  });
}

function centerAt(hhmm: string): Date {
  return centerAtFor(TODAY, hhmm);
}

function centerAtFor(date: DayDate, hhmm: string): Date {
  return new Date(`${date.toString()}T${hhmm}:00.000+09:00`);
}
