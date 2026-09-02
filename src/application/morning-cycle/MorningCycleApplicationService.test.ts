import { describe, expect, it } from 'vitest';
import {
  Day,
  DayDate,
  EntityId,
  EXERCISE_DEFINITION_SOURCE,
  EXERCISE_MEASUREMENT_TYPE,
  ExerciseDefinition,
  MORNING_CYCLE_STATE,
  MORNING_PHYSICAL_SET_STATUS,
  MORNING_PHYSICAL_STATUS,
  MORNING_SHORTENED_ACTION,
  MORNING_SHORTENED_MODE_STATE,
  MORNING_STAGE_ID,
  MORNING_STAGE_STATUS,
  MorningCycle,
} from '../../domain';
import {
  FakeClock,
  FakeCurrentDateProvider,
  FakeDayRepository,
  FakeIdGenerator,
} from '../../test/helpers/Fakes';
import type { MorningCycleRepository } from '../ports/MorningCycleRepository';
import type { ExerciseDefinitionRepository } from '../ports/ExerciseDefinitionRepository';
import {
  MorningCycleApplicationService,
  cloneMorningCycle,
} from './MorningCycleApplicationService';

const TODAY = DayDate.create('2026-08-23');
const YESTERDAY = DayDate.create('2026-08-22');
const TOMORROW = DayDate.create('2026-08-24');
const NOW = new Date('2026-08-23T07:12:00.000+09:00');

