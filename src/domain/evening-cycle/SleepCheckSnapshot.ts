import { DomainError } from '../../shared/errors/DomainError';
import { copyDate, copyOptionalDate } from '../shared/dateCopy';

export const SUBJECTIVE_RATING_MOMENT = {
  beforeRelaxation: 'BEFORE_RELAXATION',
  afterRelaxation: 'AFTER_RELAXATION',
} as const;

export const SLEEP_CHECK_QUESTION = {
  calmMind: 'CALM_MIND',
  holdingThought: 'HOLDING_THOUGHT',
  readyForSleep: 'READY_FOR_SLEEP',
} as const;

export const SLEEP_CHECK_QUESTIONS = [
  SLEEP_CHECK_QUESTION.calmMind,
  SLEEP_CHECK_QUESTION.holdingThought,
  SLEEP_CHECK_QUESTION.readyForSleep,
] as const;

export const SLEEP_CHECK_ANSWER = { yes: 'YES', no: 'NO' } as const;

export const CORRECTIVE_ACTION = {
  breathing2Min: 'BREATHING_2_MIN',
  captureThought: 'CAPTURE_THOUGHT',
  relax5MoreMin: 'RELAX_5_MORE_MIN',
} as const;

export type SubjectiveRatingMoment =
  (typeof SUBJECTIVE_RATING_MOMENT)[keyof typeof SUBJECTIVE_RATING_MOMENT];
export type SubjectiveRating = 1 | 2 | 3 | 4 | 5;
export type SleepCheckQuestionId = (typeof SLEEP_CHECK_QUESTION)[keyof typeof SLEEP_CHECK_QUESTION];
export type SleepCheckAnswerValue = (typeof SLEEP_CHECK_ANSWER)[keyof typeof SLEEP_CHECK_ANSWER];
export type CorrectiveActionKind = (typeof CORRECTIVE_ACTION)[keyof typeof CORRECTIVE_ACTION];

export interface SleepCheckAnswer {
  readonly questionId: SleepCheckQuestionId;
  readonly value: SleepCheckAnswerValue;
  readonly answeredAt: Date;
}

export interface SleepCheckCorrectiveAction {
  readonly questionId: SleepCheckQuestionId;
  readonly action: CorrectiveActionKind;
  readonly selectedAt: Date;
  readonly completedAt: Date | null;
  readonly capturedThought: string | null;
}

export interface SleepCheckSnapshotStartData {
  readonly calmBefore: SubjectiveRating;
  readonly sleepReadinessBefore: SubjectiveRating;
  readonly occurredAt: Date;
}

