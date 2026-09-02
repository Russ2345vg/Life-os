import { describe, expect, it } from 'vitest';
import { DomainError } from '../../shared/errors/DomainError';
import { DayDate } from '../day/DayDate';
import { EntityId } from '../shared/EntityId';
import { EveningCycle } from './EveningCycle';
import { EVENING_CYCLE_MODE, EVENING_MODE_REASON } from './EveningCycleMode';
import { EVENING_CYCLE_STATE } from './EveningCycleState';
import { RELAXATION_PRACTICE, SCREEN_FREE_STATE } from './RelaxationSnapshot';
import {
  REFLECTION_DAY_SIGNAL,
  REFLECTION_QUESTION_KIND,
  REFLECTION_QUESTION_TYPE,
  ReflectionQuestion,
  ReflectionResult,
} from '../reflection';

const DATE = DayDate.create('2026-08-14');
const STARTED_AT = new Date('2026-08-14T23:55:00.000+09:00');
const AFTER_MIDNIGHT = new Date('2026-08-15T00:08:00.000+09:00');

describe('EveningCycle', () => {
  it('запускает поздний короткий путь сразу с обязательного ядра Среды', () => {
    const cycle = createCycle();

    cycle.startShort(STARTED_AT);

    expect(cycle.state).toBe(EVENING_CYCLE_STATE.preparing);
    expect(cycle.mode).toBe(EVENING_CYCLE_MODE.quick);
    expect(cycle.modeReason).toBe(EVENING_MODE_REASON.lateNight);
    expect(cycle.startedAt).toEqual(STARTED_AT);
    expect(cycle.skippedStages.map(({ stage }) => stage)).toEqual([
      EVENING_CYCLE_STATE.resolving,
      EVENING_CYCLE_STATE.reflecting,
      EVENING_CYCLE_STATE.planningTomorrow,
    ]);
  });

  it('сохраняет нормализованную optional reason сознательного полного пропуска', () => {
    const cycle = createCycle();

    cycle.skip(AFTER_MIDNIGHT, '  Уже слишком поздно  ');

    expect(cycle.state).toBe(EVENING_CYCLE_STATE.completed);
    expect(cycle.skipReason).toBe('Уже слишком поздно');
    expect(cycle.completedAt).toEqual(AFTER_MIDNIGHT);
  });

  it('проходит единственный нормальный путь и сохраняет исходный жизненный день после полуночи', () => {
    const cycle = createCycle();

    cycle.start(STARTED_AT);
    cycle.beginResolving(STARTED_AT);
    cycle.completeResolving(STARTED_AT);
    finishReflection(cycle);
    cycle.completeReflection(STARTED_AT);
    cycle.completeTomorrowPlanning(STARTED_AT);
    cycle.completePreparation(STARTED_AT);
    finishRelaxation(cycle);
    cycle.complete(AFTER_MIDNIGHT, [id('decision')], [id('action')]);

    expect(cycle.state).toBe(EVENING_CYCLE_STATE.completed);
    expect(cycle.mode).toBe(EVENING_CYCLE_MODE.normal);
    expect(cycle.dateKey.equals(DATE)).toBe(true);
    expect(cycle.dayId.equals(id('day'))).toBe(true);
    expect(cycle.startedAt).toEqual(STARTED_AT);
    expect(cycle.completedAt).toEqual(AFTER_MIDNIGHT);
    expect(cycle.decisionIds.map(String)).toEqual(['decision']);
    expect(cycle.lifeActionIds.map(String)).toEqual(['action']);
  });

  it('делает повторные start и complete идемпотентными', () => {
    const cycle = createCompletedCycle();
    const version = cycle.version;

    cycle.start(AFTER_MIDNIGHT);
    cycle.complete(AFTER_MIDNIGHT, [id('other')], [id('other-action')]);

    expect(cycle.version).toBe(version);
    expect(cycle.decisionIds).toHaveLength(0);
    expect(cycle.completedAt).toEqual(AFTER_MIDNIGHT);
  });

  it('отклоняет переход REFLECTING → COMPLETED и возврат COMPLETED → REFLECTING', () => {
    const reflecting = createCycle();
    reflecting.start(STARTED_AT);
    reflecting.beginResolving(STARTED_AT);
    reflecting.completeResolving(STARTED_AT);

    expect(() => reflecting.complete(AFTER_MIDNIGHT)).toThrowError(
      expect.objectContaining({ code: 'evening_cycle.invalid_transition' }),
    );

    const completed = createCompletedCycle();
    expect(() => completed.beginReflection(AFTER_MIDNIGHT)).toThrowError(
      expect.objectContaining({ code: 'evening_cycle.invalid_transition' }),
    );
  });

  it.each([
    ['quick', EVENING_CYCLE_MODE.quick],
    ['emergency', EVENING_CYCLE_MODE.emergency],
    ['skip', EVENING_CYCLE_MODE.normal],
  ] as const)('фиксирует %s как режим того же завершённого цикла', (operation, mode) => {
    const cycle = createCycle();
    if (operation === 'quick') completeSpecialCycle(cycle, EVENING_CYCLE_MODE.quick);
    if (operation === 'emergency') completeSpecialCycle(cycle, EVENING_CYCLE_MODE.emergency);
    if (operation === 'skip') cycle.skip(AFTER_MIDNIGHT);

    expect(cycle.state).toBe(EVENING_CYCLE_STATE.completed);
    expect(cycle.mode).toBe(mode);
    expect(cycle.completedAt).toEqual(AFTER_MIDNIGHT);
    expect(cycle.startedAt === null).toBe(operation === 'skip');
  });

  it('защищает completedAt и обязательный startedAt при восстановлении', () => {
    expect(() =>
      EveningCycle.rehydrate({
        id: id('cycle'),
        dayId: id('day'),
        dateKey: DATE,
        state: EVENING_CYCLE_STATE.completed,
        mode: EVENING_CYCLE_MODE.normal,
        startedAt: null,
        updatedAt: AFTER_MIDNIGHT,
        completedAt: null,
        version: 1,
      }),
    ).toThrowError(DomainError);
  });

  it('вставляет RELAXING и SLEEP_CHECK перед SHUTDOWN и требует готовность R5', () => {
    const cycle = createPreparingCycle();

    cycle.completePreparation(at('23:00:00'));

    expect(cycle.state).toBe(EVENING_CYCLE_STATE.relaxing);
    expect(cycle.relaxation).toBeNull();
    cycle.initializeRelaxation(RELAXATION_PRACTICE.reading, 15, 25, at('23:01:00'));
    cycle.setBeforeRelaxationRatings(2, 3, at('23:01:30'));
    cycle.completeRelaxationDrink(at('23:02:00'));
    cycle.completeRelaxationHygiene(at('23:03:00'));
    cycle.completeRelaxationPractice(at('23:04:00'));
    cycle.startRelaxationScreenFree(at('23:05:00'));

    expect(() => cycle.completeRelaxation(at('23:29:59'))).toThrowError(
      expect.objectContaining({ code: 'relaxation.not_ready' }),
    );
    cycle.completeRelaxation(at('23:30:00'));

    expect(cycle.state).toBe(EVENING_CYCLE_STATE.sleepCheck);
    expect(cycle.relaxation?.screenFreeState).toBe(SCREEN_FREE_STATE.completed);
    expect(cycle.relaxation?.screenFreeCompletedAt).toEqual(at('23:30:00'));
  });

  it('разрешает действия R5 в любом порядке и осознанный screen-free skip', () => {
    const cycle = createRelaxingCycle();

    cycle.setBeforeRelaxationRatings(2, 3, at('23:00:30'));
    cycle.completeRelaxationPractice(at('23:01:00'));
    cycle.skipRelaxationScreenFree(at('23:02:00'));
    cycle.completeRelaxationDrink(at('23:03:00'));
    cycle.completeRelaxationHygiene(at('23:04:00'));
    cycle.completeRelaxation(at('23:05:00'));

    expect(cycle.state).toBe(EVENING_CYCLE_STATE.sleepCheck);
    expect(cycle.relaxation?.screenFreeState).toBe(SCREEN_FREE_STATE.skipped);
    expect(cycle.skippedStages.some((item) => item.stage === 'RELAXING')).toBe(false);
  });

  it('ведёт special-mode пропуск Environment в RELAXING без ложного пропуска R5', () => {
    const cycle = createPreparingCycle(EVENING_CYCLE_MODE.emergency);

    cycle.skipPreparation(at('23:00:00'));

    expect(cycle.state).toBe(EVENING_CYCLE_STATE.relaxing);
    expect(cycle.skippedStages).toContainEqual(
      expect.objectContaining({
        stage: EVENING_CYCLE_STATE.preparing,
        reason: 'EMERGENCY_MODE',
      }),
    );
    expect(cycle.skippedStages.some((item) => item.stage === EVENING_CYCLE_STATE.relaxing)).toBe(
      false,
    );
  });

  it('переходит через recovery bridge только без R5 snapshot и не фабрикует историю', () => {
    const cycle = createPreparingCycle();
    cycle.completePreparation(at('23:00:00'));

    cycle.recoverLegacyRelaxation(at('23:01:00'));

    expect(cycle.state).toBe(EVENING_CYCLE_STATE.shutdown);
    expect(cycle.relaxation).toBeNull();

    const initialized = createRelaxingCycle();
    expect(() => initialized.recoverLegacyRelaxation(at('23:02:00'))).toThrowError(
      expect.objectContaining({ code: 'evening_cycle.invalid_transition' }),
    );

    const withRatings = createPreparingCycle();
    withRatings.completePreparation(at('23:00:00'));
    withRatings.setBeforeRelaxationRatings(2, 3, at('23:00:30'));
    expect(() => withRatings.recoverLegacyRelaxation(at('23:01:00'))).toThrowError(
      expect.objectContaining({ code: 'evening_cycle.invalid_transition' }),
    );
  });

  it('не увеличивает версию для повторной одинаковой R5-команды', () => {
    const cycle = createRelaxingCycle();
    cycle.completeRelaxationDrink(at('23:01:00'));
    const version = cycle.version;

    expect(cycle.completeRelaxationDrink(at('23:02:00'))).toBe(false);
    expect(cycle.version).toBe(version);
  });

  it('сохраняет реальные BEFORE ratings и вставляет SLEEP_CHECK перед SHUTDOWN', () => {
    const cycle = createRelaxingCycle();
    const r6Cycle = cycle as EveningCycle & {
      setBeforeRelaxationRatings(
        calm: 1 | 2 | 3 | 4 | 5,
        sleepReadiness: 1 | 2 | 3 | 4 | 5,
        occurredAt: Date,
      ): boolean;
      readonly sleepCheck: {
        readonly calmBefore: 1 | 2 | 3 | 4 | 5;
        readonly sleepReadinessBefore: 1 | 2 | 3 | 4 | 5;
        readonly startedAt: Date | null;
      } | null;
    };

    expect(r6Cycle.setBeforeRelaxationRatings(2, 3, at('23:00:45'))).toBe(true);
    cycle.completeRelaxationDrink(at('23:01:00'));
    cycle.completeRelaxationHygiene(at('23:02:00'));
    cycle.completeRelaxationPractice(at('23:03:00'));
    cycle.skipRelaxationScreenFree(at('23:04:00'));
    cycle.completeRelaxation(at('23:05:00'));

    expect(cycle.state).toBe('SLEEP_CHECK');
    expect(r6Cycle.sleepCheck).toMatchObject({
      calmBefore: 2,
      sleepReadinessBefore: 3,
      startedAt: at('23:05:00'),
    });
  });

  it('не позволяет обычному R5 обойти R6 и проходит SLEEP_CHECK до существующего SHUTDOWN', () => {
    const cycle = createRelaxingCycle();
    cycle.completeRelaxationDrink(at('23:01:00'));
    cycle.completeRelaxationHygiene(at('23:02:00'));
    cycle.completeRelaxationPractice(at('23:03:00'));
    cycle.skipRelaxationScreenFree(at('23:04:00'));

    expect(() => cycle.completeRelaxation(at('23:05:00'))).toThrowError(
      expect.objectContaining({ code: 'sleep_check.before_ratings_required' }),
    );

    const r6Cycle = cycle as unknown as R6EveningCycle;
    r6Cycle.setBeforeRelaxationRatings(2, 3, at('23:05:30'));
    cycle.completeRelaxation(at('23:06:00'));
    expect(cycle.state).toBe(EVENING_CYCLE_STATE.sleepCheck);

    r6Cycle.setAfterRelaxationRatings(4, 5, at('23:07:00'));
    r6Cycle.answerSleepCheckQuestion('CALM_MIND', 'YES', at('23:08:00'));
    r6Cycle.answerSleepCheckQuestion('HOLDING_THOUGHT', 'NO', at('23:09:00'));
    r6Cycle.answerSleepCheckQuestion('READY_FOR_SLEEP', 'YES', at('23:10:00'));
    r6Cycle.completeSleepCheck(AFTER_MIDNIGHT);

    expect(cycle.state).toBe(EVENING_CYCLE_STATE.shutdown);
    expect(cycle.dateKey.equals(DATE)).toBe(true);
    expect(cycle.dayId.equals(id('day'))).toBe(true);
    expect(cycle.sleepCheck?.completedAt).toEqual(AFTER_MIDNIGHT);
  });

  it('вставляет сохранённый follow-up сразу после отвеченного родителя', () => {
    const cycle = createReflectingCycle();
    const first = reflectionQuestion('first');
    const second = reflectionQuestion('second');
    const followUp = reflectionQuestion('first:FOLLOW_UP');
    cycle.initializeReflection([first, second], STARTED_AT);
    cycle.recordReflectionResult(
      ReflectionResult.answer(cycle.id, first, 'Первый ответ', STARTED_AT),
      null,
      STARTED_AT,
    );

    expect(cycle.insertReflectionFollowUp(first.id, followUp, STARTED_AT)).toBe(true);
    expect(cycle.reflectionQuestions.map(({ id: questionId }) => questionId)).toEqual([
      first.id,
      followUp.id,
      second.id,
    ]);
    expect(cycle.nextReflectionQuestion()?.id).toBe(followUp.id);
  });

  it('требует сохранённый ответ родителя перед follow-up', () => {
    const cycle = createReflectingCycle();
    const parent = reflectionQuestion('parent');
    cycle.initializeReflection([parent], STARTED_AT);

    expect(() =>
      cycle.insertReflectionFollowUp(parent.id, reflectionQuestion('follow-up'), STARTED_AT),
    ).toThrowError(expect.objectContaining({ code: 'reflection.follow_up_parent_unanswered' }));
  });

  it('повторно принимает тот же follow-up идемпотентно и отвергает другой вопрос с тем же id', () => {
    const cycle = createReflectingCycle();
    const parent = reflectionQuestion('parent');
    const followUp = reflectionQuestion('follow-up');
    cycle.initializeReflection([parent], STARTED_AT);
    cycle.recordReflectionResult(
      ReflectionResult.answer(cycle.id, parent, 'Ответ', STARTED_AT),
      null,
      STARTED_AT,
    );
    cycle.insertReflectionFollowUp(parent.id, followUp, STARTED_AT);
    const version = cycle.version;

    expect(cycle.insertReflectionFollowUp(parent.id, followUp, STARTED_AT)).toBe(false);
    expect(cycle.version).toBe(version);
    expect(() =>
      cycle.insertReflectionFollowUp(
        parent.id,
        reflectionQuestion('follow-up', 'Другой вопрос'),
        STARTED_AT,
      ),
    ).toThrowError(expect.objectContaining({ code: 'reflection.duplicate_question' }));
  });

  it('разрешает пятый follow-up и запрещает шестой вопрос', () => {
    const cycle = createReflectingCycle();
    const questions = ['one', 'two', 'three', 'four'].map((value) => reflectionQuestion(value));
    cycle.initializeReflection(questions, STARTED_AT);
    cycle.recordReflectionResult(
      ReflectionResult.answer(cycle.id, questions[0]!, 'Ответ', STARTED_AT),
      null,
      STARTED_AT,
    );

    expect(cycle.insertReflectionFollowUp('one', reflectionQuestion('fifth'), STARTED_AT)).toBe(
      true,
    );
    expect(cycle.reflectionQuestions).toHaveLength(5);
    expect(() =>
      cycle.insertReflectionFollowUp('one', reflectionQuestion('sixth'), STARTED_AT),
    ).toThrowError(expect.objectContaining({ code: 'reflection.question_limit_exceeded' }));
  });
});

