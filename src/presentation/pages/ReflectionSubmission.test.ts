import { describe, expect, it } from 'vitest';
import type {
  AnswerReflectionQuestionInput,
  ReflectionApplicationService,
  ReflectionSession,
} from '../../application';
import {
  DayDate,
  EntityId,
  EveningCycle,
  REFLECTION_DAY_SIGNAL,
  REFLECTION_QUESTION_KIND,
  REFLECTION_QUESTION_TYPE,
  ReflectionQuestion,
} from '../../domain';
import { EMPTY_REFLECTION_ANSWER_DRAFT } from './ReflectionAnswerDraft';
import { submitReflectionDraft } from './ReflectionSubmission';

describe('submitReflectionDraft', () => {
  it('сохраняет Да и короткий вывод через существующий follow-up', async () => {
    const initial = sessionFor(mainQuestion, mainQuestion, false);
    const afterYes = sessionFor(mainQuestion, followUpQuestion, false);
    const completed = sessionFor(mainQuestion, null, true);
    const inputs: AnswerReflectionQuestionInput[] = [];
    const reflection = answerGateway(async (input) => {
      inputs.push(input);
      return input.questionId === mainQuestion.id ? afterYes : completed;
    });

    const result = await submitReflectionDraft(reflection, initial, {
      ...EMPTY_REFLECTION_ANSWER_DRAFT,
      yesNo: true,
      text: '  Защищать первый час от уведомлений  ',
    });

    expect(result).toBe(completed);
    expect(inputs).toEqual([
      { cycleId: cycle.id, questionId: mainQuestion.id, answer: true },
      {
        cycleId: cycle.id,
        questionId: followUpQuestion.id,
        answer: 'Защищать первый час от уведомлений',
      },
    ]);
  });

  it('сохраняет Нет одним существующим ответом', async () => {
    const initial = sessionFor(mainQuestion, mainQuestion, false);
    const completed = sessionFor(mainQuestion, null, true);
    const inputs: AnswerReflectionQuestionInput[] = [];
    const reflection = answerGateway(async (input) => {
      inputs.push(input);
      return completed;
    });

    const result = await submitReflectionDraft(reflection, initial, {
      ...EMPTY_REFLECTION_ANSWER_DRAFT,
      yesNo: false,
    });

    expect(result).toBe(completed);
    expect(inputs).toEqual([{ cycleId: cycle.id, questionId: mainQuestion.id, answer: false }]);
  });

  it('не вызывает application-команду для Да без вывода', async () => {
    let called = false;
    const reflection = answerGateway(async () => {
      called = true;
      return sessionFor(mainQuestion, null, true);
    });

    const result = await submitReflectionDraft(
      reflection,
      sessionFor(mainQuestion, mainQuestion, false),
      {
        ...EMPTY_REFLECTION_ANSWER_DRAFT,
        yesNo: true,
      },
    );

    expect(result).toBeNull();
    expect(called).toBe(false);
  });
});

const cycle = EveningCycle.create({
  id: EntityId.create('reflection-submission-cycle'),
  dayId: EntityId.create('reflection-submission-day'),
  dateKey: DayDate.create('2026-09-02'),
  occurredAt: new Date('2026-09-02T18:00:00.000Z'),
});

const mainQuestion = ReflectionQuestion.create({
  id: 'GENERAL_LEARNING:day',
  kind: REFLECTION_QUESTION_KIND.generalLearning,
  signal: REFLECTION_DAY_SIGNAL.learning,
  type: REFLECTION_QUESTION_TYPE.yesNo,
  prompt: 'Есть ли один полезный вывод из сегодняшнего дня?',
  context: 'Значимых отклонений или результатов сегодня не зафиксировано.',
  required: true,
  sourceEntityIds: [],
});

const followUpQuestion = ReflectionQuestion.create({
  id: 'GENERAL_LEARNING:day:FOLLOW_UP',
  kind: REFLECTION_QUESTION_KIND.generalLearning,
  signal: REFLECTION_DAY_SIGNAL.learning,
  type: REFLECTION_QUESTION_TYPE.shortCapture,
  prompt: 'Какой один вывод стоит сохранить?',
  context: mainQuestion.context,
  required: true,
  sourceEntityIds: [],
});

function sessionFor(
  question: ReflectionQuestion,
  currentQuestion: ReflectionQuestion | null,
  complete: boolean,
): ReflectionSession {
  return {
    cycle,
    questions: currentQuestion === followUpQuestion ? [question, followUpQuestion] : [question],
    currentQuestion,
    processed: currentQuestion === followUpQuestion || complete ? 1 : 0,
    total: currentQuestion === followUpQuestion ? 2 : 1,
    complete,
  };
}

function answerGateway(
  answer: (input: AnswerReflectionQuestionInput) => Promise<ReflectionSession>,
): Pick<ReflectionApplicationService, 'answer'> {
  return { answer };
}