describe('MorningCycleApplicationService', () => {
  it('сохраняет полный detailed physical lifecycle через существующий CAS-путь', async () => {
    const context = await createContext();
    await context.service.start(TODAY);
    await context.service.selectPhysicalExercise(TODAY, EntityId.create('push-ups'));
    await context.service.adjustPhysicalExercise(TODAY, EntityId.create('push-ups'), {
      field: 'sets',
      delta: -1,
    });

    context.clock.setTime(at('07:13'));
    const started = await context.service.startPhysicalExecution(TODAY);
    expect(started.physicalStatus).toBe(MORNING_PHYSICAL_STATUS.inProgress);
    expect(started.physicalExecution?.startedAt).toEqual(at('07:13'));
    expect(started.physicalExecution?.sets).toHaveLength(2);
    expect(
      started.physicalExecution?.sets.every(
        (set) => set.status === MORNING_PHYSICAL_SET_STATUS.pending,
      ),
    ).toBe(true);

    context.clock.setTime(at('07:14'));
    expect(
      (await context.service.pausePhysicalExecution(TODAY)).physicalExecution?.pausedAt,
    ).toEqual(at('07:14'));
    context.clock.setTime(at('07:15'));
    expect(
      (await context.service.resumePhysicalExecution(TODAY)).physicalExecution?.pauseIntervals,
    ).toEqual([{ startedAt: at('07:14'), endedAt: at('07:15') }]);

    context.clock.setTime(at('07:16'));
    const firstResult = await context.service.completePhysicalSet(
      TODAY,
      EntityId.create('push-ups'),
      1,
      { measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions, actualReps: 14 },
    );
    expect(firstResult.physicalExecution?.activeSetIndex).toBe(0);
    expect(firstResult.physicalExecution?.sets[0]).toMatchObject({
      status: MORNING_PHYSICAL_SET_STATUS.completed,
      actualReps: 14,
      resolvedAt: at('07:16'),
    });

    const beforeAdvance = firstResult.physicalExecution;
    context.clock.setTime(at('07:17'));
    const advanced = await context.service.advancePhysicalExecution(TODAY);
    expect(advanced.physicalExecution?.activeSetIndex).toBe(1);
    expect(advanced.physicalExecution?.sets).toEqual(beforeAdvance?.sets);
    expect(advanced.physicalExecution?.pauseIntervals).toEqual(beforeAdvance?.pauseIntervals);

    context.clock.setTime(at('07:18'));
    const skipped = await context.service.skipPhysicalSet(TODAY, EntityId.create('push-ups'), 2);
    expect(skipped.physicalExecution?.sets[1]).toMatchObject({
      status: MORNING_PHYSICAL_SET_STATUS.skipped,
      resolvedAt: at('07:18'),
    });

    context.clock.setTime(at('07:19'));
    const completed = await context.service.completePhysicalExecution(TODAY);
    expect(completed.physicalStatus).toBe(MORNING_PHYSICAL_STATUS.done);
    expect(completed.physicalExecution?.completedAt).toEqual(at('07:19'));
    expect((await context.repository.findByDateKey(TODAY))?.physicalExecution?.completedAt).toEqual(
      at('07:19'),
    );
  });

  it('восстанавливает persistable detailed execution из legacy IN_PROGRESS', async () => {
    const context = await createContext();
    const physicalUpdatedAt = at('07:10');
    const legacy = MorningCycle.rehydrate({
      id: EntityId.create('legacy-cycle'),
      dayId: EntityId.create('today'),
      dateKey: TODAY,
      state: MORNING_CYCLE_STATE.inProgress,
      startedAt: at('07:00'),
      finishedAt: null,
      shortenedMode: false,
      stageStates: [],
      waterCompletedAt: null,
      waterAmountMl: null,
      physicalStatus: MORNING_PHYSICAL_STATUS.inProgress,
      physicalUpdatedAt,
      physicalPlanItems: [
        {
          exerciseDefinitionId: EntityId.create('push-ups'),
          measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
          sets: 2,
          targetReps: 10,
        },
      ],
      physicalExecution: null,
      updatedAt: physicalUpdatedAt,
      version: 4,
    });
    await context.repository.createIfAbsent(legacy);

    const recovered = await context.service.recoverPhysicalExecution(TODAY);

    expect(recovered.physicalExecution?.startedAt).toEqual(physicalUpdatedAt);
    expect(recovered.physicalExecution?.sets).toHaveLength(2);
    expect(
      recovered.physicalExecution?.sets.every(
        (set) => set.status === MORNING_PHYSICAL_SET_STATUS.pending,
      ),
    ).toBe(true);
    expect((await context.repository.findByDateKey(TODAY))?.physicalExecution).not.toBeNull();
  });

  it('проверяет current-date guard до repository для всех detailed physical команд', async () => {
    const context = await createContext();
    const commands = [
      () => context.service.startPhysicalExecution(YESTERDAY),
      () => context.service.recoverPhysicalExecution(YESTERDAY),
      () => context.service.pausePhysicalExecution(YESTERDAY),
      () => context.service.resumePhysicalExecution(YESTERDAY),
      () =>
        context.service.completePhysicalSet(YESTERDAY, EntityId.create('push-ups'), 1, {
          measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
          actualReps: 10,
        }),
      () => context.service.skipPhysicalSet(YESTERDAY, EntityId.create('push-ups'), 1),
      () => context.service.advancePhysicalExecution(YESTERDAY),
      () => context.service.completePhysicalExecution(YESTERDAY),
    ];

    for (const command of commands) {
      context.repository.resetCounts();
      expect(command).toThrowError('Изменять утренний блок можно только для текущего дня.');
      expect(context.repository.findByDateKeyCount).toBe(0);
    }
  });

  it('отклоняет recovery для READY, detailed IN_PROGRESS, пустого legacy и terminal фактов', async () => {
    const ready = await createContext();
    await ready.service.start(TODAY);
    await ready.service.selectPhysicalExercise(TODAY, EntityId.create('push-ups'));
    await expect(ready.service.recoverPhysicalExecution(TODAY)).rejects.toMatchObject({
      code: 'morning_cycle.invalid_physical_transition',
    });

    const detailed = await createContext();
    await prepareRunningExecution(detailed);
    await expect(detailed.service.recoverPhysicalExecution(TODAY)).rejects.toMatchObject({
      code: 'morning_cycle.invalid_physical_transition',
    });

    const empty = await createContext();
    await empty.repository.createIfAbsent(
      legacyPhysicalCycle('empty-legacy', MORNING_PHYSICAL_STATUS.inProgress, []),
    );
    await expect(empty.service.recoverPhysicalExecution(TODAY)).rejects.toMatchObject({
      code: 'morning_cycle.physical_execution_unrecoverable',
    });

    for (const status of [MORNING_PHYSICAL_STATUS.done, MORNING_PHYSICAL_STATUS.skipped] as const) {
      const terminal = await createContext();
      await terminal.repository.createIfAbsent(legacyPhysicalCycle(`terminal-${status}`, status));
      await expect(terminal.service.recoverPhysicalExecution(TODAY)).rejects.toMatchObject({
        code:
          status === MORNING_PHYSICAL_STATUS.done
            ? 'morning_cycle.physical_completed'
            : 'morning_cycle.physical_skipped',
      });
    }
  });

  it('сохраняет идемпотентность повторных start, pause, resume и final completion', async () => {
    const context = await createContext();
    await prepareRunningExecution(context);

    const startedVersion = (await context.repository.findByDateKey(TODAY))!.version;
    context.repository.resetCounts();
    expect((await context.service.startPhysicalExecution(TODAY)).version).toBe(startedVersion);
    expect(context.repository.saveAttemptCount).toBe(0);

    context.clock.setTime(at('07:14'));
    const paused = await context.service.pausePhysicalExecution(TODAY);
    context.repository.resetCounts();
    expect((await context.service.pausePhysicalExecution(TODAY)).version).toBe(paused.version);
    expect(context.repository.saveAttemptCount).toBe(0);

    context.clock.setTime(at('07:15'));
    const resumed = await context.service.resumePhysicalExecution(TODAY);
    context.repository.resetCounts();
    expect((await context.service.resumePhysicalExecution(TODAY)).version).toBe(resumed.version);
    expect(context.repository.saveAttemptCount).toBe(0);

    context.clock.setTime(at('07:16'));
    await context.service.skipPhysicalSet(TODAY, EntityId.create('push-ups'), 1);
    context.clock.setTime(at('07:17'));
    await context.service.advancePhysicalExecution(TODAY);
    context.clock.setTime(at('07:18'));
    await context.service.skipPhysicalSet(TODAY, EntityId.create('push-ups'), 2);
    context.clock.setTime(at('07:19'));
    const completed = await context.service.completePhysicalExecution(TODAY);
    context.repository.resetCounts();
    const repeated = await context.service.completePhysicalExecution(TODAY);
    expect(repeated.version).toBe(completed.version);
    expect(repeated.physicalExecution?.completedAt).toEqual(at('07:19'));
    expect(context.repository.saveAttemptCount).toBe(0);
  });

  it('перезагружает authoritative state на CAS retry и не записывает stale set identity', async () => {
    const context = await createContext();
    await prepareRunningExecution(context);
    context.clock.setTime(at('07:14'));
    context.repository.resetCounts();
    context.repository.conflictNextSaveWith((winner) => {
      winner.skipPhysicalSet(EntityId.create('push-ups'), 1, at('07:14'));
      winner.advancePhysicalExecution(at('07:14'));
      return winner;
    });

    await expect(
      context.service.completePhysicalSet(TODAY, EntityId.create('push-ups'), 1, {
        measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
        actualReps: 14,
      }),
    ).rejects.toMatchObject({ code: 'morning_physical_execution.stale_set' });

    const stored = await context.repository.findByDateKey(TODAY);
    expect(context.repository.findByDateKeyCount).toBe(3);
    expect(context.repository.saveAttemptCount).toBe(1);
    expect(stored?.physicalExecution?.activeSetIndex).toBe(1);
    expect(stored?.physicalExecution?.sets[0]?.status).toBe(MORNING_PHYSICAL_SET_STATUS.skipped);
    expect(stored?.physicalExecution?.sets[1]?.status).toBe(MORNING_PHYSICAL_SET_STATUS.pending);
  });

  it('успешный CAS retry сохраняет независимое authoritative изменение', async () => {
    const context = await createContext();
    await prepareRunningExecution(context);
    context.clock.setTime(at('07:14'));
    context.repository.resetCounts();
    context.repository.conflictNextSaveWith((winner) => {
      winner.shorten(at('07:14'));
      return winner;
    });

    const paused = await context.service.pausePhysicalExecution(TODAY);

    expect(paused.shortenedMode).toBe(true);
    expect(paused.physicalExecution?.pausedAt).toEqual(at('07:14'));
    expect(context.repository.findByDateKeyCount).toBe(2);
    expect(context.repository.saveAttemptCount).toBe(2);
  });

  it('возвращает concurrent_change после двух проигранных CAS записей', async () => {
    const context = await createContext();
    await prepareRunningExecution(context);
    context.clock.setTime(at('07:14'));
    context.repository.resetCounts();
    context.repository.failNextSaves(2);

    await expect(context.service.pausePhysicalExecution(TODAY)).rejects.toMatchObject({
      code: 'morning_cycle.concurrent_change',
      message: 'Утренний блок изменился в другом окне. Повторите операцию.',
    });
    expect(context.repository.findByDateKeyCount).toBe(2);
    expect(context.repository.saveAttemptCount).toBe(2);
    expect((await context.repository.findByDateKey(TODAY))?.physicalExecution?.pausedAt).toBeNull();
  });

  it('создаёт и запускает единственный цикл текущего дня идемпотентно', async () => {
    const context = await createContext();

    const first = await context.service.start(TODAY);
    context.clock.setTime(new Date('2026-08-23T08:00:00.000+09:00'));
    const second = await context.service.start(TODAY);

    expect(second.id.equals(first.id)).toBe(true);
    expect(second.startedAt).toEqual(NOW);
    expect(context.repository.all()).toHaveLength(1);
  });

  it('создаёт NOT_STARTED цикл и сохраняет состояние без запуска ритуала', async () => {
    const context = await createContext();

    expect(context.service.recordStartState).toBeTypeOf('function');
    const recorded = await context.service.recordStartState(TODAY, {
      energy: 6,
      clarity: 7,
      mood: 'спокойный',
    });

    expect(recorded.state).toBe(MORNING_CYCLE_STATE.notStarted);
    expect(recorded.startedAt).toBeNull();
    expect(recorded.startState).toEqual({
      energy: 6,
      clarity: 7,
      mood: 'спокойный',
      recordedAt: NOW,
    });
    expect(context.repository.all()).toHaveLength(1);
  });

  it('сохраняет один факт воды при повторном нажатии', async () => {
    const context = await createContext();
    await context.service.start(TODAY);

    const first = await context.service.completeWater(TODAY);
    context.clock.setTime(new Date('2026-08-23T08:00:00.000+09:00'));
    const second = await context.service.completeWater(TODAY);

    expect(second.waterCompletedAt).toEqual(first.waterCompletedAt);
    expect(second.waterAmountMl).toBe(250);
    expect(context.repository.all()).toHaveLength(1);
  });

  it('сохраняет completed cold shower через существующий CAS-путь', async () => {
    const context = await createContext();
    await context.service.start(TODAY);

    const first = await context.service.completeColdShower(TODAY);
    const version = first.version;
    context.clock.setTime(new Date('2026-08-23T08:00:00.000+09:00'));
    const repeated = await context.service.completeColdShower(TODAY);

    expect(repeated.version).toBe(version);
    expect(repeated.stageStates).toContainEqual({
      stageId: MORNING_STAGE_ID.coldShower,
      status: MORNING_STAGE_STATUS.completed,
      updatedAt: NOW,
    });
  });

  it('сохраняет shower skip и не разрешает заменить его завершением', async () => {
    const context = await createContext();
    await context.service.start(TODAY);

    const skipped = await context.service.skipColdShower(TODAY);

    expect(skipped.stageStates).toContainEqual({
      stageId: MORNING_STAGE_ID.coldShower,
      status: MORNING_STAGE_STATUS.skipped,
      updatedAt: NOW,
    });
    await expect(context.service.completeColdShower(TODAY)).rejects.toMatchObject({
      code: 'morning_cycle.cold_shower_resolved',
    });
  });

  it('не изменяет cold shower для прошлой или будущей даты', async () => {
    const context = await createContext();

    expect(() => context.service.completeColdShower(YESTERDAY)).toThrowError(
      'Изменять утренний блок можно только для текущего дня.',
    );
    expect(() => context.service.skipColdShower(TOMORROW)).toThrowError(
      'Изменять утренний блок можно только для текущего дня.',
    );
  });

  it('сохраняет Mirror через CAS и оставляет повтор без записи', async () => {
    const context = await createContext();
    await prepareMirrorReady(context);
    context.clock.setTime(at('07:20'));

    const completed = await context.service.completeMirror(TODAY);
    expect(completed.stageStates).toContainEqual({
      stageId: MORNING_STAGE_ID.mirror,
      status: MORNING_STAGE_STATUS.completed,
      updatedAt: at('07:20'),
    });
    expect((await context.repository.findByDateKey(TODAY))?.stageStates).toContainEqual({
      stageId: MORNING_STAGE_ID.mirror,
      status: MORNING_STAGE_STATUS.completed,
      updatedAt: at('07:20'),
    });

    context.repository.resetCounts();
    context.clock.setTime(at('07:25'));
    const repeated = await context.service.completeMirror(TODAY);
    expect(repeated.version).toBe(completed.version);
    expect(repeated.stageStates).toContainEqual({
      stageId: MORNING_STAGE_ID.mirror,
      status: MORNING_STAGE_STATUS.completed,
      updatedAt: at('07:20'),
    });
    expect(context.repository.saveAttemptCount).toBe(0);
  });

  it('проверяет current-date guard до repository для Mirror', async () => {
    const context = await createContext();
    context.repository.resetCounts();

    expect(() => context.service.completeMirror(YESTERDAY)).toThrowError(
      'Изменять утренний блок можно только для текущего дня.',
    );
    expect(() => context.service.completeMirror(TOMORROW)).toThrowError(
      'Изменять утренний блок можно только для текущего дня.',
    );
    expect(context.repository.findByDateKeyCount).toBe(0);
  });

  it('перезагружает authoritative Morning на CAS retry завершения Mirror', async () => {
    const context = await createContext();
    await prepareMirrorReady(context);
    context.clock.setTime(at('07:20'));
    context.repository.resetCounts();
    context.repository.conflictNextSaveWith((winner) => {
      winner.shorten(at('07:20'));
      return winner;
    });

    const completed = await context.service.completeMirror(TODAY);

    expect(completed.shortenedMode).toBe(true);
    expect(completed.stageStates).toContainEqual({
      stageId: MORNING_STAGE_ID.mirror,
      status: MORNING_STAGE_STATUS.completed,
      updatedAt: at('07:20'),
    });
    expect(context.repository.findByDateKeyCount).toBe(2);
    expect(context.repository.saveAttemptCount).toBe(2);
  });

  it('возвращает concurrent_change после двух проигранных Mirror CAS записей', async () => {
    const context = await createContext();
    await prepareMirrorReady(context);
    context.clock.setTime(at('07:20'));
    context.repository.resetCounts();
    context.repository.failNextSaves(2);

    await expect(context.service.completeMirror(TODAY)).rejects.toMatchObject({
      code: 'morning_cycle.concurrent_change',
    });
    expect(context.repository.findByDateKeyCount).toBe(2);
    expect(context.repository.saveAttemptCount).toBe(2);
  });

  it('сохраняет сокращённый режим через существующий CAS-путь', async () => {
    const context = await createContext();
    await context.service.start(TODAY);

    const first = await context.service.shorten(TODAY);
    const version = first.version;
    context.clock.setTime(new Date('2026-08-23T08:00:00.000+09:00'));
    const repeated = await context.service.shorten(TODAY);

    expect(repeated.shortenedMode).toBe(true);
    expect(repeated.version).toBe(version);
  });

  it('не включает сокращённый режим для прошлой или будущей даты', async () => {
    const context = await createContext();

    expect(() => context.service.shorten(YESTERDAY)).toThrowError(
      'Изменять утренний блок можно только для текущего дня.',
    );
    expect(() => context.service.shorten(TOMORROW)).toThrowError(
      'Изменять утренний блок можно только для текущего дня.',
    );
  });

  it('не изменяет прошлую или будущую дату', async () => {
    const context = await createContext();

    await expect(context.service.start(TOMORROW)).rejects.toMatchObject({
      code: 'morning_cycle.current_date_required',
    });
    expect(context.repository.all()).toHaveLength(0);
  });

  it('требует существующий день и запущенное утро для воды', async () => {
    const withoutDay = await createContext(false);
    await expect(withoutDay.service.start(TODAY)).rejects.toMatchObject({
      code: 'morning_cycle.day_not_found',
    });

    const context = await createContext();
    await expect(context.service.completeWater(TODAY)).rejects.toMatchObject({
      code: 'morning_cycle.not_found',
    });
  });

  it('не запускает новый цикл, пока незавершённый прошлый запуск не закрыт', async () => {
    const context = await createContext();
    const yesterday = morningCycle('yesterday-cycle', 'yesterday-day', YESTERDAY);
    yesterday.start(new Date('2026-08-22T07:00:00.000+09:00'));
    await context.repository.createIfAbsent(yesterday);

    await expect(context.service.start(TODAY)).rejects.toMatchObject({
      code: 'morning_cycle.previous_unfinished_requires_resolution',
    });
    expect(await context.repository.findByDateKey(TODAY)).toBeNull();

    await context.service.abandonUnfinished(YESTERDAY);
    const today = await context.service.start(TODAY);

    expect(today.dateKey.equals(TODAY)).toBe(true);
    expect((await context.service.getCurrentContext()).previousUnfinished).toBeNull();
  });

  it('сохраняет идемпотентный доступ к уже созданному сегодняшнему циклу при recovery', async () => {
    const context = await createContext();
    const yesterday = morningCycle('yesterday-cycle', 'yesterday-day', YESTERDAY);
    yesterday.start(new Date('2026-08-22T07:00:00.000+09:00'));
    const today = morningCycle('today-cycle', 'today', TODAY);
    today.start(NOW);
    await context.repository.createIfAbsent(yesterday);
    await context.repository.createIfAbsent(today);

    const resumed = await context.service.start(TODAY);

    expect(resumed.id.equals(today.id)).toBe(true);
    expect(context.repository.all()).toHaveLength(2);
    expect(
      (await context.service.getCurrentContext()).previousUnfinished?.id.equals(yesterday.id),
    ).toBe(true);
  });

  it('не запускает уже созданный not-started цикл до закрытия прошлого запуска', async () => {
    const context = await createContext();
    const yesterday = morningCycle('yesterday-cycle', 'yesterday-day', YESTERDAY);
    yesterday.start(new Date('2026-08-22T07:00:00.000+09:00'));
    const today = morningCycle('today-cycle', 'today', TODAY);
    await context.repository.createIfAbsent(yesterday);
    await context.repository.createIfAbsent(today);

    await expect(context.service.start(TODAY)).rejects.toMatchObject({
      code: 'morning_cycle.previous_unfinished_requires_resolution',
    });
    expect((await context.repository.findByDateKey(TODAY))?.startedAt).toBeNull();

    await context.service.abandonUnfinished(YESTERDAY);
    const started = await context.service.start(TODAY);
    expect(started.id.equals(today.id)).toBe(true);
    expect(started.startedAt).toEqual(NOW);
  });

  it('идемпотентно закрывает вчерашний запуск, не создавая новый', async () => {
    const context = await createContext();
    const yesterday = morningCycle('yesterday-cycle', 'yesterday-day', YESTERDAY);
    yesterday.start(new Date('2026-08-22T07:00:00.000+09:00'));
    await context.repository.createIfAbsent(yesterday);

    const first = await context.service.abandonUnfinished(YESTERDAY);
    context.clock.setTime(new Date('2026-08-23T08:00:00.000+09:00'));
    const second = await context.service.abandonUnfinished(YESTERDAY);

    expect(second.id.equals(first.id)).toBe(true);
    expect(second.state).toBe(MORNING_CYCLE_STATE.abandoned);
    expect(second.finishedAt).toEqual(first.finishedAt);
    expect(second.isActive()).toBe(false);
    expect(context.repository.all()).toHaveLength(1);
    expect((await context.service.getCurrentContext()).previousUnfinished).toBeNull();
  });

  it('идемпотентно завершает сегодняшний запуск и исключает его из active context', async () => {
    const context = await createContext(true, true);
    await context.service.start(TODAY);
    await context.service.completeWater(TODAY);
    await context.service.completeColdShower(TODAY);
    await context.service.skipPhysical(TODAY);

    const first = await context.service.finish(TODAY);
    context.clock.setTime(new Date('2026-08-23T08:00:00.000+09:00'));
    const second = await context.service.finish(TODAY);

    expect(second.state).toBe(MORNING_CYCLE_STATE.finished);
    expect(second.finishedAt).toEqual(first.finishedAt);
    expect(second.isActive()).toBe(false);
    expect((await context.service.getCurrentContext()).current).toBeNull();
  });

  it('автоматически переводит утро в ready_to_work без completed-state Mirror', async () => {
    const context = await createContext(true, true);
    await context.service.start(TODAY);
    await context.service.completeWater(TODAY);
    await context.service.completeColdShower(TODAY);

    const ready = await context.service.skipPhysical(TODAY);

    expect(ready.state).toBe(MORNING_CYCLE_STATE.readyToWork);
    expect(
      ready.stageStates.find((stage) => stage.stageId === MORNING_STAGE_ID.mirror),
    ).toBeUndefined();
  });

  it('разрешает явный вариант без главного действия и сохраняет его идемпотентно', async () => {
    const context = await createContext(true, false);
    await context.service.start(TODAY);
    await context.service.completeWater(TODAY);
    await context.service.skipColdShower(TODAY);
    await context.service.skipPhysical(TODAY);

    const first = await context.service.skipMainAction(TODAY);
    const second = await context.service.skipMainAction(TODAY);

    expect(first.state).toBe(MORNING_CYCLE_STATE.readyToWork);
    expect(second.version).toBe(first.version);
    expect(second.stageStates).toContainEqual({
      stageId: MORNING_STAGE_ID.mainAction,
      status: MORNING_STAGE_STATUS.skipped,
      updatedAt: first.stageStates.find((stage) => stage.stageId === MORNING_STAGE_ID.mainAction)
        ?.updatedAt,
    });
  });

  it('не позволяет специальной команде закрывать сегодняшний или будущий запуск', async () => {
    const context = await createContext();

    await expect(context.service.abandonUnfinished(TODAY)).rejects.toMatchObject({
      code: 'morning_cycle.previous_date_required',
    });
    await expect(context.service.abandonUnfinished(TOMORROW)).rejects.toMatchObject({
      code: 'morning_cycle.previous_date_required',
    });
  });

  it('выбирает существующее упражнение через текущий CAS-путь', async () => {
    const context = await createContext();
    await context.service.start(TODAY);

    const selected = await context.service.selectPhysicalExercise(
      TODAY,
      EntityId.create('push-ups'),
    );

    expect(selected.physicalPlanItems[0]?.exerciseDefinitionId.toString()).toBe('push-ups');
    expect(selected.physicalPlanItems[0]).toMatchObject({
      measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
      sets: 3,
      targetReps: 10,
    });
  });

  it('снимает выбор и изменяет подходы и цель только для текущей даты', async () => {
    const context = await createContext();
    await context.service.start(TODAY);
    await context.service.selectPhysicalExercise(TODAY, EntityId.create('push-ups'));

    await context.service.adjustPhysicalExercise(TODAY, EntityId.create('push-ups'), {
      field: 'sets',
      delta: 1,
    });
    const adjusted = await context.service.adjustPhysicalExercise(
      TODAY,
      EntityId.create('push-ups'),
      { field: 'target', delta: 1 },
    );
    expect(adjusted.physicalPlanItems[0]).toMatchObject({ sets: 4, targetReps: 11 });

    const empty = await context.service.deselectPhysicalExercise(
      TODAY,
      EntityId.create('push-ups'),
    );
    expect(empty.physicalPlanItems).toEqual([]);
    await expect(
      context.service.selectPhysicalExercise(YESTERDAY, EntityId.create('push-ups')),
    ).rejects.toThrowError('Изменять утренний блок можно только для текущего дня.');
  });

  it('не выбирает отсутствующее или архивированное определение', async () => {
    const context = await createContext();
    await context.service.start(TODAY);

    await expect(
      context.service.selectPhysicalExercise(TODAY, EntityId.create('missing')),
    ).rejects.toMatchObject({ code: 'exercise_definition.not_available' });

    const archived = exerciseDefinition('archived', 'Архивное упражнение');
    archived.archive(new Date('2026-08-23T07:10:00.000+09:00'));
    await context.definitions.add(archived);
    await expect(context.service.selectPhysicalExercise(TODAY, archived.id)).rejects.toMatchObject({
      code: 'exercise_definition.not_available',
    });
  });

  it('активирует и отменяет конфигурацию сокращённого утра через CAS', async () => {
    const context = await createContext();
    await context.service.start(TODAY);
    context.clock.setTime(at('07:13'));

    const shortened = await context.service.activateShortened(TODAY, {
      coldShower: MORNING_SHORTENED_ACTION.skip,
      physical: MORNING_SHORTENED_ACTION.shorten,
      mirror: MORNING_SHORTENED_ACTION.keep,
    });

    expect(shortened.shortenedModeState).toBe(MORNING_SHORTENED_MODE_STATE.shortenedActive);
    expect(shortened.shortenedConfiguration?.physical).toBe(MORNING_SHORTENED_ACTION.shorten);
    context.clock.setTime(at('07:14'));
    const restored = await context.service.revertShortened(TODAY);
    expect(restored.shortenedModeState).toBe(MORNING_SHORTENED_MODE_STATE.revertedToNormal);
    expect(context.repository.saveAttemptCount).toBe(3);
  });
});

