import { DomainError } from '../../shared/errors/DomainError';
import { EntityId } from '../shared/EntityId';
import { copyDate } from '../shared/dateCopy';

export const REFLECTION_DAY_SIGNAL = {
  success: 'SUCCESS',
  failure: 'FAILURE',
  friction: 'FRICTION',
  focus: 'FOCUS',
  change: 'CHANGE',
  learning: 'LEARNING',
} as const;

export type ReflectionDaySignal =
  (typeof REFLECTION_DAY_SIGNAL)[keyof typeof REFLECTION_DAY_SIGNAL];

export const REFLECTION_QUESTION_TYPE = {
  yesNo: 'YES_NO',
  singleChoice: 'SINGLE_CHOICE',
  multiChoice: 'MULTI_CHOICE',
  rating1To5: 'RATING_1_5',
  shortCapture: 'SHORT_CAPTURE',
  shortText: 'SHORT_TEXT',
  optionalText: 'OPTIONAL_TEXT',
} as const;

export type ReflectionQuestionType =
  (typeof REFLECTION_QUESTION_TYPE)[keyof typeof REFLECTION_QUESTION_TYPE];

export const REFLECTION_QUESTION_KIND = {
  mainDecisionSuccess: 'MAIN_DECISION_SUCCESS',
  mainDecisionFailureReason: 'MAIN_DECISION_FAILURE_REASON',
  mainDecisionFailureLearning: 'MAIN_DECISION_FAILURE_LEARNING',
  repeatedFriction: 'REPEATED_FRICTION',
  significantCarry: 'SIGNIFICANT_CARRY',
  change: 'CHANGE',
  dropLearning: 'DROP_LEARNING',
  significantSuccess: 'SIGNIFICANT_SUCCESS',
  focus: 'FOCUS',
  generalLearning: 'GENERAL_LEARNING',
} as const;

export type ReflectionQuestionKind =
  (typeof REFLECTION_QUESTION_KIND)[keyof typeof REFLECTION_QUESTION_KIND];

export const REFLECTION_FAILURE_REASON = {
  nextStepUnclear: 'NEXT_STEP_UNCLEAR',
  timeInsufficient: 'TIME_INSUFFICIENT',
  scopeTooLarge: 'TOO_LARGE',
  priorityLost: 'PRIORITY_LOST',
  energyLow: 'ENERGY_LOW',
  distractions: 'DISTRACTIONS',
  externalCause: 'EXTERNAL_CAUSE',
  purposeLost: 'PURPOSE_LOST',
  other: 'OTHER',
} as const;

export type ReflectionFailureReason =
  (typeof REFLECTION_FAILURE_REASON)[keyof typeof REFLECTION_FAILURE_REASON];

export const REFLECTION_SIGNAL_TYPE = {
  nextStepUnclear: 'NEXT_STEP_UNCLEAR',
  timeInsufficient: 'TIME_INSUFFICIENT',
  scopeTooLarge: 'SCOPE_TOO_LARGE',
  priorityLost: 'PRIORITY_LOST',
  energyLow: 'ENERGY_LOW',
  externalBlocker: 'EXTERNAL_BLOCKER',
  purposeLost: 'PURPOSE_LOST',
} as const;

export type ReflectionSignalType =
  (typeof REFLECTION_SIGNAL_TYPE)[keyof typeof REFLECTION_SIGNAL_TYPE];

export interface ReflectionQuestionOption {
  readonly value: string;
  readonly label: string;
}

export interface ReflectionQuestionData {
  readonly id: string;
  readonly kind: ReflectionQuestionKind;
  readonly signal: ReflectionDaySignal;
  readonly type: ReflectionQuestionType;
  readonly prompt: string;
  readonly context: string;
  readonly required: boolean;
  readonly sourceEntityIds: readonly EntityId[];
  readonly options?: readonly ReflectionQuestionOption[];
}

export class ReflectionQuestion {
  public readonly id: string;
  public readonly kind: ReflectionQuestionKind;
  public readonly signal: ReflectionDaySignal;
  public readonly type: ReflectionQuestionType;
  public readonly prompt: string;
  public readonly context: string;
  public readonly required: boolean;
  public readonly sourceEntityIds: readonly EntityId[];
  public readonly options: readonly ReflectionQuestionOption[];