function createReflectingCycle(): EveningCycle {
  const cycle = createCycle();
  cycle.start(STARTED_AT);
  cycle.beginResolving(STARTED_AT);
  cycle.completeResolving(STARTED_AT);
  return cycle;
}

function reflectionQuestion(questionId: string, prompt = 'Какой вывод стоит сохранить?') {
  return ReflectionQuestion.create({
    id: questionId,
    kind: REFLECTION_QUESTION_KIND.generalLearning,
    signal: REFLECTION_DAY_SIGNAL.learning,
    type: REFLECTION_QUESTION_TYPE.shortCapture,
    prompt,
    context: 'Контекст вопроса.',
    required: true,
    sourceEntityIds: [],
  });
}

function createCycle(): EveningCycle {
  return EveningCycle.create({
    id: id('cycle'),
    dayId: id('day'),
    dateKey: DATE,
    occurredAt: STARTED_AT,
  });
}

function createPreparingCycle(
  mode:
    | typeof EVENING_CYCLE_MODE.normal
    | typeof EVENING_CYCLE_MODE.emergency = EVENING_CYCLE_MODE.normal,
): EveningCycle {
  const cycle = createCycle();
  cycle.start(STARTED_AT);
  if (mode === EVENING_CYCLE_MODE.emergency) {
    cycle.switchMode(mode, EVENING_MODE_REASON.userSelected, STARTED_AT);
  }
  cycle.beginResolving(STARTED_AT);
  cycle.completeResolving(STARTED_AT);
  if (mode === EVENING_CYCLE_MODE.normal) {
    finishReflection(cycle);
    cycle.completeReflection(STARTED_AT);
  } else {
    cycle.skipReflection(STARTED_AT);
  }
  cycle.completeTomorrowPlanning(STARTED_AT);
  return cycle;
}