export interface SleepCheckSnapshotRehydrationData {
  readonly calmBefore: SubjectiveRating;
  readonly sleepReadinessBefore: SubjectiveRating;
  readonly beforeRatedAt: Date;
  readonly calmAfter: SubjectiveRating | null;
  readonly sleepReadinessAfter: SubjectiveRating | null;
  readonly afterRatedAt: Date | null;
  readonly initialAnswers: readonly SleepCheckAnswer[];
  readonly retriedAnswers: readonly SleepCheckAnswer[];
  readonly correctiveAction: SleepCheckCorrectiveAction | null;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class SleepCheckSnapshot {
  readonly #calmBefore: SubjectiveRating;
  readonly #sleepReadinessBefore: SubjectiveRating;
  readonly #beforeRatedAt: Date;
  #calmAfter: SubjectiveRating | null;
  #sleepReadinessAfter: SubjectiveRating | null;
  #afterRatedAt: Date | null;
  readonly #initialAnswers: SleepCheckAnswer[];
  readonly #retriedAnswers: SleepCheckAnswer[];
  #correctiveAction: SleepCheckCorrectiveAction | null;
  #startedAt: Date | null;
  #completedAt: Date | null;
  readonly #createdAt: Date;
  #updatedAt: Date;

  private constructor(data: SleepCheckSnapshotRehydrationData) {
    validateRehydrationData(data);
    this.#calmBefore = data.calmBefore;
    this.#sleepReadinessBefore = data.sleepReadinessBefore;
    this.#beforeRatedAt = copyDate(data.beforeRatedAt);
    this.#calmAfter = data.calmAfter;
    this.#sleepReadinessAfter = data.sleepReadinessAfter;
    this.#afterRatedAt = copyOptionalDate(data.afterRatedAt);
    this.#initialAnswers = data.initialAnswers.map(copyAnswer);
    this.#retriedAnswers = data.retriedAnswers.map(copyAnswer);
    this.#correctiveAction = copyCorrectiveAction(data.correctiveAction);
    this.#startedAt = copyOptionalDate(data.startedAt);
    this.#completedAt = copyOptionalDate(data.completedAt);
    this.#createdAt = copyDate(data.createdAt);
    this.#updatedAt = copyDate(data.updatedAt);
  }

  public static start(data: SleepCheckSnapshotStartData): SleepCheckSnapshot {
    assertRating(data.calmBefore);
    assertRating(data.sleepReadinessBefore);
    assertTime(data.occurredAt);
    return new SleepCheckSnapshot({
      calmBefore: data.calmBefore,
      sleepReadinessBefore: data.sleepReadinessBefore,
      beforeRatedAt: data.occurredAt,
      calmAfter: null,
      sleepReadinessAfter: null,
      afterRatedAt: null,
      initialAnswers: [],
      retriedAnswers: [],
      correctiveAction: null,
      startedAt: null,
      completedAt: null,
      createdAt: data.occurredAt,
      updatedAt: data.occurredAt,
    });
  }

  public static rehydrate(data: SleepCheckSnapshotRehydrationData): SleepCheckSnapshot {
    return new SleepCheckSnapshot(data);
  }

  public get calmBefore(): SubjectiveRating {
    return this.#calmBefore;
  }
  public get sleepReadinessBefore(): SubjectiveRating {
    return this.#sleepReadinessBefore;
  }
  public get beforeRatedAt(): Date {
    return copyDate(this.#beforeRatedAt);
  }
  public get calmAfter(): SubjectiveRating | null {
    return this.#calmAfter;
  }
  public get sleepReadinessAfter(): SubjectiveRating | null {
    return this.#sleepReadinessAfter;
  }
  public get afterRatedAt(): Date | null {
    return copyOptionalDate(this.#afterRatedAt);
  }
  public get initialAnswers(): readonly SleepCheckAnswer[] {
    return this.#initialAnswers.map(copyAnswer);
  }
  public get retriedAnswers(): readonly SleepCheckAnswer[] {
    return this.#retriedAnswers.map(copyAnswer);
  }
  public get correctiveAction(): SleepCheckCorrectiveAction | null {
    return copyCorrectiveAction(this.#correctiveAction);
  }
  public get startedAt(): Date | null {
    return copyOptionalDate(this.#startedAt);
  }
  public get completedAt(): Date | null {
    return copyOptionalDate(this.#completedAt);
  }
  public get readyToComplete(): boolean {
    if (this.#initialAnswers.length !== SLEEP_CHECK_QUESTIONS.length) return false;
    const firstProblem = this.firstProblematicAnswer();
    if (firstProblem === null) return this.#correctiveAction === null;
    return (
      this.#correctiveAction?.questionId === firstProblem.questionId &&
      this.#correctiveAction.completedAt !== null &&
      this.#retriedAnswers.some(({ questionId }) => questionId === firstProblem.questionId)
    );
  }
  public get createdAt(): Date {
    return copyDate(this.#createdAt);
  }
  public get updatedAt(): Date {
    return copyDate(this.#updatedAt);
  }

  public startCheck(occurredAt: Date): boolean {
    this.assertActive();
    assertTime(occurredAt);
    if (this.#startedAt !== null) return false;
    this.#startedAt = copyDate(occurredAt);
    this.#updatedAt = copyDate(occurredAt);
    return true;
  }

  public setAfterRatings(
    calm: SubjectiveRating,
    sleepReadiness: SubjectiveRating,
    occurredAt: Date,
  ): boolean {
    this.assertActive();
    this.assertStarted();
    assertRating(calm);
    assertRating(sleepReadiness);
    assertTime(occurredAt);
    if (this.#afterRatedAt !== null) {
      if (this.#calmAfter === calm && this.#sleepReadinessAfter === sleepReadiness) return false;
      throw new DomainError(
        'sleep_check.after_ratings_already_recorded',
        'After-relaxation ratings have already been recorded.',
      );
    }
    this.#calmAfter = calm;
    this.#sleepReadinessAfter = sleepReadiness;
    this.#afterRatedAt = copyDate(occurredAt);
    this.#updatedAt = copyDate(occurredAt);
    return true;
  }

  public answerQuestion(
    questionId: SleepCheckQuestionId,
    value: SleepCheckAnswerValue,
    occurredAt: Date,
  ): boolean {
    this.assertActive();
    this.assertAfterRatings();
    assertQuestion(questionId);
    assertAnswer(value);
    assertTime(occurredAt);
    const existing = this.#initialAnswers.find((answer) => answer.questionId === questionId);
    if (existing !== undefined) {
      if (existing.value === value) return false;
      throw new DomainError(
        'sleep_check.answer_already_recorded',
        'The initial answer has already been recorded.',
      );
    }
    const expected = SLEEP_CHECK_QUESTIONS[this.#initialAnswers.length];
    if (questionId !== expected) {
      throw new DomainError(
        'sleep_check.unexpected_question',
        'Questions must be answered in order.',
      );
    }
    this.#initialAnswers.push({ questionId, value, answeredAt: copyDate(occurredAt) });
    this.#updatedAt = copyDate(occurredAt);
    return true;
  }

  public chooseCorrectiveAction(
    questionId: SleepCheckQuestionId,
    action: CorrectiveActionKind,
    occurredAt: Date,
  ): boolean {
    this.assertActive();
    assertQuestion(questionId);
    assertCorrectiveAction(action);
    assertTime(occurredAt);
    if (this.#correctiveAction !== null) {
      if (
        this.#correctiveAction.questionId === questionId &&
        this.#correctiveAction.action === action
      ) {
        return false;
      }
      throw new DomainError(
        'sleep_check.corrective_action_conflict',
        'Only one corrective action is allowed.',
      );
    }
    const firstProblem = this.firstProblematicAnswer();
    const expectedAction =
      firstProblem === null ? null : correctiveActionForProblematicAnswer(firstProblem);
    if (
      firstProblem === null ||
      firstProblem.questionId !== questionId ||
      expectedAction !== action
    ) {
      throw new DomainError(
        'sleep_check.corrective_action_mismatch',
        'The corrective action must match the first problematic answer.',
      );
    }
    this.#correctiveAction = {
      questionId,
      action,
      selectedAt: copyDate(occurredAt),
      completedAt: null,
      capturedThought: null,
    };
    this.#updatedAt = copyDate(occurredAt);
    return true;
  }

  public completeCorrectiveAction(
    questionId: SleepCheckQuestionId,
    capturedThought: string | null,
    occurredAt: Date,
  ): boolean {
    this.assertActive();
    assertQuestion(questionId);
    assertTime(occurredAt);
    const action = this.#correctiveAction;
    if (action === null || action.questionId !== questionId) {
      throw new DomainError(
        'sleep_check.corrective_action_missing',
        'No corrective action is selected for this question.',
      );
    }
    const normalizedThought = normalizeCapturedThought(action.action, capturedThought);
    if (action.completedAt !== null) {
      if (action.capturedThought === normalizedThought) return false;
      throw new DomainError(
        'sleep_check.corrective_action_already_completed',
        'The corrective action has already been completed.',
      );
    }
    this.#correctiveAction = {
      ...action,
      completedAt: copyDate(occurredAt),
      capturedThought: normalizedThought,
    };
    this.#updatedAt = copyDate(occurredAt);
    return true;
  }

  public retryQuestion(
    questionId: SleepCheckQuestionId,
    value: SleepCheckAnswerValue,
    occurredAt: Date,
  ): boolean {
    this.assertActive();
    assertQuestion(questionId);
    assertAnswer(value);
    assertTime(occurredAt);
    const action = this.#correctiveAction;
    if (action === null || action.questionId !== questionId) {
      throw new DomainError(
        'sleep_check.retry_not_allowed',
        'Only the corrected question can be retried.',
      );
    }
    if (action.completedAt === null) {
      throw new DomainError(
        'sleep_check.corrective_action_incomplete',
        'Complete the corrective action before retrying the question.',
      );
    }
    const existing = this.#retriedAnswers.find((answer) => answer.questionId === questionId);
    if (existing !== undefined) {
      if (existing.value === value) return false;
      throw new DomainError(
        'sleep_check.retry_already_recorded',
        'The retry answer has already been recorded.',
      );
    }
    this.#retriedAnswers.push({ questionId, value, answeredAt: copyDate(occurredAt) });
    this.#updatedAt = copyDate(occurredAt);
    return true;
  }

  public complete(occurredAt: Date): boolean {
    assertTime(occurredAt);
    if (this.#completedAt !== null) return false;
    if (!this.readyToComplete) {
      throw new DomainError('sleep_check.not_ready', 'The sleep check is not ready to complete.');
    }
    this.#completedAt = copyDate(occurredAt);
    this.#updatedAt = copyDate(occurredAt);
    return true;
  }

  private assertActive(): void {
    if (this.#completedAt !== null) {
      throw new DomainError('sleep_check.completed', 'The sleep check is already complete.');
    }
  }

  private assertStarted(): void {
    if (this.#startedAt === null) {
      throw new DomainError('sleep_check.not_started', 'The sleep check has not started.');
    }
  }

  private assertAfterRatings(): void {
    this.assertStarted();
    if (this.#afterRatedAt === null) {
      throw new DomainError(
        'sleep_check.after_ratings_required',
        'After-relaxation ratings are required before the questions.',
      );
    }
  }

  private firstProblematicAnswer(): SleepCheckAnswer | null {
    return this.#initialAnswers.find(isProblematicSleepCheckAnswer) ?? null;
  }
}

export function isSubjectiveRating(value: number): value is SubjectiveRating {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

export function isSleepCheckQuestionId(value: string): value is SleepCheckQuestionId {
  return (SLEEP_CHECK_QUESTIONS as readonly string[]).includes(value);
}

export function isSleepCheckAnswerValue(value: string): value is SleepCheckAnswerValue {
  return value === SLEEP_CHECK_ANSWER.yes || value === SLEEP_CHECK_ANSWER.no;
}

export function isCorrectiveActionKind(value: string): value is CorrectiveActionKind {
  return Object.values(CORRECTIVE_ACTION).some((candidate) => candidate === value);
}

export function isProblematicSleepCheckAnswer(answer: SleepCheckAnswer): boolean {
  return (
    (answer.questionId === SLEEP_CHECK_QUESTION.calmMind &&
      answer.value === SLEEP_CHECK_ANSWER.no) ||
    (answer.questionId === SLEEP_CHECK_QUESTION.holdingThought &&
      answer.value === SLEEP_CHECK_ANSWER.yes) ||
    (answer.questionId === SLEEP_CHECK_QUESTION.readyForSleep &&
      answer.value === SLEEP_CHECK_ANSWER.no)
  );
}

export function correctiveActionForProblematicAnswer(
  answer: SleepCheckAnswer,
): CorrectiveActionKind | null {
  if (!isProblematicSleepCheckAnswer(answer)) return null;
  if (answer.questionId === SLEEP_CHECK_QUESTION.calmMind) {
    return CORRECTIVE_ACTION.breathing2Min;
  }
  if (answer.questionId === SLEEP_CHECK_QUESTION.holdingThought) {
    return CORRECTIVE_ACTION.captureThought;
  }
  return CORRECTIVE_ACTION.relax5MoreMin;
}

function validateRehydrationData(data: SleepCheckSnapshotRehydrationData): void {
  assertRating(data.calmBefore);
  assertRating(data.sleepReadinessBefore);
  for (const value of [data.beforeRatedAt, data.createdAt, data.updatedAt]) assertTime(value);
  for (const value of [data.startedAt, data.afterRatedAt, data.completedAt]) {
    if (value !== null) assertTime(value);
  }
  const hasAnyAfterRating = data.calmAfter !== null || data.sleepReadinessAfter !== null;
  const hasCompleteAfterPair = data.calmAfter !== null && data.sleepReadinessAfter !== null;
  if (
    hasAnyAfterRating !== hasCompleteAfterPair ||
    hasCompleteAfterPair !== (data.afterRatedAt !== null)
  ) {
    throw new DomainError(
      'sleep_check.invalid_rehydration',
      'After-relaxation ratings must be persisted as a complete pair.',
    );
  }
  if (data.calmAfter !== null) assertRating(data.calmAfter);
  if (data.sleepReadinessAfter !== null) assertRating(data.sleepReadinessAfter);
  if (
    data.startedAt === null &&
    (data.afterRatedAt !== null ||
      data.initialAnswers.length > 0 ||
      data.retriedAnswers.length > 0 ||
      data.correctiveAction !== null ||
      data.completedAt !== null)
  ) {
    throw new DomainError(
      'sleep_check.invalid_rehydration',
      'An unstarted sleep check cannot have progress.',
    );
  }
  data.initialAnswers.forEach((answer, index) => {
    validateAnswer(answer);
    if (answer.questionId !== SLEEP_CHECK_QUESTIONS[index]) {
      throw new DomainError('sleep_check.invalid_rehydration', 'Initial answers are out of order.');
    }
  });
  if (data.initialAnswers.length > SLEEP_CHECK_QUESTIONS.length) {
    throw new DomainError('sleep_check.invalid_rehydration', 'Too many initial answers.');
  }
  if (data.initialAnswers.length > 0 && data.afterRatedAt === null) {
    throw new DomainError(
      'sleep_check.invalid_rehydration',
      'Questions require a persisted after-relaxation rating pair.',
    );
  }
  data.retriedAnswers.forEach(validateAnswer);
  if (data.retriedAnswers.length > 1) {
    throw new DomainError('sleep_check.invalid_rehydration', 'Only one retry is allowed.');
  }
  if (data.correctiveAction !== null) validateCorrectiveAction(data.correctiveAction);
  const firstProblem = data.initialAnswers.find(isProblematicSleepCheckAnswer) ?? null;
  if (data.correctiveAction !== null) {
    if (
      firstProblem === null ||
      data.correctiveAction.questionId !== firstProblem.questionId ||
      data.correctiveAction.action !== correctiveActionForProblematicAnswer(firstProblem)
    ) {
      throw new DomainError(
        'sleep_check.invalid_rehydration',
        'The corrective action must match the first problematic answer.',
      );
    }
  }
  const retry = data.retriedAnswers[0] ?? null;
  if (
    retry !== null &&
    (data.correctiveAction === null ||
      data.correctiveAction.completedAt === null ||
      retry.questionId !== data.correctiveAction.questionId)
  ) {
    throw new DomainError(
      'sleep_check.invalid_rehydration',
      'A retry requires its completed corrective action.',
    );
  }
  if (data.completedAt !== null && !isReadyData(data)) {
    throw new DomainError(
      'sleep_check.invalid_rehydration',
      'A completed sleep check must be ready.',
    );
  }
}

function isReadyData(data: SleepCheckSnapshotRehydrationData): boolean {
  const firstProblem = data.initialAnswers.find(isProblematicSleepCheckAnswer) ?? null;
  return (
    data.afterRatedAt !== null &&
    data.initialAnswers.length === SLEEP_CHECK_QUESTIONS.length &&
    (firstProblem === null
      ? data.correctiveAction === null
      : data.correctiveAction?.questionId === firstProblem.questionId &&
        data.correctiveAction.completedAt !== null &&
        data.retriedAnswers.some(({ questionId }) => questionId === firstProblem.questionId))
  );
}

function validateAnswer(answer: SleepCheckAnswer): void {
  assertQuestion(answer.questionId);
  assertAnswer(answer.value);
  assertTime(answer.answeredAt);
}

function validateCorrectiveAction(action: SleepCheckCorrectiveAction): void {
  assertQuestion(action.questionId);
  assertCorrectiveAction(action.action);
  assertTime(action.selectedAt);
  if (action.completedAt !== null) assertTime(action.completedAt);
  if (action.completedAt === null) {
    if (action.capturedThought !== null) {
      throw new DomainError(
        'sleep_check.invalid_rehydration',
        'An incomplete corrective action cannot contain a result.',
      );
    }
    return;
  }
  try {
    const normalizedThought = normalizeCapturedThought(action.action, action.capturedThought);
    if (normalizedThought !== action.capturedThought) {
      throw new DomainError(
        'sleep_check.invalid_rehydration',
        'Persisted captured text must already be normalized.',
      );
    }
  } catch (error: unknown) {
    throw new DomainError(
      'sleep_check.invalid_rehydration',
      'The persisted corrective-action result is invalid.',
      { cause: error },
    );
  }
}

function assertRating(value: number): asserts value is SubjectiveRating {
  if (!isSubjectiveRating(value)) {
    throw new DomainError(
      'sleep_check.invalid_rating',
      'A subjective rating must be an integer 1–5.',
    );
  }
}

function assertTime(value: Date): void {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new DomainError('sleep_check.invalid_time', 'A valid timestamp is required.');
  }
}

function assertQuestion(value: string): asserts value is SleepCheckQuestionId {
  if (!isSleepCheckQuestionId(value)) {
    throw new DomainError('sleep_check.invalid_question', 'Unknown sleep-check question.');
  }
}

function assertAnswer(value: string): asserts value is SleepCheckAnswerValue {
  if (!isSleepCheckAnswerValue(value)) {
    throw new DomainError('sleep_check.invalid_answer', 'Unknown sleep-check answer.');
  }
}

function assertCorrectiveAction(value: string): asserts value is CorrectiveActionKind {
  if (!isCorrectiveActionKind(value)) {
    throw new DomainError('sleep_check.invalid_corrective_action', 'Unknown corrective action.');
  }
}

function normalizeCapturedThought(
  action: CorrectiveActionKind,
  capturedThought: string | null,
): string | null {
  if (action !== CORRECTIVE_ACTION.captureThought) {
    if (capturedThought !== null) {
      throw new DomainError(
        'sleep_check.captured_thought_not_allowed',
        'Captured text is allowed only for the capture-thought action.',
      );
    }
    return null;
  }
  const normalized = capturedThought?.trim() ?? '';
  if (normalized.length === 0) {
    throw new DomainError(
      'sleep_check.captured_thought_required',
      'A captured thought is required for this action.',
    );
  }
  if (normalized.length > 280) {
    throw new DomainError(
      'sleep_check.captured_thought_too_long',
      'A captured thought cannot exceed 280 characters.',
    );
  }
  return normalized;
}

function copyAnswer(answer: SleepCheckAnswer): SleepCheckAnswer {
  return { ...answer, answeredAt: copyDate(answer.answeredAt) };
}

function copyCorrectiveAction(
  action: SleepCheckCorrectiveAction | null,
): SleepCheckCorrectiveAction | null {
  if (action === null) return null;
  return {
    ...action,
    selectedAt: copyDate(action.selectedAt),
    completedAt: copyOptionalDate(action.completedAt),
  };
}
