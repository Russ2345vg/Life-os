import { describe, expect, it } from 'vitest';
import { DayDate } from '../day/DayDate';
import {
  EXERCISE_MEASUREMENT_TYPE,
  MORNING_PHYSICAL_SET_STATUS,
  MorningPhysicalExecution,
  type MorningPhysicalPlanItem,
} from '../morning-exercise';
import { EntityId } from '../shared/EntityId';
import { MorningCycle, type MorningCycleRehydrationData } from './MorningCycle';
import { MORNING_PHYSICAL_STATUS, type MorningPhysicalStatus } from './MorningPhysicalStatus';
import { MORNING_CYCLE_STATE } from './MorningCycleState';
import { MORNING_STAGE_ID, MORNING_STAGE_STATUS } from './MorningStageState';
import {
  MORNING_SHORTENED_ACTION,
  MORNING_SHORTENED_MODE_STATE,
  type MorningShortenedConfiguration,
} from './MorningShortenedMode';

const DATE = DayDate.create('2026-08-23');
const CREATED_AT = new Date('2026-08-23T06:50:00.000+09:00');
const STARTED_AT = new Date('2026-08-23T07:12:00.000+09:00');
const WATER_AT = new Date('2026-08-23T07:14:00.000+09:00');
const LATER = new Date('2026-08-23T07:30:00.000+09:00');
const READY_AT = new Date('2026-08-23T07:40:00.000+09:00');
const FINISHED_AT = new Date('2026-08-23T07:45:00.000+09:00');

