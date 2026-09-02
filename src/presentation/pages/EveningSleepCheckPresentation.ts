import {
  CORRECTIVE_ACTION,
  SLEEP_CHECK_QUESTION,
  SLEEP_CHECK_QUESTIONS,
  correctiveActionForProblematicAnswer,
  isProblematicSleepCheckAnswer,
  type CorrectiveActionKind,
  type EveningCycle,
  type SleepCheckQuestionId,
} from '../../domain';

const QUESTION_COPY: Readonly<Record<SleepCheckQuestionId, string>> = {
  [SLEEP_CHECK_QUESTION.calmMind]: 'Голова спокойна?',
  [SLEEP_CHECK_QUESTION.holdingThought]: 'Есть что-то, что ещё держишь в голове?',
  [SLEEP_CHECK_QUESTION.readyForSleep]: 'Готов переходить ко сну?',
};

const ACTION_COPY: Readonly<Record<CorrectiveActionKind, string>> = {
  [CORRECTIVE_ACTION.breathing2Min]: 'Две минуты спокойного дыхания',
  [CORRECTIVE_ACTION.captureThought]: 'Оставить одну мысль на завтра',
  [CORRECTIVE_ACTION.relax5MoreMin]: 'Ещё пять минут расслабления',
};

export type EveningSleepCheckPhase =
  | 'legacy'
  | 'before-ratings'
  | 'after-ratings'
  | 'question'
  | 'corrective-action'
  | 'retry'
  | 'summary';

export interface EveningSleepCheckModel {
  readonly phase: EveningSleepCheckPhase;
  readonly readOnly: boolean;
  readonly progress: string | null;
  readonly question: { readonly id: SleepCheckQuestionId; readonly prompt: string } | null;
  readonly correctiveAction: {
    readonly questionId: SleepCheckQuestionId;
    readonly action: CorrectiveActionKind;
    readonly label: string;
    readonly captureRequired: boolean;
    readonly selected: boolean;
  } | null;
  readonly calm: { readonly before: number; readonly after: number | null } | null;
  readonly sleepReadiness: { readonly before: number; readonly after: number | null } | null;
  readonly legacyMessage: string | null;
  readonly completedActionLabel: string | null;
}

export function buildEveningSleepCheckModel(
  cycle: EveningCycle,
  readOnly: boolean,
): EveningSleepCheckModel {
  const snapshot = cycle.sleepCheck;
  if (snapshot === null) {
    return model({
      phase: 'legacy',
      readOnly,
      legacyMessage: 'Проверка сна не записывалась для этого вечера',
    });
  }
  const ratings = {
    calm: { before: snapshot.calmBefore, after: snapshot.calmAfter },
    sleepReadiness: {
      before: snapshot.sleepReadinessBefore,
      after: snapshot.sleepReadinessAfter,
    },
    completedActionLabel:
      snapshot.correctiveAction?.completedAt === null || snapshot.correctiveAction === null
        ? null
        : ACTION_COPY[snapshot.correctiveAction.action],
  };
  if (snapshot.startedAt === null) {
    return model({ phase: 'before-ratings', readOnly, ...ratings });
  }
  if (snapshot.afterRatedAt === null) {
    return model({ phase: 'after-ratings', readOnly, ...ratings });
  }
  const nextQuestion = SLEEP_CHECK_QUESTIONS[snapshot.initialAnswers.length];
  if (nextQuestion !== undefined) {
    return model({
      phase: 'question',
      readOnly,
      progress: `${snapshot.initialAnswers.length + 1} / ${SLEEP_CHECK_QUESTIONS.length}`,
      question: question(nextQuestion),
      ...ratings,
    });
  }
  const firstProblem = snapshot.initialAnswers.find(isProblematicSleepCheckAnswer) ?? null;
  if (firstProblem !== null) {
    const requiredAction = correctiveActionForProblematicAnswer(firstProblem);
    if (
      requiredAction !== null &&
      (snapshot.correctiveAction === null || snapshot.correctiveAction.completedAt === null)
    ) {
      return model({
        phase: 'corrective-action',
        readOnly,
        progress: '3 / 3',
        correctiveAction: {
          questionId: firstProblem.questionId,
          action: requiredAction,
          label: ACTION_COPY[requiredAction],
          captureRequired: requiredAction === CORRECTIVE_ACTION.captureThought,
          selected: snapshot.correctiveAction !== null,
        },
        ...ratings,
      });
    }
    if (!snapshot.retriedAnswers.some(({ questionId }) => questionId === firstProblem.questionId)) {
      return model({
        phase: 'retry',
        readOnly,
        progress: '3 / 3',
        question: question(firstProblem.questionId),
        ...ratings,
      });
    }
  }
  return model({ phase: 'summary', readOnly, progress: '3 / 3', ...ratings });
}

function question(id: SleepCheckQuestionId) {
  return Object.freeze({ id, prompt: QUESTION_COPY[id] });
}

function model(
  partial: Pick<EveningSleepCheckModel, 'phase' | 'readOnly'> &
    Partial<Omit<EveningSleepCheckModel, 'phase' | 'readOnly'>>,
): EveningSleepCheckModel {
  return Object.freeze({
    progress: null,
    question: null,
    correctiveAction: null,
    calm: null,
    sleepReadiness: null,
    legacyMessage: null,
    completedActionLabel: null,
    ...partial,
  });
}
