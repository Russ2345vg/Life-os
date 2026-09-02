import { describe, expect, it } from 'vitest';
import { EntityId } from '../shared/EntityId';
import {
  REFLECTION_CONTEXT_ENTITY_TYPE,
  ReflectionEngine,
  type ReflectionContext,
  type ReflectionContextItem,
} from './ReflectionEngine';
import {
  REFLECTION_FAILURE_REASON,
  REFLECTION_QUESTION_KIND,
  REFLECTION_QUESTION_TYPE,
} from './Reflection';

describe('ReflectionEngine', () => {
  it('ставит успех главного Решения первым', () => {
    const main = item('main', true);
    const questions = new ReflectionEngine().generate(
      context({
        mainDecision: main,
        completedDecisions: [main],
        carriedForwardItems: [item('carry')],
      }),
    );

    expect(questions[0]?.kind).toBe(REFLECTION_QUESTION_KIND.mainDecisionSuccess);
    expect(questions[0]?.sourceEntityIds[0]?.equals(main.entityId)).toBe(true);
  });

  it('спрашивает быстрый фактор успеха и предлагает сохранить подход', () => {
    const main = item('main', true);
    const engine = new ReflectionEngine();
    const reflectionContext = context({ mainDecision: main, completedDecisions: [main] });
    const [question] = engine.generate(reflectionContext);

    expect(question?.type).toBe(REFLECTION_QUESTION_TYPE.singleChoice);
    expect(question?.options).toHaveLength(6);

    const followUp = engine.generateFollowUp({
      context: reflectionContext,
      question: question!,
      answer: question!.options[0]!.value,
      currentQuestionCount: 1,
    });

    expect(followUp?.type).toBe(REFLECTION_QUESTION_TYPE.yesNo);
    expect(followUp?.id).toBe(`${question!.id}:FOLLOW_UP`);
  });

  it('для невыполненного главного Решения предлагает структурированную причину', () => {
    const main = item('main', true);
    const [question] = new ReflectionEngine().generate(
      context({ mainDecision: main, incompleteDecisions: [main] }),
    );

    expect(question?.kind).toBe(REFLECTION_QUESTION_KIND.mainDecisionFailureReason);
    expect(question?.type).toBe(REFLECTION_QUESTION_TYPE.singleChoice);
    expect(question?.options.map((option) => option.value)).toContain('TOO_LARGE');
  });

  it('после причины невыполнения предлагает один конкретный следующий шаг', () => {
    const main = item('main', true);
    const engine = new ReflectionEngine();
    const reflectionContext = context({ mainDecision: main, incompleteDecisions: [main] });
    const [question] = engine.generate(reflectionContext);

    expect(question?.options.map(({ value }) => value)).toContain('DISTRACTIONS');
    expect(
      engine.generateFollowUp({
        context: reflectionContext,
        question: question!,
        answer: 'DISTRACTIONS',
        currentQuestionCount: 1,
      })?.type,
    ).toBe(REFLECTION_QUESTION_TYPE.shortCapture);
  });

  it('не спрашивает повторно известную причину невыполнения', () => {
    const main = item('main', true, 0, true);
    const [question] = new ReflectionEngine().generate(
      context({ mainDecision: main, incompleteDecisions: [main] }),
    );

    expect(question?.kind).toBe(REFLECTION_QUESTION_KIND.mainDecisionFailureLearning);
    expect(question?.type).toBe(REFLECTION_QUESTION_TYPE.shortText);
    expect(question?.prompt).toContain('Причина уже зафиксирована');
  });

  it('отличает перенос от повторного переноса', () => {
    const firstCarry = new ReflectionEngine().generate(
      context({ carriedForwardItems: [item('first-carry', false, 1)] }),
    );
    const repeatedCarry = new ReflectionEngine().generate(
      context({ carriedForwardItems: [item('repeated-carry', false, 2)] }),
    );

    expect(firstCarry[0]?.kind).toBe(REFLECTION_QUESTION_KIND.significantCarry);
    expect(repeatedCarry[0]?.kind).toBe(REFLECTION_QUESTION_KIND.repeatedFriction);
    expect(repeatedCarry[0]?.type).toBe(REFLECTION_QUESTION_TYPE.multiChoice);
  });

  it('после причин повторного переноса предлагает одну конкретную корректировку', () => {
    const engine = new ReflectionEngine();
    const reflectionContext = context({ carriedForwardItems: [item('carry', false, 3)] });
    const [question] = engine.generate(reflectionContext);

    const followUp = engine.generateFollowUp({
      context: reflectionContext,
      question: question!,
      answer: ['TOO_LARGE', 'TIME_INSUFFICIENT'],
      currentQuestionCount: 1,
    });

    expect(followUp?.type).toBe(REFLECTION_QUESTION_TYPE.shortCapture);
    expect(followUp?.sourceEntityIds[0]?.equals(id('carry'))).toBe(true);
  });

  it('создаёт вопросы для REVISE и DROP, не дублируя известную причину отказа', () => {
    const questions = new ReflectionEngine().generate(
      context({
        revisedItems: [item('revised')],
        droppedItems: [item('dropped', false, 0, true)],
      }),
    );

    expect(questions.map((question) => question.kind).sort()).toEqual(
      [REFLECTION_QUESTION_KIND.change, REFLECTION_QUESTION_KIND.dropLearning].sort(),
    );
    expect(
      questions.find((question) => question.kind === REFLECTION_QUESTION_KIND.dropLearning)?.prompt,
    ).toContain('вывод');
  });

  it('в no-op дне завершает Осмысление на Нет и добавляет один capture на Да', () => {
    const engine = new ReflectionEngine();
    const reflectionContext = context();
    const questions = engine.generate(reflectionContext);
    const question = questions[0]!;

    expect(questions).toHaveLength(1);
    expect(question.kind).toBe(REFLECTION_QUESTION_KIND.generalLearning);
    expect(question.type).toBe(REFLECTION_QUESTION_TYPE.yesNo);
    expect(question.required).toBe(true);
    expect(
      engine.generateFollowUp({
        context: reflectionContext,
        question,
        answer: false,
        currentQuestionCount: 1,
      }),
    ).toBeNull();
    expect(
      engine.generateFollowUp({
        context: reflectionContext,
        question,
        answer: true,
        currentQuestionCount: 1,
      })?.type,
    ).toBe(REFLECTION_QUESTION_TYPE.shortCapture);
  });

  it('не добавляет follow-up сверх абсолютного лимита пяти вопросов', () => {
    const engine = new ReflectionEngine();
    const reflectionContext = context();
    const [question] = engine.generate(reflectionContext);

    expect(
      engine.generateFollowUp({
        context: reflectionContext,
        question: question!,
        answer: true,
        currentQuestionCount: 5,
      }),
    ).toBeNull();
  });

  it('сохраняет legacy PRIORITY_LOST и добавляет DISTRACTIONS', () => {
    expect(REFLECTION_FAILURE_REASON.priorityLost).toBe('PRIORITY_LOST');
    expect(REFLECTION_FAILURE_REASON.distractions).toBe('DISTRACTIONS');
  });

  it('ограничивает сложный день четырьмя вопросами и сохраняет приоритет главного Решения', () => {
    const main = item('main', true);
    const questions = new ReflectionEngine().generate(
      context({
        mainDecision: main,
        incompleteDecisions: [main, item('other-failure')],
        carriedForwardItems: [item('carry-1', false, 2), item('carry-2', false, 1)],
        revisedItems: [item('revised')],
        droppedItems: [item('dropped')],
        completedActions: [item('success')],
        actionSessions: [item('session')],
      }),
    );

    expect(questions).toHaveLength(4);
    expect(questions[0]?.kind).toBe(REFLECTION_QUESTION_KIND.mainDecisionFailureReason);
  });
});

function context(overrides: Partial<ReflectionContext> = {}): ReflectionContext {
  return {
    cycleId: id('cycle'),
    dayId: id('day'),
    dateKey: '2026-08-14',
    mainDecision: overrides.mainDecision ?? null,
    completedDecisions: overrides.completedDecisions ?? [],
    incompleteDecisions: overrides.incompleteDecisions ?? [],
    completedActions: overrides.completedActions ?? [],
    carriedForwardItems: overrides.carriedForwardItems ?? [],
    revisedItems: overrides.revisedItems ?? [],
    droppedItems: overrides.droppedItems ?? [],
    actionSessions: overrides.actionSessions ?? [],
    openLoopResultCount: overrides.openLoopResultCount ?? 0,
  };
}

function item(
  value: string,
  isMainDecision = false,
  repeatCount = 0,
  reasonKnown = false,
): ReflectionContextItem {
  return {
    entityType: isMainDecision
      ? REFLECTION_CONTEXT_ENTITY_TYPE.decision
      : REFLECTION_CONTEXT_ENTITY_TYPE.lifeAction,
    entityId: id(value),
    title: value,
    isMainDecision,
    repeatCount,
    reasonKnown,
  };
}

function id(value: string): EntityId {
  return EntityId.create(value);
}
