import type {
  GetEveningReview,
  ReflectionApplicationService,
  ReflectionSession,
} from '../../application';
import { REFLECTION_QUESTION_TYPE, type DayDate, type ReflectionAnswer } from '../../domain';

interface ReflectionTestApplication {
  readonly getEveningReview: Pick<GetEveningReview, 'execute'>;
  readonly reflection: Pick<ReflectionApplicationService, 'getSession' | 'answer'>;
}

export async function answerAllReflectionQuestions(
  application: ReflectionTestApplication,
  date: DayDate,
): Promise<ReflectionSession> {
  const review = await application.getEveningReview.execute(date);
  let session = await application.reflection.getSession(review.cycle.id);
  while (session.currentQuestion !== null) {
    const question = session.currentQuestion;
    session = await application.reflection.answer({
      cycleId: session.cycle.id,
      questionId: question.id,
      answer: testAnswer(
        question.type,
        question.options.map((option) => option.value),
      ),
    });
  }
  return session;
}

function testAnswer(type: string, options: readonly string[]): ReflectionAnswer {
  if (type === REFLECTION_QUESTION_TYPE.singleChoice) return options[0] ?? 'OTHER';
  if (type === REFLECTION_QUESTION_TYPE.multiChoice) return [options[0] ?? 'OTHER'];
  return 'Зафиксирован вывод для следующей попытки';
}