function createRelaxingCycle(): EveningCycle {
  const cycle = createPreparingCycle();
  cycle.completePreparation(at('23:00:00'));
  cycle.initializeRelaxation(RELAXATION_PRACTICE.reading, 15, 25, at('23:00:30'));
  return cycle;
}

function completeSpecialCycle(
  cycle: EveningCycle,
  mode: typeof EVENING_CYCLE_MODE.quick | typeof EVENING_CYCLE_MODE.emergency,
): void {
  cycle.start(STARTED_AT);
  cycle.switchMode(mode, EVENING_MODE_REASON.userSelected, STARTED_AT);
  cycle.beginResolving(STARTED_AT);
  cycle.completeResolving(STARTED_AT);
  cycle.skipReflection(STARTED_AT);
  cycle.completeTomorrowPlanning(STARTED_AT);
  cycle.skipPreparation(STARTED_AT);
  cycle.initializeRelaxation(RELAXATION_PRACTICE.reading, 5, 10, STARTED_AT);
  finishRelaxation(cycle);
  cycle.complete(AFTER_MIDNIGHT);
}

function createCompletedCycle(): EveningCycle {
  const cycle = createCycle();
  cycle.start(STARTED_AT);
  cycle.beginResolving(STARTED_AT);
  cycle.completeResolving(STARTED_AT);
  finishReflection(cycle);
  cycle.completeReflection(STARTED_AT);
  cycle.completeTomorrowPlanning(STARTED_AT);
  cycle.completePreparation(STARTED_AT);
  cycle.initializeRelaxation(RELAXATION_PRACTICE.reading, 15, 25, STARTED_AT);
  finishRelaxation(cycle);
  cycle.complete(AFTER_MIDNIGHT);
  return cycle;
}