  private constructor(data: ReflectionQuestionData) {
    this.id = normalizeRequiredText(data.id, 240, 'reflection.invalid_question_id');
    this.kind = data.kind;
    this.signal = data.signal;
    this.type = data.type;
    this.prompt = normalizeRequiredText(data.prompt, 1_000, 'reflection.invalid_prompt');
    this.context = normalizeRequiredText(data.context, 1_000, 'reflection.invalid_context');
    this.required = data.required;
    this.sourceEntityIds = uniqueEntityIds(data.sourceEntityIds);
    this.options = normalizeOptions(data.type, data.options ?? []);
    Object.freeze(this);
  }

  public static create(data: ReflectionQuestionData): ReflectionQuestion {
    assertQuestionKind(data.kind);
    assertDaySignal(data.signal);
    assertQuestionType(data.type);
    return new ReflectionQuestion(data);
  }
}

export type ReflectionRatingAnswer = 1 | 2 | 3 | 4 | 5;

export interface ReflectionAnswerByQuestionType {
  readonly YES_NO: boolean;
  readonly SINGLE_CHOICE: string;
  readonly MULTI_CHOICE: readonly string[];
  readonly RATING_1_5: ReflectionRatingAnswer;
  readonly SHORT_CAPTURE: string;
  readonly SHORT_TEXT: string;
  readonly OPTIONAL_TEXT: string;
}

export type ReflectionAnswerFor<T extends ReflectionQuestionType> =
  ReflectionAnswerByQuestionType[T];

export type ReflectionAnswer = ReflectionAnswerFor<ReflectionQuestionType>;

export const REFLECTION_RESULT_STATUS = {
  answered: 'ANSWERED',
  skipped: 'SKIPPED',
} as const;

export type ReflectionResultStatus =
  (typeof REFLECTION_RESULT_STATUS)[keyof typeof REFLECTION_RESULT_STATUS];

export interface ReflectionResultData {
  readonly cycleId: EntityId;
  readonly questionId: string;
  readonly questionType: ReflectionQuestionType;
  readonly sourceEntityIds: readonly EntityId[];
  readonly status: ReflectionResultStatus;
  readonly answer: ReflectionAnswer | null;
  readonly answeredAt: Date;
}

export class ReflectionResult {
  public readonly cycleId: EntityId;
  public readonly questionId: string;
  public readonly questionType: ReflectionQuestionType;
  public readonly sourceEntityIds: readonly EntityId[];
  public readonly status: ReflectionResultStatus;
  public readonly answer: ReflectionAnswer | null;
  readonly #answeredAt: Date;

  private constructor(data: ReflectionResultData) {
    assertEntityId(data.cycleId, 'reflection.invalid_cycle_id');
    this.cycleId = data.cycleId;
    this.questionId = normalizeRequiredText(data.questionId, 240, 'reflection.invalid_question_id');
    assertQuestionType(data.questionType);
    this.questionType = data.questionType;
    this.sourceEntityIds = uniqueEntityIds(data.sourceEntityIds);
    this.status = data.status;
    this.answer = copyAnswer(data.answer);
    assertResultAnswer(this.questionType, this.status, this.answer);
    assertDate(data.answeredAt, 'reflection.invalid_answered_at');
    this.#answeredAt = copyDate(data.answeredAt);
    Object.freeze(this);
  }

  public static answer(
    cycleId: EntityId,
    question: ReflectionQuestion,
    answer: ReflectionAnswer,
    answeredAt: Date,
  ): ReflectionResult {
    validateAnswer(question, answer);
    const normalizedAnswer = normalizeAnswer(question.type, answer);
    return new ReflectionResult({
      cycleId,
      questionId: question.id,
      questionType: question.type,
      sourceEntityIds: question.sourceEntityIds,
      status: REFLECTION_RESULT_STATUS.answered,
      answer: normalizedAnswer,
      answeredAt,
    });
  }

