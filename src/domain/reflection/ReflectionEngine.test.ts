import { describe, expect, it } from 'vitest';
import { EntityId } from '../shared/EntityId';
import {
  REFLECTION_CONTEXT_ENTITY_TYPE,
  ReflectionEngine,
  type ReflectionContext,
  type ReflectionContextItem,
} from './ReflectionEngine';
import { REFLECTION_QUESTION_KIND, REFLECTION_QUESTION_TYPE } from './Reflection';

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

  it('для невыполненного главного Решения предлагает структурированную причину', () => {
    const main = item('main', true);
    const [question] = new ReflectionEngine().generate(
      context({ mainDecision: main, incompleteDecisions: [main] }),
    );

    expect(question?.kind).toBe(REFLECTION_QUESTION_KIND.mainDecisionFailureReason);
    expect(question?.type).toBe(REFLECTION_QUESTION_TYPE.singleChoice);
    expect(question?.options.map((option) => option.value)).toContain('TOO_LARGE');
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

  it('при отсутствии значимых событий оставляет один необязательный общий вывод', () => {
    const questions = new ReflectionEngine().generate(context());

    expect(questions).toHaveLength(1);
    expect(questions[0]?.kind).toBe(REFLECTION_QUESTION_KIND.generalLearning);
    expect(questions[0]?.type).toBe(REFLECTION_QUESTION_TYPE.optionalText);
    expect(questions[0]?.required).toBe(false);
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