function finishRelaxation(cycle: EveningCycle): void {
  if (cycle.relaxation === null) {
    cycle.initializeRelaxation(RELAXATION_PRACTICE.reading, 15, 25, STARTED_AT);
  }
  if (cycle.sleepCheck === null) {
    cycle.setBeforeRelaxationRatings(3, 3, STARTED_AT);
  }
  cycle.completeRelaxationDrink(STARTED_AT);
  cycle.completeRelaxationHygiene(STARTED_AT);
  cycle.completeRelaxationPractice(STARTED_AT);
  cycle.skipRelaxationScreenFree(STARTED_AT);
  cycle.completeRelaxation(STARTED_AT);
  finishSleepCheck(cycle);
}

function finishSleepCheck(cycle: EveningCycle): void {
  cycle.setAfterRelaxationRatings(4, 4, STARTED_AT);
  cycle.answerSleepCheckQuestion('CALM_MIND', 'YES', STARTED_AT);
  cycle.answerSleepCheckQuestion('HOLDING_THOUGHT', 'NO', STARTED_AT);
  cycle.answerSleepCheckQuestion('READY_FOR_SLEEP', 'YES', STARTED_AT);
  cycle.completeSleepCheck(STARTED_AT);
}

function finishReflection(cycle: EveningCycle): void {
  const question = ReflectionQuestion.create({
    id: 'GENERAL_LEARNING:test',
    kind: REFLECTION_QUESTION_KIND.generalLearning,
    signal: REFLECTION_DAY_SIGNAL.learning,
    type: REFLECTION_QUESTION_TYPE.optionalText,
    prompt: 'Какой вывод стоит сохранить?',
    context: 'Тестовый день завершён.',
    required: false,
    sourceEntityIds: [],
  });
  cycle.initializeReflection([question], STARTED_AT);
  cycle.recordReflectionResult(
    ReflectionResult.skip(cycle.id, question, STARTED_AT),
    null,
    STARTED_AT,
  );
}

function id(value: string): EntityId {
  return EntityId.create(value);
}

function at(time: string): Date {
  return new Date(`2026-08-14T${time}.000+09:00`);
}

interface R6EveningCycle extends EveningCycle {
  setAfterRelaxationRatings(
    calm: 1 | 2 | 3 | 4 | 5,
    readiness: 1 | 2 | 3 | 4 | 5,
    at: Date,
  ): boolean;
  answerSleepCheckQuestion(
    questionId: 'CALM_MIND' | 'HOLDING_THOUGHT' | 'READY_FOR_SLEEP',
    answer: 'YES' | 'NO',
    at: Date,
  ): boolean;
  completeSleepCheck(at: Date): boolean;
}
