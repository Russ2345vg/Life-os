import { describe, expect, it } from 'vitest';
import {
  REFLECTION_DAY_SIGNAL,
  REFLECTION_QUESTION_KIND,
  REFLECTION_QUESTION_TYPE,
  ReflectionQuestion,
  type ReflectionQuestionKind,
  type ReflectionQuestionType,
} from '../../domain';
import {
  EMPTY_REFLECTION_ANSWER_DRAFT,
  reflectionAnswerFromDraft,
  type ReflectionAnswerDraft,
} from './ReflectionAnswerDraft';

describe('ReflectionAnswerDraft', () => {
  it.each<{
    readonly type: ReflectionQuestionType;
    readonly draft: ReflectionAnswerDraft;
    readonly expected: boolean | string | readonly string[];
  }>([
    {
      type: REFLECTION_QUESTION_TYPE.yesNo,
      draft: { text: '', choices: [], yesNo: false },
      expected: false,
    },
    {
      type: REFLECTION_QUESTION_TYPE.singleChoice,
      draft: { text: 'TOO_LARGE', choices: [], yesNo: null },
      expected: 'TOO_LARGE',
    },
    {
      type: REFLECTION_QUESTION_TYPE.multiChoice,
      draft: { text: '', choices: ['TOO_LARGE'], yesNo: null },
      expected: ['TOO_LARGE'],
    },
    {
      type: REFLECTION_QUESTION_TYPE.shortCapture,
      draft: { text: '  Один шаг  ', choices: [], yesNo: null },
      expected: 'Один шаг',
    },
    {
      type: REFLECTION_QUESTION_TYPE.shortText,
      draft: { text: '  Legacy ответ  ', choices: [], yesNo: null },
      expected: 'Legacy ответ',
    },
  ])('создаёт типизированный ответ $type', ({ type, draft, expected }) => {
    expect(reflectionAnswerFromDraft(question(type), draft)).toEqual(expected);
  });

  it('отличает невыбранный YES_NO от валидного ответа Нет', () => {
    expect(
      reflectionAnswerFromDraft(
        question(REFLECTION_QUESTION_TYPE.yesNo),
        EMPTY_REFLECTION_ANSWER_DRAFT,
      ),
    ).toBeNull();
    expect(
      reflectionAnswerFromDraft(question(REFLECTION_QUESTION_TYPE.yesNo), {
        ...EMPTY_REFLECTION_ANSWER_DRAFT,
        yesNo: false,
      }),
    ).toBe(false);
  });

  it('требует короткий вывод для ответа Да на общий вопрос дня', () => {
    const generalLearning = question(REFLECTION_QUESTION_TYPE.yesNo);

    expect(
      reflectionAnswerFromDraft(generalLearning, {
        ...EMPTY_REFLECTION_ANSWER_DRAFT,
        yesNo: true,
      }),
    ).toBeNull();
    expect(
      reflectionAnswerFromDraft(generalLearning, {
        ...EMPTY_REFLECTION_ANSWER_DRAFT,
        text: '  Сначала уточнять ожидаемый результат  ',
        yesNo: true,
      }),
    ).toBe(true);
  });

  it('не требует текст для других YES_NO вопросов', () => {
    expect(
      reflectionAnswerFromDraft(
        question(REFLECTION_QUESTION_TYPE.yesNo, REFLECTION_QUESTION_KIND.mainDecisionSuccess),
        {
          ...EMPTY_REFLECTION_ANSWER_DRAFT,
          yesNo: true,
        },
      ),
    ).toBe(true);
  });

  it('не создаёт ответ из пустого или неподдержанного draft', () => {
    expect(
      reflectionAnswerFromDraft(
        question(REFLECTION_QUESTION_TYPE.shortCapture),
        EMPTY_REFLECTION_ANSWER_DRAFT,
      ),
    ).toBeNull();
    expect(
      reflectionAnswerFromDraft(
        question(REFLECTION_QUESTION_TYPE.rating1To5),
        EMPTY_REFLECTION_ANSWER_DRAFT,
      ),
    ).toBeNull();
  });
});

function question(
  type: ReflectionQuestionType,
  kind: ReflectionQuestionKind = REFLECTION_QUESTION_KIND.generalLearning,
): ReflectionQuestion {
  const choice =
    type === REFLECTION_QUESTION_TYPE.singleChoice || type === REFLECTION_QUESTION_TYPE.multiChoice;
  return ReflectionQuestion.create({
    id: `draft-${type}`,
    kind,
    signal: REFLECTION_DAY_SIGNAL.learning,
    type,
    prompt: 'Что важно сохранить?',
    context: 'Контекст дня.',
    required: true,
    sourceEntityIds: [],
    ...(choice
      ? {
          options: [
            { value: 'TOO_LARGE', label: 'Слишком большой объём' },
            { value: 'OTHER', label: 'Другое' },
          ],
        }
      : {}),
  });
}
