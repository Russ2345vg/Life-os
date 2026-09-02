import { describe, expect, it } from 'vitest';
import { DomainError } from '../../shared/errors/DomainError';
import { EntityId } from '../shared/EntityId';
import {
  REFLECTION_DAY_SIGNAL,
  REFLECTION_QUESTION_KIND,
  REFLECTION_QUESTION_TYPE,
  ReflectionQuestion,
  ReflectionResult,
  type ReflectionAnswer,
  type ReflectionQuestionOption,
  type ReflectionQuestionType,
} from './Reflection';

const NOW = new Date('2026-08-15T00:08:00.000+09:00');
const CYCLE_ID = EntityId.create('cycle');

describe('Reflection quick answer model', () => {
  it.each([
    {
      type: REFLECTION_QUESTION_TYPE.yesNo,
      answer: true,
      options: [],
    },
    {
      type: REFLECTION_QUESTION_TYPE.singleChoice,
      answer: 'FIRST',
      options: choiceOptions(),
    },
    {
      type: REFLECTION_QUESTION_TYPE.multiChoice,
      answer: ['FIRST', 'SECOND'],
      options: choiceOptions(),
    },
    {
      type: REFLECTION_QUESTION_TYPE.rating1To5,
      answer: 4,
      options: [],
    },
    {
      type: REFLECTION_QUESTION_TYPE.shortCapture,
      answer: '  Короткий вывод  ',
      expected: 'Короткий вывод',
      options: [],
    },
  ])('сохраняет типизированный ответ $type', ({ type, answer, expected = answer, options }) => {
    const result = ReflectionResult.answer(
      CYCLE_ID,
      question(type, options),
      answer as ReflectionAnswer,
      NOW,
    );

    expect(result.answer).toEqual(expected);
  });

  it.each([
    {
      type: REFLECTION_QUESTION_TYPE.yesNo,
      answer: 'YES',
      options: [],
    },
    {
      type: REFLECTION_QUESTION_TYPE.singleChoice,
      answer: 'UNKNOWN',
      options: choiceOptions(),
    },
    {
      type: REFLECTION_QUESTION_TYPE.multiChoice,
      answer: ['FIRST', 'FIRST'],
      options: choiceOptions(),
    },
    {
      type: REFLECTION_QUESTION_TYPE.rating1To5,
      answer: 0,
      options: [],
    },
    {
      type: REFLECTION_QUESTION_TYPE.rating1To5,
      answer: 6,
      options: [],
    },
    {
      type: REFLECTION_QUESTION_TYPE.rating1To5,
      answer: 2.5,
      options: [],
    },
    {
      type: REFLECTION_QUESTION_TYPE.shortCapture,
      answer: '   ',
      options: [],
    },
  ])('отклоняет несовместимый ответ $type', ({ type, answer, options }) => {
    expect(() =>
      ReflectionResult.answer(
        CYCLE_ID,
        question(type, options),
        answer as unknown as ReflectionAnswer,
        NOW,
      ),
    ).toThrow(DomainError);
  });

  it.each([REFLECTION_QUESTION_TYPE.shortText, REFLECTION_QUESTION_TYPE.optionalText])(
    'сохраняет поддержку legacy-типа $type',
    (type) => {
      const result = ReflectionResult.answer(CYCLE_ID, question(type), 'Старый ответ', NOW);

      expect(result.questionType).toBe(type);
      expect(result.answer).toBe('Старый ответ');
    },
  );
});

function question(
  type: ReflectionQuestionType,
  options: readonly ReflectionQuestionOption[] = [],
): ReflectionQuestion {
  return ReflectionQuestion.create({
    id: `question:${type}`,
    kind: REFLECTION_QUESTION_KIND.generalLearning,
    signal: REFLECTION_DAY_SIGNAL.learning,
    type,
    prompt: 'Что важно зафиксировать?',
    context: 'Контекст вопроса',
    required: true,
    sourceEntityIds: [],
    options,
  });
}

function choiceOptions(): readonly ReflectionQuestionOption[] {
  return [
    { value: 'FIRST', label: 'Первый вариант' },
    { value: 'SECOND', label: 'Второй вариант' },
  ];
}
