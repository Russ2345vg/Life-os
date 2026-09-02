import type { ReflectionApplicationService, ReflectionSession } from '../../application';
import { REFLECTION_QUESTION_KIND, REFLECTION_QUESTION_TYPE } from '../../domain';
import { reflectionAnswerFromDraft, type ReflectionAnswerDraft } from './ReflectionAnswerDraft';

export async function submitReflectionDraft(
  reflection: Pick<ReflectionApplicationService, 'answer'>,
  session: ReflectionSession,
  draft: ReflectionAnswerDraft,
): Promise<ReflectionSession | null> {
  const question = session.currentQuestion;
  if (question === null) return null;

  const answer = reflectionAnswerFromDraft(question, draft);
  if (answer === null) return null;

  let updated = await reflection.answer({
    cycleId: session.cycle.id,
    questionId: question.id,
    answer,
  });

  const requiresCapturedConclusion =
    question.kind === REFLECTION_QUESTION_KIND.generalLearning &&
    question.type === REFLECTION_QUESTION_TYPE.yesNo &&
    answer === true;
  if (!requiresCapturedConclusion) return updated;

  const followUp = updated.currentQuestion;
  if (
    followUp === null ||
    followUp.kind !== REFLECTION_QUESTION_KIND.generalLearning ||
    followUp.type !== REFLECTION_QUESTION_TYPE.shortCapture
  ) {
    throw new Error('Не удалось подготовить сохранение вывода дня. Повторите действие.');
  }

  updated = await reflection.answer({
    cycleId: updated.cycle.id,
    questionId: followUp.id,
    answer: draft.text.trim(),
  });
  return updated;
}