class FakeExerciseDefinitionRepository implements ExerciseDefinitionRepository {
  readonly #definitions = new Map<string, ExerciseDefinition>();

  public async findById(id: EntityId): Promise<ExerciseDefinition | null> {
    return this.#definitions.get(id.toString()) ?? null;
  }

  public async findAll(): Promise<readonly ExerciseDefinition[]> {
    return [...this.#definitions.values()];
  }

  public async add(definition: ExerciseDefinition): Promise<boolean> {
    if (this.#definitions.has(definition.id.toString())) return false;
    this.#definitions.set(definition.id.toString(), definition);
    return true;
  }
}

class FakeMorningCycleRepository implements MorningCycleRepository {
  readonly #byDate = new Map<string, MorningCycle>();
  #forcedSaveFailures = 0;
  #nextSaveConflict: ((stored: MorningCycle) => MorningCycle) | null = null;
  public findByDateKeyCount = 0;
  public saveAttemptCount = 0;

  public async findByDayId(dayId: EntityId): Promise<MorningCycle | null> {
    return [...this.#byDate.values()].find((cycle) => cycle.dayId.equals(dayId)) ?? null;
  }

  public async findByDateKey(dateKey: DayDate): Promise<MorningCycle | null> {
    this.findByDateKeyCount += 1;
    return this.#byDate.get(dateKey.toString()) ?? null;
  }

  public async findLatestUnfinishedBefore(dateKey: DayDate): Promise<MorningCycle | null> {
    return (
      [...this.#byDate.values()]
        .filter((cycle) => cycle.dateKey.isBefore(dateKey) && cycle.isActive())
        .sort((left, right) =>
          right.dateKey.toString().localeCompare(left.dateKey.toString()),
        )[0] ?? null
    );
  }

  public async findBetween(startDate: DayDate, endDate: DayDate): Promise<readonly MorningCycle[]> {
    return [...this.#byDate.values()]
      .filter((cycle) => !cycle.dateKey.isBefore(startDate) && !cycle.dateKey.isAfter(endDate))
      .sort((left, right) => right.dateKey.toString().localeCompare(left.dateKey.toString()));
  }

  public async createIfAbsent(cycle: MorningCycle): Promise<MorningCycle> {
    const existing = await this.findByDateKey(cycle.dateKey);
    if (existing !== null) return existing;
    this.#byDate.set(cycle.dateKey.toString(), cycle);
    return cycle;
  }

  public async saveIfVersionMatches(
    cycle: MorningCycle,
    expectedVersion: number,
  ): Promise<boolean> {
    this.saveAttemptCount += 1;
    const stored = this.#byDate.get(cycle.dateKey.toString()) ?? null;
    if (stored !== null && this.#nextSaveConflict !== null) {
      const conflict = this.#nextSaveConflict;
      this.#nextSaveConflict = null;
      const winner = conflict(cloneMorningCycle(stored));
      this.#byDate.set(winner.dateKey.toString(), winner);
      return false;
    }
    if (this.#forcedSaveFailures > 0) {
      this.#forcedSaveFailures -= 1;
      return false;
    }
    if (
      stored === null ||
      !stored.id.equals(cycle.id) ||
      !stored.dayId.equals(cycle.dayId) ||
      stored.version !== expectedVersion
    ) {
      return false;
    }
    this.#byDate.set(cycle.dateKey.toString(), cycle);
    return true;
  }

  public all(): readonly MorningCycle[] {
    return [...this.#byDate.values()];
  }

  public failNextSaves(count: number): void {
    this.#forcedSaveFailures = count;
  }

  public conflictNextSaveWith(conflict: (stored: MorningCycle) => MorningCycle): void {
    this.#nextSaveConflict = conflict;
  }

  public resetCounts(): void {
    this.findByDateKeyCount = 0;
    this.saveAttemptCount = 0;
  }
}

function morningCycle(id: string, dayId: string, date: DayDate): MorningCycle {
  return MorningCycle.create({
    id: EntityId.create(id),
    dayId: EntityId.create(dayId),
    dateKey: date,
    occurredAt: new Date(`${date.toString()}T06:50:00.000+09:00`),
  });
}

async function createContext(seedDay = true, mainActionReady?: boolean) {
  const dayRepository = new FakeDayRepository();
  if (seedDay) {
    dayRepository.seed(
      Day.createCurrentPlanned({
        id: EntityId.create('today'),
        currentDate: TODAY,
        occurredAt: new Date('2026-08-23T00:01:00.000+09:00'),
        createdEventId: EntityId.create('day-created'),
      }),
    );
  }
  const repository = new FakeMorningCycleRepository();
  const definitions = new FakeExerciseDefinitionRepository();
  await definitions.add(exerciseDefinition('push-ups', 'Отжимания'));
  const clock = new FakeClock(NOW);
  return {
    repository,
    definitions,
    clock,
    service: new MorningCycleApplicationService(
      repository,
      dayRepository,
      new FakeCurrentDateProvider(TODAY),
      clock,
      new FakeIdGenerator('morning'),
      definitions,
      mainActionReady === undefined
        ? undefined
        : { execute: async () => ({ ready: mainActionReady }) },
    ),
  };
}

function exerciseDefinition(id: string, name: string): ExerciseDefinition {
  return ExerciseDefinition.create({
    id: EntityId.create(id),
    name,
    measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
    source: EXERCISE_DEFINITION_SOURCE.system,
    occurredAt: new Date('2026-08-23T00:00:00.000+09:00'),
  });
}

function at(hhmm: string): Date {
  return new Date(`2026-08-23T${hhmm}:00.000+09:00`);
}

type TestContext = Awaited<ReturnType<typeof createContext>>;

async function prepareRunningExecution(context: TestContext): Promise<void> {
  await context.service.start(TODAY);
  await context.service.selectPhysicalExercise(TODAY, EntityId.create('push-ups'));
  await context.service.adjustPhysicalExercise(TODAY, EntityId.create('push-ups'), {
    field: 'sets',
    delta: -1,
  });
  context.clock.setTime(at('07:13'));
  await context.service.startPhysicalExecution(TODAY);
}

async function prepareMirrorReady(context: TestContext): Promise<void> {
  await context.service.start(TODAY);
  context.clock.setTime(at('07:13'));
  await context.service.completeWater(TODAY);
  context.clock.setTime(at('07:14'));
  await context.service.completeColdShower(TODAY);
  context.clock.setTime(at('07:15'));
  await context.service.skipPhysical(TODAY);
}

function legacyPhysicalCycle(
  id: string,
  physicalStatus:
    | typeof MORNING_PHYSICAL_STATUS.inProgress
    | typeof MORNING_PHYSICAL_STATUS.done
    | typeof MORNING_PHYSICAL_STATUS.skipped,
  physicalPlanItems: MorningCycle['physicalPlanItems'] = [],
): MorningCycle {
  return MorningCycle.rehydrate({
    id: EntityId.create(id),
    dayId: EntityId.create('today'),
    dateKey: TODAY,
    state: MORNING_CYCLE_STATE.inProgress,
    startedAt: at('07:00'),
    finishedAt: null,
    shortenedMode: false,
    stageStates: [],
    waterCompletedAt: null,
    waterAmountMl: null,
    physicalStatus,
    physicalUpdatedAt: at('07:10'),
    physicalPlanItems,
    physicalExecution: null,
    updatedAt: at('07:10'),
    version: 2,
  });
}