describe('MorningCycle', () => {
  it('создаёт утро без выдуманного состояния перед стартом', () => {
    const cycle = createCycle();

    expect(cycle.startState).toBeNull();
  });

  it('сохраняет и обновляет состояние до завершения Quick Start', () => {
    const cycle = createCycle();

    expect(
      cycle.recordStartState({ energy: 6, clarity: 7, mood: '  спокойный  ' }, STARTED_AT),
    ).toBe(true);
    expect(cycle.startState).toEqual({
      energy: 6,
      clarity: 7,
      mood: 'спокойный',
      recordedAt: STARTED_AT,
    });

    cycle.start(WATER_AT);
    expect(cycle.recordStartState({ energy: 8, clarity: 9, mood: 'собранный' }, LATER)).toBe(true);
    expect(cycle.startState).toEqual({
      energy: 8,
      clarity: 9,
      mood: 'собранный',
      recordedAt: LATER,
    });
  });

  it('отклоняет некорректное и запоздалое состояние без изменения агрегата', () => {
    const cycle = createCycle();

    expect(() =>
      cycle.recordStartState({ energy: 0, clarity: 11, mood: ' ' }, STARTED_AT),
    ).toThrowError('Состояние перед стартом указано неверно.');
    expect(cycle.startState).toBeNull();

    cycle.start(STARTED_AT);
    cycle.completeWater(WATER_AT, 250);
    cycle.completeColdShower(LATER);
    expect(() =>
      cycle.recordStartState({ energy: 5, clarity: 5, mood: 'спокойный' }, READY_AT),
    ).toThrowError('Состояние перед стартом уже нельзя изменить.');
    expect(cycle.startState).toBeNull();
  });

  it('создаёт неактивный цикл с безопасными значениями нового фундамента', () => {
    const cycle = createCycle();

    expect(cycle.state).toBe(MORNING_CYCLE_STATE.notStarted);
    expect(cycle.finishedAt).toBeNull();
    expect(cycle.shortenedMode).toBe(false);
    expect(cycle.stageStates).toEqual([]);
    expect(cycle.isActive()).toBe(false);
  });

  it('сохраняет первое время старта и воды при повторных командах', () => {
    const cycle = createCycle();

    expect(cycle.start(STARTED_AT)).toBe(true);
    expect(cycle.start(LATER)).toBe(false);
    expect(cycle.completeWater(WATER_AT, 250)).toBe(true);
    expect(cycle.completeWater(LATER, 250)).toBe(false);

    expect(cycle.startedAt).toEqual(STARTED_AT);
    expect(cycle.waterCompletedAt).toEqual(WATER_AT);
    expect(cycle.waterAmountMl).toBe(250);
    expect(cycle.state).toBe(MORNING_CYCLE_STATE.inProgress);
    expect(cycle.isActive()).toBe(true);
    expect(cycle.version).toBe(3);
  });

  it('идемпотентно переводит запущенное утро в готовность и завершение', () => {
    const cycle = createCycle();
    cycle.start(STARTED_AT);
    cycle.completeWater(WATER_AT, 250);
    cycle.completeColdShower(LATER);
    cycle.skipPhysical(LATER);

    expect(cycle.markReadyToWork(true, READY_AT)).toBe(true);
    expect(cycle.markReadyToWork(true, LATER)).toBe(false);
    expect(cycle.state).toBe(MORNING_CYCLE_STATE.readyToWork);
    expect(cycle.isActive()).toBe(true);

    expect(cycle.finish(FINISHED_AT)).toBe(true);
    expect(cycle.finish(LATER)).toBe(false);
    expect(cycle.state).toBe(MORNING_CYCLE_STATE.finished);
    expect(cycle.finishedAt).toEqual(FINISHED_AT);
    expect(cycle.isActive()).toBe(false);
    expect(cycle.version).toBe(7);
  });

  it('идемпотентно закрывает активное утро как незавершённое', () => {
    const cycle = createCycle();
    cycle.start(STARTED_AT);

    expect(cycle.abandon(READY_AT)).toBe(true);
    expect(cycle.abandon(LATER)).toBe(false);
    expect(cycle.state).toBe(MORNING_CYCLE_STATE.abandoned);
    expect(cycle.finishedAt).toEqual(READY_AT);
    expect(cycle.isActive()).toBe(false);
    expect(cycle.version).toBe(3);
  });

  it('запрещает недопустимые переходы жизненного цикла и изменения terminal-цикла', () => {
    const cycle = createCycle();

    expect(() => cycle.markReadyToWork(true, READY_AT)).toThrowError(
      'Переход состояния утреннего блока недоступен.',
    );
    cycle.start(STARTED_AT);
    expect(() => cycle.finish(FINISHED_AT)).toThrowError(
      'Переход состояния утреннего блока недоступен.',
    );
    cycle.abandon(FINISHED_AT);
    expect(() => cycle.completeWater(LATER, 250)).toThrowError('Утренний блок уже закрыт.');
  });

  it('не переводит утро в готовность, пока обязательные факты не закрыты', () => {
    const cycle = createCycle();
    cycle.start(STARTED_AT);

    expect(cycle.markReadyToWork(true, READY_AT)).toBe(false);
    cycle.completeWater(WATER_AT, 250);
    expect(cycle.markReadyToWork(true, READY_AT)).toBe(false);
    cycle.skipColdShower(LATER);
    expect(cycle.markReadyToWork(true, READY_AT)).toBe(false);
    cycle.skipPhysical(LATER);

    expect(cycle.markReadyToWork(false, READY_AT)).toBe(false);
    expect(cycle.state).toBe(MORNING_CYCLE_STATE.inProgress);
  });

  it('считает Mirror необязательным и допускает осознанные пропуски', () => {
    const cycle = createCycle();
    cycle.start(STARTED_AT);
    cycle.completeWater(WATER_AT, 250);
    cycle.skipColdShower(LATER);
    cycle.skipPhysical(LATER);

    expect(cycle.markReadyToWork(true, READY_AT)).toBe(true);
    expect(
      cycle.stageStates.find((stage) => stage.stageId === MORNING_STAGE_ID.mirror),
    ).toBeUndefined();
    expect(cycle.state).toBe(MORNING_CYCLE_STATE.readyToWork);
  });

  it('фиксирует допустимый вариант без главного действия и не создаёт второй факт', () => {
    const cycle = createCycle();
    cycle.start(STARTED_AT);
    cycle.completeWater(WATER_AT, 250);
    cycle.completeColdShower(LATER);
    cycle.skipPhysical(LATER);

    expect(cycle.skipMainAction(READY_AT)).toBe(true);
    expect(cycle.skipMainAction(FINISHED_AT)).toBe(false);
    expect(cycle.stageStates).toContainEqual({
      stageId: MORNING_STAGE_ID.mainAction,
      status: MORNING_STAGE_STATUS.skipped,
      updatedAt: READY_AT,
    });
    expect(cycle.markReadyToWork(false, READY_AT)).toBe(true);
  });

  it('восстанавливает stage snapshots и не отдаёт изменяемые ссылки наружу', () => {
    const stageUpdatedAt = new Date('2026-08-23T07:22:00.000+09:00');
    const cycle = MorningCycle.rehydrate({
      id: EntityId.create('morning-cycle'),
      dayId: EntityId.create('day'),
      dateKey: DATE,
      state: MORNING_CYCLE_STATE.inProgress,
      startedAt: STARTED_AT,
      finishedAt: null,
      shortenedMode: false,
      stageStates: [
        {
          stageId: 'wake-up',
          status: MORNING_STAGE_STATUS.completed,
          updatedAt: stageUpdatedAt,
        },
      ],
      waterCompletedAt: null,
      waterAmountMl: null,
      physicalStatus: MORNING_PHYSICAL_STATUS.notConfigured,
      physicalUpdatedAt: null,
      updatedAt: READY_AT,
      version: 2,
    });

    const firstRead = cycle.stageStates;
    expect(firstRead).toEqual([
      {
        stageId: 'wake-up',
        status: MORNING_STAGE_STATUS.completed,
        updatedAt: stageUpdatedAt,
      },
    ]);
    firstRead[0]!.updatedAt?.setUTCFullYear(2000);
    expect(cycle.stageStates[0]?.updatedAt).toEqual(stageUpdatedAt);
  });

  it('отклоняет дубликаты и некорректные stage snapshots при восстановлении', () => {
    const base = {
      id: EntityId.create('morning-cycle'),
      dayId: EntityId.create('day'),
      dateKey: DATE,
      state: MORNING_CYCLE_STATE.inProgress,
      startedAt: STARTED_AT,
      finishedAt: null,
      shortenedMode: false,
      waterCompletedAt: null,
      waterAmountMl: null,
      physicalStatus: MORNING_PHYSICAL_STATUS.notConfigured,
      physicalUpdatedAt: null,
      updatedAt: READY_AT,
      version: 2,
    };

    expect(() =>
      MorningCycle.rehydrate({
        ...base,
        stageStates: [
          { stageId: 'water', status: MORNING_STAGE_STATUS.pending, updatedAt: null },
          { stageId: 'water', status: MORNING_STAGE_STATUS.active, updatedAt: READY_AT },
        ],
      }),
    ).toThrowError('Состояния этапов утреннего блока некорректны.');
  });

  it('не позволяет отметить воду до запуска утра', () => {
    expect(() => createCycle().completeWater(WATER_AT, 250)).toThrowError(
      'Сначала начните утренний блок.',
    );
  });

  it('запускает детальное выполнение один раз и раскрывает план в пять подходов', () => {
    const cycle = createCycle();
    cycle.start(STARTED_AT);
    cycle.selectPhysicalExercise(
      EntityId.create('push-ups'),
      EXERCISE_MEASUREMENT_TYPE.repetitions,
      WATER_AT,
    );
    cycle.adjustPhysicalExercise(EntityId.create('push-ups'), { field: 'sets', delta: -1 }, LATER);
    cycle.selectPhysicalExercise(
      EntityId.create('plank'),
      EXERCISE_MEASUREMENT_TYPE.duration,
      READY_AT,
    );
    const version = cycle.version;

    expect(cycle.startPhysicalExecution(moment('07:46'))).toBe(true);
    expect(cycle.physicalExecution?.sets).toHaveLength(5);
    expect(cycle.physicalExecution?.activeSetIndex).toBe(0);
    expect(cycle.physicalStatus).toBe(MORNING_PHYSICAL_STATUS.inProgress);
    expect(cycle.version).toBe(version + 1);
    expect(cycle.startPhysicalExecution(moment('07:47'))).toBe(false);
    expect(cycle.version).toBe(version + 1);
  });

  it('делегирует команды подходов и меняет агрегат ровно один раз на успешную команду', () => {
    const cycle = createCycle();
    cycle.start(STARTED_AT);
    cycle.selectPhysicalExercise(
      EntityId.create('push-ups'),
      EXERCISE_MEASUREMENT_TYPE.repetitions,
      WATER_AT,
    );
    cycle.startPhysicalExecution(LATER);

    assertSinglePhysicalChange(cycle, moment('07:31'), () =>
      cycle.completePhysicalSet(
        EntityId.create('push-ups'),
        1,
        { measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions, actualReps: 14 },
        moment('07:31'),
      ),
    );
    expect(cycle.physicalExecution?.activeSetIndex).toBe(0);
    expect(cycle.physicalExecution?.sets[0]).toMatchObject({
      status: MORNING_PHYSICAL_SET_STATUS.completed,
      actualReps: 14,
    });
    assertSinglePhysicalChange(cycle, moment('07:32'), () =>
      cycle.advancePhysicalExecution(moment('07:32')),
    );
    assertSinglePhysicalChange(cycle, moment('07:33'), () =>
      cycle.skipPhysicalSet(EntityId.create('push-ups'), 2, moment('07:33')),
    );
  });

  it('оставляет повторные pause/resume no-op даже с более ранним временем повтора', () => {
    const cycle = createCycle();
    cycle.start(STARTED_AT);
    cycle.selectPhysicalExercise(
      EntityId.create('push-ups'),
      EXERCISE_MEASUREMENT_TYPE.repetitions,
      WATER_AT,
    );
    cycle.startPhysicalExecution(LATER);

    expect(cycle.pausePhysicalExecution(moment('07:32'))).toBe(true);
    const pausedVersion = cycle.version;
    expect(cycle.pausePhysicalExecution(moment('07:31'))).toBe(false);
    expect(cycle.version).toBe(pausedVersion);

    expect(cycle.resumePhysicalExecution(moment('07:34'))).toBe(true);
    const runningVersion = cycle.version;
    expect(cycle.resumePhysicalExecution(moment('07:33'))).toBe(false);
    expect(cycle.version).toBe(runningVersion);
  });

  it('закрывает последнюю открытую паузу и весь physical-факт атомарно', () => {
    const cycle = createCycle();
    cycle.start(STARTED_AT);
    cycle.selectPhysicalExercise(
      EntityId.create('push-ups'),
      EXERCISE_MEASUREMENT_TYPE.repetitions,
      WATER_AT,
    );
    cycle.startPhysicalExecution(LATER);
    cycle.skipPhysicalSet(EntityId.create('push-ups'), 1, moment('07:31'));
    cycle.advancePhysicalExecution(moment('07:32'));
    cycle.skipPhysicalSet(EntityId.create('push-ups'), 2, moment('07:33'));
    cycle.advancePhysicalExecution(moment('07:34'));
    cycle.skipPhysicalSet(EntityId.create('push-ups'), 3, moment('07:35'));
    cycle.pausePhysicalExecution(moment('07:36'));
    const version = cycle.version;

    expect(cycle.completePhysicalExecution(moment('07:40'))).toBe(true);
    expect(cycle.physicalStatus).toBe(MORNING_PHYSICAL_STATUS.done);
    expect(cycle.physicalUpdatedAt).toEqual(moment('07:40'));
    expect(cycle.updatedAt).toEqual(moment('07:40'));
    expect(cycle.version).toBe(version + 1);
    expect(cycle.physicalExecution?.completedAt).toEqual(moment('07:40'));
    expect(cycle.physicalExecution?.pausedAt).toBeNull();

    expect(cycle.completePhysicalExecution(moment('07:41'))).toBe(false);
    expect(cycle.version).toBe(version + 1);
  });

  it('восстанавливает legacy in-progress из physicalUpdatedAt или старого updatedAt', () => {
    const plan = [repetitionPlan('push-ups', 2, 10)];
    const withPhysicalTime = rehydratePhysical({
      physicalStatus: MORNING_PHYSICAL_STATUS.inProgress,
      physicalUpdatedAt: LATER,
      physicalPlanItems: plan,
    });
    const withoutPhysicalTime = rehydratePhysical({
      physicalStatus: MORNING_PHYSICAL_STATUS.inProgress,
      physicalUpdatedAt: null,
      physicalPlanItems: plan,
    });

    expect(withPhysicalTime.recoverPhysicalExecution(moment('07:50'))).toBe(true);
    expect(withPhysicalTime.physicalExecution?.startedAt).toEqual(LATER);
    expect(withPhysicalTime.physicalExecution?.sets.every((set) => set.status === 'PENDING')).toBe(
      true,
    );
    expect(withoutPhysicalTime.recoverPhysicalExecution(moment('07:50'))).toBe(true);
    expect(withoutPhysicalTime.physicalExecution?.startedAt).toEqual(READY_AT);
  });

  it('не восстанавливает legacy выполнение раньше fallback updatedAt', () => {
    const legacy = rehydratePhysical({
      physicalStatus: MORNING_PHYSICAL_STATUS.inProgress,
      physicalUpdatedAt: null,
      physicalPlanItems: [repetitionPlan('push-ups', 2, 10)],
    });

    expect(() => legacy.recoverPhysicalExecution(moment('07:39'))).toThrowError(
      'Время изменения не может быть раньше предыдущего действия физической активации.',
    );
    expect(legacy.physicalExecution).toBeNull();
  });

  it('не откатывает aggregate updatedAt назад относительно detailed physical timestamp', () => {
    const cycle = createCycle();
    cycle.start(STARTED_AT);
    cycle.selectPhysicalExercise(
      EntityId.create('push-ups'),
      EXERCISE_MEASUREMENT_TYPE.repetitions,
      WATER_AT,
    );
    cycle.startPhysicalExecution(LATER);

    expect(() => cycle.shorten(WATER_AT)).toThrowError(
      'Время изменения не может быть раньше предыдущего действия физической активации.',
    );
    expect(cycle.shortenedMode).toBe(false);
    expect(cycle.updatedAt).toEqual(LATER);
  });

  it('оставляет legacy terminal факты без деталей валидными, а пустой in-progress невосстановимым', () => {
    expect(
      rehydratePhysical({ physicalStatus: MORNING_PHYSICAL_STATUS.done }).physicalExecution,
    ).toBeNull();
    expect(
      rehydratePhysical({ physicalStatus: MORNING_PHYSICAL_STATUS.skipped }).physicalExecution,
    ).toBeNull();
    const empty = rehydratePhysical({ physicalStatus: MORNING_PHYSICAL_STATUS.inProgress });
    expect(() => empty.recoverPhysicalExecution(moment('07:50'))).toThrowError(
      'Выполнение физической активации нельзя безопасно восстановить.',
    );
  });

  it('не запускает пустой READY, terminal или legacy IN_PROGRESS обычной start-командой', () => {
    const emptyReady = rehydratePhysical({ physicalStatus: MORNING_PHYSICAL_STATUS.ready });
    const skipped = rehydratePhysical({ physicalStatus: MORNING_PHYSICAL_STATUS.skipped });
    const legacy = rehydratePhysical({
      physicalStatus: MORNING_PHYSICAL_STATUS.inProgress,
      physicalPlanItems: [repetitionPlan('push-ups', 1, 10)],
    });

    expect(() => emptyReady.startPhysicalExecution(moment('07:50'))).toThrowError(
      'Переход физической активации недоступен.',
    );
    expect(() => skipped.startPhysicalExecution(moment('07:50'))).toThrowError(
      'Физическая активация уже пропущена.',
    );
    expect(() => legacy.startPhysicalExecution(moment('07:50'))).toThrowError(
      'Переход физической активации недоступен.',
    );
  });

  it('не отдаёт изменяемое detailed execution наружу', () => {
    const cycle = createCycle();
    cycle.start(STARTED_AT);
    cycle.selectPhysicalExercise(
      EntityId.create('push-ups'),
      EXERCISE_MEASUREMENT_TYPE.repetitions,
      WATER_AT,
    );
    cycle.startPhysicalExecution(LATER);

    const snapshot = cycle.physicalExecution;
    snapshot?.pause(moment('07:31'));

    expect(cycle.physicalExecution?.pausedAt).toBeNull();
  });

  it('отклоняет detailed execution, который не соответствует заблокированному плану', () => {
    const execution = MorningPhysicalExecution.start([repetitionPlan('push-ups', 2, 10)], LATER);

    expect(() =>
      rehydratePhysical({
        physicalStatus: MORNING_PHYSICAL_STATUS.inProgress,
        physicalPlanItems: [repetitionPlan('push-ups', 1, 10)],
        physicalExecution: execution,
      }),
    ).toThrowError('Состояние выполнения физической активации некорректно.');
  });

  it('отклоняет несовместимые пары coarse status и detailed execution', () => {
    const execution = MorningPhysicalExecution.start([repetitionPlan('push-ups', 1, 10)], LATER);

    expect(() =>
      rehydratePhysical({
        physicalStatus: MORNING_PHYSICAL_STATUS.ready,
        physicalPlanItems: [repetitionPlan('push-ups', 1, 10)],
        physicalExecution: execution,
      }),
    ).toThrowError('Состояние выполнения физической активации некорректно.');
  });

  it('отклоняет detailed execution с противоречащим aggregate physical timestamp', () => {
    const execution = MorningPhysicalExecution.start([repetitionPlan('push-ups', 1, 10)], LATER);
    execution.skipSet(EntityId.create('push-ups'), 1, moment('07:31'));
    execution.complete(moment('07:32'));

    expect(() =>
      rehydratePhysical({
        physicalStatus: MORNING_PHYSICAL_STATUS.done,
        physicalUpdatedAt: moment('07:31'),
        physicalPlanItems: [repetitionPlan('push-ups', 1, 10)],
        physicalExecution: execution,
      }),
    ).toThrowError('Состояние выполнения физической активации некорректно.');
  });

  it('сохраняет legacy READY без execution редактируемым', () => {
    const ready = rehydratePhysical({
      physicalStatus: MORNING_PHYSICAL_STATUS.ready,
      physicalPlanItems: [repetitionPlan('push-ups', 1, 10)],
    });

    expect(
      ready.selectPhysicalExercise(
        EntityId.create('plank'),
        EXERCISE_MEASUREMENT_TYPE.duration,
        moment('07:50'),
      ),
    ).toBe(true);
  });

  it('фиксирует корректный пропуск один раз', () => {
    const cycle = createCycle();
    cycle.start(STARTED_AT);

    expect(cycle.skipPhysical(WATER_AT)).toBe(true);
    expect(cycle.skipPhysical(LATER)).toBe(false);
    expect(cycle.physicalStatus).toBe(MORNING_PHYSICAL_STATUS.skipped);
    expect(cycle.physicalUpdatedAt).toEqual(WATER_AT);
  });

  it('выбирает упражнение один раз и делает непустой план готовым', () => {
    const cycle = createCycle();
    cycle.start(STARTED_AT);

    expect(
      cycle.selectPhysicalExercise(
        EntityId.create('push-ups'),
        EXERCISE_MEASUREMENT_TYPE.repetitions,
        WATER_AT,
      ),
    ).toBe(true);
    expect(
      cycle.selectPhysicalExercise(
        EntityId.create('push-ups'),
        EXERCISE_MEASUREMENT_TYPE.repetitions,
        LATER,
      ),
    ).toBe(false);

    expect(cycle.physicalPlanItems).toHaveLength(1);
    expect(cycle.physicalPlanItems[0]?.exerciseDefinitionId.toString()).toBe('push-ups');
    expect(cycle.physicalPlanItems[0]).toMatchObject({
      measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
      sets: 3,
      targetReps: 10,
    });
    expect(cycle.physicalStatus).toBe(MORNING_PHYSICAL_STATUS.ready);
  });

  it('возвращает статус not configured только после удаления последнего упражнения', () => {
    const cycle = createCycle();
    cycle.start(STARTED_AT);
    cycle.selectPhysicalExercise(
      EntityId.create('push-ups'),
      EXERCISE_MEASUREMENT_TYPE.repetitions,
      WATER_AT,
    );
    cycle.selectPhysicalExercise(
      EntityId.create('pull-ups'),
      EXERCISE_MEASUREMENT_TYPE.repetitions,
      LATER,
    );

    expect(cycle.deselectPhysicalExercise(EntityId.create('push-ups'), READY_AT)).toBe(true);
    expect(cycle.physicalStatus).toBe(MORNING_PHYSICAL_STATUS.ready);
    expect(cycle.deselectPhysicalExercise(EntityId.create('pull-ups'), FINISHED_AT)).toBe(true);
    expect(cycle.physicalStatus).toBe(MORNING_PHYSICAL_STATUS.notConfigured);
    expect(cycle.physicalPlanItems).toEqual([]);
  });

  it('сохраняет порядок выбора и добавляет повторно выбранное упражнение в конец', () => {
    const cycle = createCycle();
    cycle.start(STARTED_AT);
    cycle.selectPhysicalExercise(
      EntityId.create('push-ups'),
      EXERCISE_MEASUREMENT_TYPE.repetitions,
      WATER_AT,
    );
    cycle.selectPhysicalExercise(
      EntityId.create('plank'),
      EXERCISE_MEASUREMENT_TYPE.duration,
      LATER,
    );
    cycle.deselectPhysicalExercise(EntityId.create('push-ups'), READY_AT);
    cycle.selectPhysicalExercise(
      EntityId.create('push-ups'),
      EXERCISE_MEASUREMENT_TYPE.repetitions,
      FINISHED_AT,
    );

    expect(cycle.physicalPlanItems.map((item) => item.exerciseDefinitionId.toString())).toEqual([
      'plank',
      'push-ups',
    ]);
  });

  it('изменяет подходы и измеримую цель без смешивания повторений и секунд', () => {
    const cycle = createCycle();
    cycle.start(STARTED_AT);
    cycle.selectPhysicalExercise(
      EntityId.create('push-ups'),
      EXERCISE_MEASUREMENT_TYPE.repetitions,
      WATER_AT,
    );
    cycle.selectPhysicalExercise(
      EntityId.create('plank'),
      EXERCISE_MEASUREMENT_TYPE.duration,
      LATER,
    );

    cycle.adjustPhysicalExercise(
      EntityId.create('push-ups'),
      { field: 'sets', delta: 1 },
      READY_AT,
    );
    cycle.adjustPhysicalExercise(
      EntityId.create('push-ups'),
      { field: 'target', delta: 1 },
      FINISHED_AT,
    );
    cycle.adjustPhysicalExercise(
      EntityId.create('plank'),
      { field: 'target', delta: 1 },
      new Date('2026-08-23T07:46:00.000+09:00'),
    );

    expect(cycle.physicalPlanItems[0]).toMatchObject({ sets: 4, targetReps: 11 });
    expect(cycle.physicalPlanItems[1]).toMatchObject({ targetDurationSeconds: 35 });
  });

  it('не отдаёт изменяемый массив плана наружу', () => {
    const cycle = createCycle();
    cycle.start(STARTED_AT);
    cycle.selectPhysicalExercise(
      EntityId.create('push-ups'),
      EXERCISE_MEASUREMENT_TYPE.repetitions,
      WATER_AT,
    );

    const firstRead = cycle.physicalPlanItems;
    (firstRead as MorningCycle['physicalPlanItems'][number][]).splice(0, 1);

    expect(cycle.physicalPlanItems).toHaveLength(1);
  });

  it('запрещает менять план после начала выполнения физической активности', () => {
    const cycle = createCycle();
    cycle.start(STARTED_AT);
    cycle.selectPhysicalExercise(
      EntityId.create('push-ups'),
      EXERCISE_MEASUREMENT_TYPE.repetitions,
      WATER_AT,
    );
    cycle.startPhysicalExecution(LATER);

    expect(() =>
      cycle.selectPhysicalExercise(
        EntityId.create('pull-ups'),
        EXERCISE_MEASUREMENT_TYPE.repetitions,
        READY_AT,
      ),
    ).toThrowError('План физической активации уже нельзя изменить.');
    expect(() => cycle.skipPhysical(READY_AT)).toThrowError(
      'План физической активации уже нельзя изменить.',
    );
    expect(() =>
      cycle.deselectPhysicalExercise(EntityId.create('push-ups'), READY_AT),
    ).toThrowError('План физической активации уже нельзя изменить.');
    expect(() =>
      cycle.adjustPhysicalExercise(
        EntityId.create('push-ups'),
        { field: 'sets', delta: 1 },
        READY_AT,
      ),
    ).toThrowError('План физической активации уже нельзя изменить.');
  });

  it('завершает холодный душ отдельным стабильным фактом этапа', () => {
    const cycle = createCycle();
    cycle.start(STARTED_AT);

    expect(cycle.completeColdShower(WATER_AT)).toBe(true);
    expect(cycle.stageStates).toContainEqual({
      stageId: MORNING_STAGE_ID.coldShower,
      status: MORNING_STAGE_STATUS.completed,
      updatedAt: WATER_AT,
    });
  });

  it('фиксирует явный пропуск холодного душа без изменения physical-факта', () => {
    const cycle = createCycle();
    cycle.start(STARTED_AT);

    expect(cycle.skipColdShower(WATER_AT)).toBe(true);
    expect(cycle.stageStates).toContainEqual({
      stageId: MORNING_STAGE_ID.coldShower,
      status: MORNING_STAGE_STATUS.skipped,
      updatedAt: WATER_AT,
    });
    expect(cycle.physicalStatus).toBe(MORNING_PHYSICAL_STATUS.notConfigured);
  });

  it('сохраняет первый выбор и версию при повторе той же shower-команды', () => {
    const cycle = createCycle();
    cycle.start(STARTED_AT);

    expect(cycle.completeColdShower(WATER_AT)).toBe(true);
    const version = cycle.version;
    expect(cycle.completeColdShower(LATER)).toBe(false);

    expect(cycle.version).toBe(version);
    expect(cycle.stageStates).toContainEqual({
      stageId: MORNING_STAGE_ID.coldShower,
      status: MORNING_STAGE_STATUS.completed,
      updatedAt: WATER_AT,
    });
  });

  it('не заменяет один terminal-выбор холодного душа противоположным', () => {
    const completed = createCycle();
    completed.start(STARTED_AT);
    completed.completeColdShower(WATER_AT);
    expect(() => completed.skipColdShower(LATER)).toThrowError(
      'Холодный душ уже отмечен для этого утра.',
    );

    const skipped = createCycle();
    skipped.start(STARTED_AT);
    skipped.skipColdShower(WATER_AT);
    expect(() => skipped.completeColdShower(LATER)).toThrowError(
      'Холодный душ уже отмечен для этого утра.',
    );
  });

  it('не изменяет холодный душ до старта или после закрытия утра', () => {
    expect(() => createCycle().completeColdShower(WATER_AT)).toThrowError(
      'Сначала начните утренний блок.',
    );

    const cycle = createCycle();
    cycle.start(STARTED_AT);
    cycle.abandon(READY_AT);
    expect(() => cycle.skipColdShower(LATER)).toThrowError('Утренний блок уже закрыт.');
  });

  it.each([MORNING_PHYSICAL_STATUS.done, MORNING_PHYSICAL_STATUS.skipped] as const)(
    'фиксирует Mirror один раз после terminal physical %s',
    (physicalStatus) => {
      const cycle = rehydrateMirrorReady({ physicalStatus });
      const completedAt = moment('07:45');
      const version = cycle.version;

      expect(cycle.completeMirror(completedAt)).toBe(true);
      expect(cycle.stageStates).toContainEqual({
        stageId: MORNING_STAGE_ID.mirror,
        status: MORNING_STAGE_STATUS.completed,
        updatedAt: completedAt,
      });
      expect(cycle.updatedAt).toEqual(completedAt);
      expect(cycle.version).toBe(version + 1);

      expect(cycle.completeMirror(moment('07:50'))).toBe(false);
      expect(cycle.stageStates).toContainEqual({
        stageId: MORNING_STAGE_ID.mirror,
        status: MORNING_STAGE_STATUS.completed,
        updatedAt: completedAt,
      });
      expect(cycle.version).toBe(version + 1);
    },
  );

  it('требует завершённые Quick Start и физическую активацию для Mirror', () => {
    const missingWater = createCycle();
    missingWater.start(STARTED_AT);
    missingWater.completeColdShower(WATER_AT);
    missingWater.skipPhysical(LATER);

    expect(() => missingWater.completeMirror(READY_AT)).toThrowError(
      expect.objectContaining({ code: 'morning_cycle.mirror_not_ready' }),
    );

    const missingShower = createCycle();
    missingShower.start(STARTED_AT);
    missingShower.completeWater(WATER_AT, 250);
    missingShower.skipPhysical(LATER);

    expect(() => missingShower.completeMirror(READY_AT)).toThrowError(
      expect.objectContaining({ code: 'morning_cycle.mirror_not_ready' }),
    );

    const unresolvedPhysical = createCycle();
    unresolvedPhysical.start(STARTED_AT);
    unresolvedPhysical.completeWater(WATER_AT, 250);
    unresolvedPhysical.skipColdShower(LATER);

    expect(() => unresolvedPhysical.completeMirror(READY_AT)).toThrowError(
      expect.objectContaining({ code: 'morning_cycle.mirror_not_ready' }),
    );
  });

  it('не завершает Mirror до старта, после закрытия или раньше physical-факта', () => {
    expect(() => createCycle().completeMirror(READY_AT)).toThrowError(
      'Сначала начните утренний блок.',
    );

    const closed = rehydrateMirrorReady({ physicalStatus: MORNING_PHYSICAL_STATUS.skipped });
    closed.abandon(moment('07:45'));
    expect(() => closed.completeMirror(moment('07:50'))).toThrowError(
      expect.objectContaining({ code: 'morning_cycle.closed' }),
    );

    const active = rehydrateMirrorReady({ physicalStatus: MORNING_PHYSICAL_STATUS.done });
    expect(() => active.completeMirror(moment('07:39'))).toThrowError(
      expect.objectContaining({ code: 'morning_cycle.mirror_time_before_physical' }),
    );
  });

  it('восстанавливает только валидный completed Mirror и защищает его timestamp', () => {
    const completedAt = moment('07:45');
    const cycle = rehydrateMirrorReady({
      physicalStatus: MORNING_PHYSICAL_STATUS.done,
      mirror: { status: MORNING_STAGE_STATUS.completed, updatedAt: completedAt },
    });

    const firstRead = cycle.stageStates.find((stage) => stage.stageId === MORNING_STAGE_ID.mirror);
    firstRead?.updatedAt?.setUTCFullYear(2000);
    expect(
      cycle.stageStates.find((stage) => stage.stageId === MORNING_STAGE_ID.mirror)?.updatedAt,
    ).toEqual(completedAt);

    expect(
      rehydrateMirrorReady({
        physicalStatus: MORNING_PHYSICAL_STATUS.done,
        mirror: { status: MORNING_STAGE_STATUS.skipped, updatedAt: completedAt },
      }).stageStates,
    ).toContainEqual({
      stageId: MORNING_STAGE_ID.mirror,
      status: MORNING_STAGE_STATUS.skipped,
      updatedAt: completedAt,
    });

    for (const mirror of [
      { status: MORNING_STAGE_STATUS.completed, updatedAt: null },
      { status: MORNING_STAGE_STATUS.completed, updatedAt: moment('07:39') },
    ] as const) {
      expect(() =>
        rehydrateMirrorReady({
          physicalStatus: MORNING_PHYSICAL_STATUS.done,
          mirror,
        }),
      ).toThrowError('Состояния этапов утреннего блока некорректны.');
    }
  });

  it('идемпотентно включает сокращённый режим только для активного утра', () => {
    const cycle = createCycle();
    cycle.start(STARTED_AT);

    expect(cycle.shorten(WATER_AT)).toBe(true);
    const version = cycle.version;
    expect(cycle.shorten(LATER)).toBe(false);

    expect(cycle.shortenedMode).toBe(true);
    expect(cycle.updatedAt).toEqual(WATER_AT);
    expect(cycle.version).toBe(version);
  });

  it('не включает сокращённый режим до старта или после закрытия утра', () => {
    expect(() => createCycle().shorten(WATER_AT)).toThrowError('Сначала начните утренний блок.');

    const cycle = createCycle();
    cycle.start(STARTED_AT);
    cycle.abandon(READY_AT);
    expect(() => cycle.shorten(LATER)).toThrowError('Утренний блок уже закрыт.');
  });

  it('activates and reverts a per-run shortened configuration without losing its history mark', () => {
    const cycle = createCycle();
    cycle.start(STARTED_AT);
    const configuration: MorningShortenedConfiguration = {
      coldShower: MORNING_SHORTENED_ACTION.skip,
      physical: MORNING_SHORTENED_ACTION.shorten,
      mirror: MORNING_SHORTENED_ACTION.skip,
    };

    expect(cycle.activateShortened(configuration, WATER_AT)).toBe(true);
    expect(cycle.shortenedModeState).toBe(MORNING_SHORTENED_MODE_STATE.shortenedActive);
    expect(cycle.shortenedMode).toBe(true);
    expect(cycle.wasEverShortened).toBe(true);
    expect(cycle.shortenedConfiguration).toEqual(configuration);
    expect(cycle.stageStates).toContainEqual({
      stageId: MORNING_STAGE_ID.mirror,
      status: MORNING_STAGE_STATUS.skipped,
      updatedAt: WATER_AT,
    });
    const version = cycle.version;
    expect(cycle.activateShortened(configuration, LATER)).toBe(false);
    expect(cycle.version).toBe(version);

    expect(cycle.revertShortened(LATER)).toBe(true);
    expect(cycle.shortenedModeState).toBe(MORNING_SHORTENED_MODE_STATE.revertedToNormal);
    expect(cycle.shortenedMode).toBe(false);
    expect(cycle.wasEverShortened).toBe(true);
    expect(cycle.shortenedConfiguration).toEqual(configuration);
    expect(cycle.stageStates).toContainEqual({
      stageId: MORNING_STAGE_ID.mirror,
      status: MORNING_STAGE_STATUS.skipped,
      updatedAt: WATER_AT,
    });
    expect(cycle.revertShortened(READY_AT)).toBe(false);
  });

  it('returns a defensive copy of shortened configuration', () => {
    const cycle = createCycle();
    cycle.start(STARTED_AT);
    cycle.activateShortened(
      {
        coldShower: MORNING_SHORTENED_ACTION.keep,
        physical: MORNING_SHORTENED_ACTION.skip,
        mirror: MORNING_SHORTENED_ACTION.skip,
      },
      WATER_AT,
    );

    const copy = cycle.shortenedConfiguration! as {
      coldShower: string;
      physical: string;
      mirror: string;
    };
    copy.physical = MORNING_SHORTENED_ACTION.keep;

    expect(cycle.shortenedConfiguration?.physical).toBe(MORNING_SHORTENED_ACTION.skip);
  });

  it('applies the physical shortening request without replacing the current set', () => {
    const cycle = createCycle();
    cycle.start(STARTED_AT);
    cycle.selectPhysicalExercise(
      EntityId.create('push-ups'),
      EXERCISE_MEASUREMENT_TYPE.repetitions,
      WATER_AT,
    );
    cycle.startPhysicalExecution(LATER);

    cycle.activateShortened(
      {
        coldShower: MORNING_SHORTENED_ACTION.keep,
        physical: MORNING_SHORTENED_ACTION.shorten,
        mirror: MORNING_SHORTENED_ACTION.keep,
      },
      moment('07:31'),
    );

    expect(cycle.physicalExecution?.currentSet).toMatchObject({ setNumber: 1, status: 'PENDING' });
    expect(cycle.physicalExecution?.pendingRemainingSetStrategy).toBe('shorten');
  });

  it('cancels a pending physical override when normal mode is restored before the boundary', () => {
    const cycle = createCycle();
    cycle.start(STARTED_AT);
    cycle.selectPhysicalExercise(
      EntityId.create('push-ups'),
      EXERCISE_MEASUREMENT_TYPE.repetitions,
      WATER_AT,
    );
    cycle.startPhysicalExecution(LATER);
    cycle.shorten(moment('07:31'));

    cycle.revertShortened(moment('07:32'));

    expect(cycle.physicalExecution?.pendingRemainingSetStrategy).toBeNull();
  });
});