  public static skip(
    cycleId: EntityId,
    question: ReflectionQuestion,
    answeredAt: Date,
  ): ReflectionResult {
    if (question.required) {
      throw new DomainError(
        'reflection.required_question_cannot_be_skipped',
        'Обязательный вопрос нельзя пропустить.',
      );
    }
    return new ReflectionResult({
      cycleId,
      questionId: question.id,
      questionType: question.type,
      sourceEntityIds: question.sourceEntityIds,
      status: REFLECTION_RESULT_STATUS.skipped,
      answer: null,
      answeredAt,
    });
  }

  public static rehydrate(data: ReflectionResultData): ReflectionResult {
    return new ReflectionResult(data);
  }

  public get answeredAt(): Date {
    return copyDate(this.#answeredAt);
  }
}

export interface ReflectionSignalData {
  readonly type: ReflectionSignalType;
  readonly sourceEntityId: EntityId;
  readonly cycleId: EntityId;
  readonly createdAt: Date;
}

export class ReflectionSignal {
  public readonly type: ReflectionSignalType;
  public readonly sourceEntityId: EntityId;
  public readonly cycleId: EntityId;
  readonly #createdAt: Date;

  private constructor(data: ReflectionSignalData) {
    assertSignalType(data.type);
    assertEntityId(data.sourceEntityId, 'reflection.invalid_signal_source');
    assertEntityId(data.cycleId, 'reflection.invalid_cycle_id');
    assertDate(data.createdAt, 'reflection.invalid_signal_time');
    this.type = data.type;
    this.sourceEntityId = data.sourceEntityId;
    this.cycleId = data.cycleId;
    this.#createdAt = copyDate(data.createdAt);
    Object.freeze(this);
  }

  public static create(data: ReflectionSignalData): ReflectionSignal {
    return new ReflectionSignal(data);
  }

  public get createdAt(): Date {
    return copyDate(this.#createdAt);
  }

  public key(): string {
    return `${this.type}:${this.sourceEntityId.toString()}`;
  }
}

export interface ReflectionCorrectionData {
  readonly id: EntityId;
  readonly cycleId: EntityId;
  readonly sourceQuestionId: string;
  readonly sourceEntityIds: readonly EntityId[];
  readonly observation: string;
  readonly action: string;
  readonly createdAt: Date;
}

export class ReflectionCorrection {
  public readonly id: EntityId;
  public readonly cycleId: EntityId;
  public readonly sourceQuestionId: string;
  public readonly sourceEntityIds: readonly EntityId[];
  public readonly observation: string;
  public readonly action: string;
  readonly #createdAt: Date;

  private constructor(data: ReflectionCorrectionData) {
    assertEntityId(data.id, 'reflection.invalid_correction_id');
    assertEntityId(data.cycleId, 'reflection.invalid_cycle_id');
    this.id = data.id;
    this.cycleId = data.cycleId;
    this.sourceQuestionId = normalizeRequiredText(
      data.sourceQuestionId,
      240,
      'reflection.invalid_question_id',
    );
    this.sourceEntityIds = uniqueEntityIds(data.sourceEntityIds);
    this.observation = normalizeRequiredText(
      data.observation,
      2_000,
      'reflection.invalid_observation',
    );
    this.action = normalizeRequiredText(data.action, 2_000, 'reflection.invalid_correction');
    assertDate(data.createdAt, 'reflection.invalid_correction_time');
    this.#createdAt = copyDate(data.createdAt);
    Object.freeze(this);
  }

  public static create(data: ReflectionCorrectionData): ReflectionCorrection {
    return new ReflectionCorrection(data);
  }

