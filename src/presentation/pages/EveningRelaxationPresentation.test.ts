import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  EVENING_CYCLE_MODE,
  EVENING_CYCLE_STATE,
  EveningCycle,
  RELAXATION_PRACTICE,
  SCREEN_FREE_STATE,
  type EveningCycleMode,
} from '../../domain';
import {
  RELAXATION_PRACTICE_OPTIONS,
  buildEveningRelaxationModel,
} from './EveningRelaxationPresentation';

describe('EveningRelaxationPresentation', () => {
  it('показывает пять стабильных практик и исходный active-контракт', () => {
    const cycle = initializedCycle();

    const model = buildEveningRelaxationModel(cycle, at('21:00:00'), false);

    expect(RELAXATION_PRACTICE_OPTIONS.map((option) => option.label)).toEqual([
      'Чтение',
      'Дыхание',
      'Растяжка',
      'Медитация',
      'Спокойная музыка',
    ]);
    expect(model).toMatchObject({
      available: true,
      readOnly: false,
      selectedPractice: RELAXATION_PRACTICE.reading,
      selectedPracticeLabel: 'Чтение',
      practiceDurationMinutes: 15,
      practiceTimer: { state: 'NOT_STARTED', remainingSeconds: 900 },
      screenFree: { state: SCREEN_FREE_STATE.pending, remainingSeconds: 1500 },
      ready: false,
      disabledReason: 'Завершите напиток',
      continuationLabel: 'Перейти ко сну',
      hasActiveClock: false,
    });
  });

  it('вычисляет running/expired timer, но не завершает практику автоматически', () => {
    const cycle = initializedCycle();
    cycle.startRelaxationPracticeTimer(at('21:01:00'));

    const running = buildEveningRelaxationModel(cycle, at('21:05:30'), false);
    const expired = buildEveningRelaxationModel(cycle, at('21:16:00'), false);

    expect(running.practiceTimer).toMatchObject({ state: 'RUNNING', remainingSeconds: 630 });
    expect(running.hasActiveClock).toBe(true);
    expect(expired.practiceTimer).toMatchObject({ state: 'EXPIRED', remainingSeconds: 0 });
    expect(expired.practiceCompleted).toBe(false);
  });

  it('различает active, elapsed и consciously skipped screen-free', () => {
    const activeCycle = initializedCycle();
    activeCycle.startRelaxationScreenFree(at('21:01:00'));
    const active = buildEveningRelaxationModel(activeCycle, at('21:10:00'), false);
    const elapsed = buildEveningRelaxationModel(activeCycle, at('21:26:00'), false);
    const skippedCycle = initializedCycle();
    skippedCycle.skipRelaxationScreenFree(at('21:02:00'));
    const skipped = buildEveningRelaxationModel(skippedCycle, at('21:03:00'), false);

    expect(active.screenFree).toMatchObject({
      state: SCREEN_FREE_STATE.active,
      remainingSeconds: 960,
    });
    expect(active.hasActiveClock).toBe(true);
    expect(elapsed.screenFree).toMatchObject({ state: 'ELAPSED', remainingSeconds: 0 });
    expect(skipped.screenFree).toMatchObject({
      state: SCREEN_FREE_STATE.skipped,
      outcomeLabel: 'Пропущено сегодня',
      tone: 'skipped',
    });
  });

  it('выдаёт первую недостающую причину в визуальном порядке и готовый CTA', () => {
    const cycle = initializedCycle();
    cycle.completeRelaxationDrink(at('21:01:00'));
    expect(buildEveningRelaxationModel(cycle, at('21:02:00'), false).disabledReason).toBe(
      'Завершите гигиену',
    );
    cycle.completeRelaxationHygiene(at('21:03:00'));
    expect(buildEveningRelaxationModel(cycle, at('21:04:00'), false).disabledReason).toBe(
      'Завершите период без экранов',
    );
    cycle.skipRelaxationScreenFree(at('21:05:00'));
    expect(buildEveningRelaxationModel(cycle, at('21:06:00'), false).disabledReason).toBe(
      'Завершите практику',
    );
    cycle.completeRelaxationPractice(at('21:07:00'));

    const ready = buildEveningRelaxationModel(cycle, at('21:08:00'), false);

    expect(ready.ready).toBe(true);
    expect(ready.disabledReason).toBeNull();
  });

  it.each([
    [EVENING_CYCLE_MODE.normal, 15, 25],
    [EVENING_CYCLE_MODE.quick, 5, 10],
    [EVENING_CYCLE_MODE.emergency, 5, 10],
  ] as const)('отражает длительности режима %s', (mode, practice, screenFree) => {
    const model = buildEveningRelaxationModel(
      initializedCycle(mode, practice, screenFree),
      at('21:00:00'),
      false,
    );

    expect(model.practiceDurationMinutes).toBe(practice);
    expect(model.screenFree.durationMinutes).toBe(screenFree);
  });

  it('представляет QUICK как короткое ядро без напитка и screen-free', () => {
    const cycle = initializedCycle(EVENING_CYCLE_MODE.quick, 5, 10);
    cycle.completeRelaxationHygiene(at('21:01:00'));
    cycle.completeRelaxationPractice(at('21:02:00'));

    const model = buildEveningRelaxationModel(cycle, at('21:03:00'), false);

    expect(model).toMatchObject({
      shortMode: true,
      durationRange: { min: 2, max: 5 },
      ready: true,
      disabledReason: null,
    });
  });

  it('различает current-only replacement и сохранённый новый default', () => {
    const currentOnly = initializedCycle();
    currentOnly.chooseRelaxationPractice(RELAXATION_PRACTICE.meditation, false, at('21:01:00'));
    const persistent = initializedCycle();
    persistent.chooseRelaxationPractice(RELAXATION_PRACTICE.breathing, true, at('21:01:00'));

    expect(buildEveningRelaxationModel(currentOnly, at('21:02:00'), false)).toMatchObject({
      selectedPracticeLabel: 'Медитация',
      defaultPracticeLabel: 'Чтение',
      defaultChangedForFuture: false,
    });
    expect(buildEveningRelaxationModel(persistent, at('21:02:00'), false)).toMatchObject({
      selectedPracticeLabel: 'Дыхание',
      defaultPracticeLabel: 'Дыхание',
      defaultChangedForFuture: true,
    });
  });

  it('безопасно представляет legacy history без R5 facts', () => {
    const model = buildEveningRelaxationModel(
      cycle(EVENING_CYCLE_STATE.shutdown),
      at('21:00:00'),
      true,
    );

    expect(model).toMatchObject({
      available: false,
      readOnly: true,
      legacyMessage: 'Расслабление не записывалось для этого вечера',
      ready: false,
      hasActiveClock: false,
    });
  });
});

function initializedCycle(
  mode: EveningCycleMode = EVENING_CYCLE_MODE.normal,
  practiceDuration = 15,
  screenFreeDuration: 10 | 25 = 25,
): EveningCycle {
  const result = cycle(EVENING_CYCLE_STATE.relaxing, mode);
  result.initializeRelaxation(
    RELAXATION_PRACTICE.reading,
    practiceDuration,
    screenFreeDuration,
    at('21:00:00'),
  );
  return result;
}

function cycle(
  state: (typeof EVENING_CYCLE_STATE)[keyof typeof EVENING_CYCLE_STATE],
  mode: EveningCycleMode = EVENING_CYCLE_MODE.normal,
): EveningCycle {
  return EveningCycle.rehydrate({
    id: EntityId.create('relaxation-presentation-cycle'),
    dayId: EntityId.create('relaxation-presentation-day'),
    dateKey: DayDate.create('2026-08-30'),
    state,
    mode,
    startedAt: at('20:00:00'),
    updatedAt: at('20:00:00'),
    completedAt: null,
    version: 1,
  });
}

function at(time: string): Date {
  return new Date(`2026-08-30T${time}.000Z`);
}