function createCycle(): MorningCycle {
  return MorningCycle.create({
    id: EntityId.create('morning-cycle'),
    dayId: EntityId.create('day'),
    dateKey: DATE,
    occurredAt: CREATED_AT,
  });
}

function rehydratePhysical(
  overrides: Partial<
    Pick<
      MorningCycleRehydrationData,
      'physicalStatus' | 'physicalUpdatedAt' | 'physicalPlanItems' | 'physicalExecution'
    >
  > & { readonly physicalStatus: MorningPhysicalStatus },
): MorningCycle {
  return MorningCycle.rehydrate({
    id: EntityId.create('morning-cycle-rehydrated'),
    dayId: EntityId.create('day'),
    dateKey: DATE,
    state: MORNING_CYCLE_STATE.inProgress,
    startedAt: STARTED_AT,
    finishedAt: null,
    shortenedMode: false,
    stageStates: [],
    waterCompletedAt: null,
    waterAmountMl: null,
    physicalStatus: overrides.physicalStatus,
    physicalUpdatedAt: overrides.physicalUpdatedAt ?? null,
    physicalPlanItems: overrides.physicalPlanItems ?? [],
    physicalExecution: overrides.physicalExecution ?? null,
    updatedAt: READY_AT,
    version: 4,
  });
}