  public get createdAt(): Date {
    return copyDate(this.#createdAt);
  }
}

export function isReflectionQuestionKind(value: string): value is ReflectionQuestionKind {
  return (Object.values(REFLECTION_QUESTION_KIND) as readonly string[]).includes(value);
}

export function isReflectionDaySignal(value: string): value is ReflectionDaySignal {
  return (Object.values(REFLECTION_DAY_SIGNAL) as readonly string[]).includes(value);
}

export function isReflectionQuestionType(value: string): value is ReflectionQuestionType {
  return (Object.values(REFLECTION_QUESTION_TYPE) as readonly string[]).includes(value);
}

export function isReflectionResultStatus(value: string): value is ReflectionResultStatus {
  return (Object.values(REFLECTION_RESULT_STATUS) as readonly string[]).includes(value);
}

export function isReflectionSignalType(value: string): value is ReflectionSignalType {
  return (Object.values(REFLECTION_SIGNAL_TYPE) as readonly string[]).includes(value);
}

export function signalTypeForFailureReason(reason: string): ReflectionSignalType | null {
  const mapping: Readonly<Record<string, ReflectionSignalType>> = {
    [REFLECTION_FAILURE_REASON.nextStepUnclear]: REFLECTION_SIGNAL_TYPE.nextStepUnclear,
    [REFLECTION_FAILURE_REASON.timeInsufficient]: REFLECTION_SIGNAL_TYPE.timeInsufficient,
    [REFLECTION_FAILURE_REASON.scopeTooLarge]: REFLECTION_SIGNAL_TYPE.scopeTooLarge,
    [REFLECTION_FAILURE_REASON.priorityLost]: REFLECTION_SIGNAL_TYPE.priorityLost,
    [REFLECTION_FAILURE_REASON.energyLow]: REFLECTION_SIGNAL_TYPE.energyLow,
    [REFLECTION_FAILURE_REASON.externalCause]: REFLECTION_SIGNAL_TYPE.externalBlocker,
    [REFLECTION_FAILURE_REASON.purposeLost]: REFLECTION_SIGNAL_TYPE.purposeLost,
  };
  return mapping[reason] ?? null;
}

function normalizeOptions(
  type: ReflectionQuestionType,
  options: readonly ReflectionQuestionOption[],
): readonly ReflectionQuestionOption[] {
  const normalized = options.map((option) =>
    Object.freeze({
      value: normalizeRequiredText(option.value, 120, 'reflection.invalid_option'),
      label: normalizeRequiredText(option.label, 240, 'reflection.invalid_option'),
    }),
  );
  const needsOptions =
    type === REFLECTION_QUESTION_TYPE.singleChoice || type === REFLECTION_QUESTION_TYPE.multiChoice;
  if (needsOptions && normalized.length < 2) {
    throw new DomainError(
      'reflection.invalid_options',
      'Для вопроса с выбором нужны как минимум два варианта.',
    );
  }
  if (!needsOptions && normalized.length > 0) {
    throw new DomainError(
      'reflection.invalid_options',
      'Этот тип вопроса не должен содержать варианты ответа.',
    );
  }
  if (new Set(normalized.map((option) => option.value)).size !== normalized.length) {
    throw new DomainError('reflection.invalid_options', 'Варианты ответа не должны повторяться.');
  }
  return Object.freeze(normalized);
}

function validateAnswer(question: ReflectionQuestion, answer: ReflectionAnswer): void {
  assertAnswerShape(question.type, answer);
  if (
    question.type === REFLECTION_QUESTION_TYPE.singleChoice &&
    (typeof answer !== 'string' || !question.options.some((option) => option.value === answer))
  ) {
    throw new DomainError('reflection.invalid_answer', 'Выберите один из предложенных вариантов.');
  }
  if (question.type === REFLECTION_QUESTION_TYPE.multiChoice) {
    if (!Array.isArray(answer)) {
      throw new DomainError(
        'reflection.invalid_answer',
        'Выберите один или несколько предложенных вариантов.',
      );
    }
    if (answer.some((value) => !question.options.some((option) => option.value === value))) {
      throw new DomainError(
        'reflection.invalid_answer',
        'Выберите один или несколько предложенных вариантов.',
      );
    }
  }
}

function assertResultAnswer(
  questionType: ReflectionQuestionType,
  status: ReflectionResultStatus,
  answer: ReflectionAnswer | null,
): void {
  if (!isReflectionResultStatus(status)) {
    throw new DomainError('reflection.invalid_result_status', 'Статус ответа неизвестен.');
  }
  if (status === REFLECTION_RESULT_STATUS.skipped && answer !== null) {
    throw new DomainError('reflection.invalid_answer', 'Пропущенный вопрос не содержит ответ.');
  }
  if (status === REFLECTION_RESULT_STATUS.answered && answer === null) {
    throw new DomainError('reflection.invalid_answer', 'Сохранённый ответ не может быть пустым.');
  }
  if (status === REFLECTION_RESULT_STATUS.answered && answer !== null) {
    assertAnswerShape(questionType, answer);
  }
}

function assertAnswerShape(type: ReflectionQuestionType, answer: ReflectionAnswer): void {
  if (type === REFLECTION_QUESTION_TYPE.yesNo && typeof answer !== 'boolean') {
    throw new DomainError('reflection.invalid_answer', 'Ответьте да или нет.');
  }
  if (type === REFLECTION_QUESTION_TYPE.singleChoice && typeof answer !== 'string') {
    throw new DomainError('reflection.invalid_answer', 'Выберите один из предложенных вариантов.');
  }
  if (type === REFLECTION_QUESTION_TYPE.multiChoice) {
    if (
      !Array.isArray(answer) ||
      answer.length === 0 ||
      !answer.every((value) => typeof value === 'string') ||
      new Set(answer).size !== answer.length
    ) {
      throw new DomainError(
        'reflection.invalid_answer',
        'Выберите один или несколько предложенных вариантов.',
      );
    }
  }
  if (
    type === REFLECTION_QUESTION_TYPE.rating1To5 &&
    (typeof answer !== 'number' || !Number.isInteger(answer) || answer < 1 || answer > 5)
  ) {
    throw new DomainError(
      'reflection.invalid_answer',
      'Оценка должна быть целым числом от 1 до 5.',
    );
  }
  if (
    (type === REFLECTION_QUESTION_TYPE.shortCapture ||
      type === REFLECTION_QUESTION_TYPE.shortText ||
      type === REFLECTION_QUESTION_TYPE.optionalText) &&
    (typeof answer !== 'string' || answer.trim().length === 0 || answer.trim().length > 2_000)
  ) {
    throw new DomainError('reflection.invalid_answer', 'Введите короткий ответ.');
  }
}

function normalizeAnswer(type: ReflectionQuestionType, answer: ReflectionAnswer): ReflectionAnswer {
  if (type === REFLECTION_QUESTION_TYPE.shortCapture && typeof answer === 'string') {
    return answer.trim();
  }
  return copyAnswer(answer)!;
}

function copyAnswer(answer: ReflectionAnswer | null): ReflectionAnswer | null {
  return Array.isArray(answer) ? Object.freeze([...answer]) : answer;
}

function uniqueEntityIds(ids: readonly EntityId[]): readonly EntityId[] {
  const unique = new Map<string, EntityId>();
  for (const id of ids) {
    assertEntityId(id, 'reflection.invalid_source_entity');
    unique.set(id.toString(), id);
  }
  return Object.freeze([...unique.values()]);
}

function normalizeRequiredText(value: string, maximum: number, code: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximum) {
    throw new DomainError(code, 'Текст рефлексии некорректен.');
  }
  return normalized;
}

function assertQuestionKind(value: ReflectionQuestionKind): void {
  if (!isReflectionQuestionKind(value)) {
    throw new DomainError('reflection.invalid_question_kind', 'Смысл вопроса неизвестен.');
  }
}

function assertDaySignal(value: ReflectionDaySignal): void {
  if (!isReflectionDaySignal(value)) {
    throw new DomainError('reflection.invalid_day_signal', 'Сигнал дня неизвестен.');
  }
}

function assertQuestionType(value: ReflectionQuestionType): void {
  if (!isReflectionQuestionType(value)) {
    throw new DomainError('reflection.invalid_question_type', 'Тип вопроса неизвестен.');
  }
}

function assertSignalType(value: ReflectionSignalType): void {
  if (!isReflectionSignalType(value)) {
    throw new DomainError('reflection.invalid_signal_type', 'Тип сигнала неизвестен.');
  }
}

function assertEntityId(value: EntityId, code: string): void {
  if (!(value instanceof EntityId)) {
    throw new DomainError(code, 'Идентификатор рефлексии некорректен.');
  }
}

function assertDate(value: Date, code: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DomainError(code, 'Время рефлексии некорректно.');
  }
}
