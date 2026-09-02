import {
  REFLECTION_QUESTION_KIND,
  REFLECTION_QUESTION_TYPE,
  type ReflectionAnswer,
  type ReflectionQuestion,
} from '../../domain';

export interface ReflectionAnswerDraft {
  readonly text: string;
  readonly choices: readonly string[];
  readonly yesNo: boolean | null;
}

export const EMPTY_REFLECTION_ANSWER_DRAFT: ReflectionAnswerDraft = Object.freeze({
  text: '',
  choices: Object.freeze([]),
  yesNo: null,
});

export function reflectionAnswerFromDraft(
  question: ReflectionQuestion,
  draft: ReflectionAnswerDraft,
): ReflectionAnswer | null {
  if (question.type === REFLECTION_QUESTION_TYPE.yesNo) {
    if (draft.yesNo === null) return null;
    if (
      question.kind === REFLECTION_QUESTION_KIND.generalLearning &&
      draft.yesNo &&
      draft.text.trim().length === 0
    ) {
      return null;
    }
    return draft.yesNo;
  }
  if (question.type === REFLECTION_QUESTION_TYPE.singleChoice) {
    return draft.text.trim().length > 0 ? draft.text : null;
  }
  if (question.type === REFLECTION_QUESTION_TYPE.multiChoice) {
    return draft.choices.length > 0 ? Object.freeze([...draft.choices]) : null;
  }
  if (
    question.type === REFLECTION_QUESTION_TYPE.shortCapture ||
    question.type === REFLECTION_QUESTION_TYPE.shortText ||
    question.type === REFLECTION_QUESTION_TYPE.optionalText
  ) {
    const text = draft.text.trim();
    return text.length > 0 ? text : null;
  }
  return null;
}