function rehydrateMirrorReady(options: {
  readonly physicalStatus:
    typeof MORNING_PHYSICAL_STATUS.done | typeof MORNING_PHYSICAL_STATUS.skipped;
  readonly mirror?: {
    readonly status: (typeof MORNING_STAGE_STATUS)[keyof typeof MORNING_STAGE_STATUS];
    readonly updatedAt: Date | null;
  };
}): MorningCycle {
  return MorningCycle.rehydrate({
    id: EntityId.create('morning-cycle-mirror'),
    dayId: EntityId.create('day'),
    dateKey: DATE,
    state: MORNING_CYCLE_STATE.inProgress,
    startedAt: STARTED_AT,
    finishedAt: null,
    shortenedMode: false,
    stageStates: [
      {
        stageId: MORNING_STAGE_ID.coldShower,
        status: MORNING_STAGE_STATUS.completed,
        updatedAt: WATER_AT,
      },
      ...(options.mirror === undefined
        ? []
        : [
            {
              stageId: MORNING_STAGE_ID.mirror,
              status: options.mirror.status,
              updatedAt: options.mirror.updatedAt,
            },
          ]),
    ],
    waterCompletedAt: WATER_AT,
    waterAmountMl: 250,
    physicalStatus: options.physicalStatus,
    physicalUpdatedAt: READY_AT,
    physicalPlanItems: [],
    physicalExecution: null,
    updatedAt: options.mirror?.updatedAt ?? READY_AT,
    version: 6,
  });
}

function repetitionPlan(
  exerciseDefinitionId: string,
  sets: number,
  targetReps: number,
): MorningPhysicalPlanItem {
  return {
    exerciseDefinitionId: EntityId.create(exerciseDefinitionId),
    measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
    sets,
    targetReps,
  };
}

function assertSinglePhysicalChange(
  cycle: MorningCycle,
  occurredAt: Date,
  command: () => unknown,
): void {
  const version = cycle.version;
  command();
  expect(cycle.version).toBe(version + 1);
  expect(cycle.updatedAt).toEqual(occurredAt);
  expect(cycle.physicalUpdatedAt).toEqual(occurredAt);
}

function moment(hhmm: string): Date {
  return new Date(`2026-08-23T${hhmm}:00.000+09:00`);
}
