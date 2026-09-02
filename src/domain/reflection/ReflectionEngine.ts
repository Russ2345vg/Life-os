import { EntityId } from '../shared/EntityId';
import {
  REFLECTION_DAY_SIGNAL,
  REFLECTION_FAILURE_REASON,
  REFLECTION_QUESTION_KIND,
  REFLECTION_QUESTION_TYPE,
  ReflectionQuestion,
  type ReflectionAnswer,
  type ReflectionDaySignal,
  type ReflectionQuestionKind,
  type ReflectionQuestionOption,
  type ReflectionQuestionType,
} from './Reflection';

export const REFLECTION_CONTEXT_ENTITY_TYPE = {
  decision: 'DECISION',
  lifeAction: 'LIFE_ACTION',
  actionSession: 'ACTION_SESSION',
} as const;

export type ReflectionContextEntityType =
  (typeof REFLECTION_CONTEXT_ENTITY_TYPE)[keyof typeof REFLECTION_CONTEXT_ENTITY_TYPE];

export interface ReflectionContextItem {
  readonly entityType: ReflectionContextEntityType;
  readonly entityId: EntityId;
  readonly title: string;
  readonly isMainDecision: boolean;
  readonly repeatCount: number;
  readonly reasonKnown: boolean;
}

export interface ReflectionContext {
  readonly cycleId: EntityId;
  readonly dayId: EntityId;
  readonly dateKey: string;
  readonly mainDecision: ReflectionContextItem | null;
  readonly completedDecisions: readonly ReflectionContextItem[];
  readonly incompleteDecisions: readonly ReflectionContextItem[];
  readonly completedActions: readonly ReflectionContextItem[];
  readonly carriedForwardItems: readonly ReflectionContextItem[];
  readonly revisedItems: readonly ReflectionContextItem[];
  readonly droppedItems: readonly ReflectionContextItem[];
  readonly actionSessions: readonly ReflectionContextItem[];
  readonly openLoopResultCount: number;
}

interface QuestionCandidate {
  readonly priority: number;
  readonly tieBreaker: string;
  readonly question: ReflectionQuestion;
}

const FAILURE_REASON_OPTIONS: readonly ReflectionQuestionOption[] = Object.freeze([
  { value: REFLECTION_FAILURE_REASON.nextStepUnclear, label: 'Неясный следующий шаг' },
  { value: REFLECTION_FAILURE_REASON.timeInsufficient, label: 'Недостаток времени' },
  { value: REFLECTION_FAILURE_REASON.scopeTooLarge, label: 'Слишком большой объём' },
  { value: REFLECTION_FAILURE_REASON.energyLow, label: 'Усталость' },
  { value: REFLECTION_FAILURE_REASON.distractions, label: 'Отвлечения' },
  { value: REFLECTION_FAILURE_REASON.priorityLost, label: 'Изменился приоритет' },
  { value: REFLECTION_FAILURE_REASON.externalCause, label: 'Внешние обстоятельства' },
  { value: REFLECTION_FAILURE_REASON.purposeLost, label: 'Решение потеряло смысл' },
  { value: REFLECTION_FAILURE_REASON.other, label: 'Другое' },
]);

const SUCCESS_FACTOR_OPTIONS: readonly ReflectionQuestionOption[] = Object.freeze([
  { value: 'CLEAR_NEXT_STEP', label: 'Был ясен следующий шаг' },
  { value: 'PROTECTED_TIME', label: 'Удалось защитить время' },
  { value: 'MANAGEABLE_SCOPE', label: 'Объём был реалистичным' },
  { value: 'ENOUGH_ENERGY', label: 'Хватило энергии' },
  { value: 'SUPPORTIVE_ENVIRONMENT', label: 'Помогла среда' },
  { value: 'OTHER', label: 'Другое' },
]);

export interface ReflectionFollowUpInput {
  readonly context: ReflectionContext;
  readonly question: ReflectionQuestion;
  readonly answer: ReflectionAnswer;
  readonly currentQuestionCount: number;
}

export class ReflectionEngine {
  public generate(context: ReflectionContext): readonly ReflectionQuestion[] {
    const candidates = [
      ...mainDecisionCandidate(context),
      ...repeatedFrictionCandidates(context),
      ...carryCandidates(context),
      ...changeCandidates(context),
      ...dropCandidates(context),
      ...successCandidates(context),
      ...focusCandidates(context),
    ];

    if (candidates.length === 0) candidates.push(generalLearningCandidate(context));

    const complexDay =
      candidates.length >= 4 ||
      context.carriedForwardItems.some((item) => item.repeatCount >= 2) ||
      context.incompleteDecisions.length >= 2;
    const limit = complexDay ? 4 : 3;
    const selected = candidates
      .sort(
        (left, right) =>
          left.priority - right.priority || left.tieBreaker.localeCompare(right.tieBreaker),
      )
      .slice(0, limit)
      .map((candidate) => candidate.question);

    return Object.freeze(
      selected.length > 0 ? selected : [generalLearningCandidate(context).question],
    );
  }

  public generateFollowUp(input: ReflectionFollowUpInput): ReflectionQuestion | null {
    if (input.currentQuestionCount >= 5) return null;
    const data = followUpData(input);
    if (data === null) return null;
    return ReflectionQuestion.create({
      id: `${input.question.id}:FOLLOW_UP`,
      kind: data.kind,
      signal: data.signal,
      type: data.type,
      prompt: data.prompt,
      context: data.context,
      required: true,
      sourceEntityIds: input.question.sourceEntityIds,
    });
  }
}

function mainDecisionCandidate(context: ReflectionContext): readonly QuestionCandidate[] {
  const main = context.mainDecision;
  if (main === null) return [];
  const completed = context.completedDecisions.some((item) => item.entityId.equals(main.entityId));
  if (completed) {
    return [
      candidate(
        1,
        main,
        REFLECTION_QUESTION_KIND.mainDecisionSuccess,
        REFLECTION_DAY_SIGNAL.success,
        REFLECTION_QUESTION_TYPE.singleChoice,
        `Главное Решение «${main.title}» завершено.`,
        'Что больше всего помогло получить результат?',
        true,
        SUCCESS_FACTOR_OPTIONS,
      ),
    ];
  }

  if (!context.incompleteDecisions.some((item) => item.entityId.equals(main.entityId))) return [];
  return [
    candidate(
      1,
      main,
      main.reasonKnown
        ? REFLECTION_QUESTION_KIND.mainDecisionFailureLearning
        : REFLECTION_QUESTION_KIND.mainDecisionFailureReason,
      REFLECTION_DAY_SIGNAL.failure,
      main.reasonKnown ? REFLECTION_QUESTION_TYPE.shortText : REFLECTION_QUESTION_TYPE.singleChoice,
      `Главное Решение «${main.title}» сегодня не завершено.`,
      main.reasonKnown
        ? 'Причина уже зафиксирована. Что важно изменить в следующей попытке?'
        : 'Что стало основной причиной?',
      true,
      main.reasonKnown ? [] : FAILURE_REASON_OPTIONS,
    ),
  ];
}

function repeatedFrictionCandidates(context: ReflectionContext): readonly QuestionCandidate[] {
  const repeated = context.carriedForwardItems.filter((item) => item.repeatCount >= 2);
  if (repeated.length === 0) return [];
  const sourceIds = repeated.map((item) => item.entityId);
  const titles = repeated.map((item) => `«${item.title}»`).join(', ');
  return [
    directCandidate({
      priority: 2,
      tieBreaker: sourceIds.map((id) => id.toString()).join(':'),
      kind: REFLECTION_QUESTION_KIND.repeatedFriction,
      signal: REFLECTION_DAY_SIGNAL.friction,
      type: REFLECTION_QUESTION_TYPE.multiChoice,
      context: `Повторно перенесено: ${titles}.`,
      prompt: 'Какие факторы поддерживают этот повторяющийся сбой?',
      required: true,
      sourceEntityIds: sourceIds,
      options: FAILURE_REASON_OPTIONS,
    }),
  ];
}

function carryCandidates(context: ReflectionContext): readonly QuestionCandidate[] {
  return context.carriedForwardItems
    .filter((item) => item.repeatCount < 2 && !item.isMainDecision)
    .slice(0, 2)
    .map((item) =>
      candidate(
        3,
        item,
        REFLECTION_QUESTION_KIND.significantCarry,
        REFLECTION_DAY_SIGNAL.friction,
        REFLECTION_QUESTION_TYPE.shortText,
        `Элемент «${item.title}» перенесён.`,
        item.reasonKnown
          ? 'Причина переноса уже зафиксирована. Что поможет выполнить это в следующий раз?'
          : 'Почему это пришлось перенести?',
        true,
      ),
    );
}

function changeCandidates(context: ReflectionContext): readonly QuestionCandidate[] {
  return context.revisedItems
    .slice(0, 2)
    .map((item) =>
      candidate(
        4,
        item,
        REFLECTION_QUESTION_KIND.change,
        REFLECTION_DAY_SIGNAL.change,
        REFLECTION_QUESTION_TYPE.shortText,
        `Элемент «${item.title}» был пересмотрен.`,
        'Что изменилось в понимании задачи?',
        true,
      ),
    );
}

function dropCandidates(context: ReflectionContext): readonly QuestionCandidate[] {
  return context.droppedItems
    .slice(0, 2)
    .map((item) =>
      candidate(
        4,
        item,
        REFLECTION_QUESTION_KIND.dropLearning,
        REFLECTION_DAY_SIGNAL.learning,
        REFLECTION_QUESTION_TYPE.shortText,
        `От элемента «${item.title}» отказались${item.reasonKnown ? ', причина уже зафиксирована' : ''}.`,
        item.reasonKnown
          ? 'Какой вывод из этого решения стоит сохранить?'
          : 'Почему от этого было правильно отказаться?',
        true,
      ),
    );
}

function successCandidates(context: ReflectionContext): readonly QuestionCandidate[] {
  const mainId = context.mainDecision?.entityId;
  const successful = [
    ...context.completedDecisions.filter(
      (item) => mainId === undefined || !item.entityId.equals(mainId),
    ),
    ...context.completedActions,
  ];
  if (successful.length === 0) return [];
  const first = successful[0];
  if (first === undefined) return [];
  return [
    candidate(
      5,
      first,
      REFLECTION_QUESTION_KIND.significantSuccess,
      REFLECTION_DAY_SIGNAL.success,
      REFLECTION_QUESTION_TYPE.optionalText,
      `Получен результат по элементу «${first.title}».`,
      'Что из этого успеха стоит повторить?',
      false,
    ),
  ];
}

function focusCandidates(context: ReflectionContext): readonly QuestionCandidate[] {
  if (context.actionSessions.length === 0) return [];
  const sourceIds = context.actionSessions.map((item) => item.entityId);
  return [
    directCandidate({
      priority: 5,
      tieBreaker: sourceIds.map((id) => id.toString()).join(':'),
      kind: REFLECTION_QUESTION_KIND.focus,
      signal: REFLECTION_DAY_SIGNAL.focus,
      type: REFLECTION_QUESTION_TYPE.optionalText,
      context: `Рабочих сессий за день: ${context.actionSessions.length}.`,
      prompt: 'Что сильнее всего влияло на качество фокуса?',
      required: false,
      sourceEntityIds: sourceIds,
      options: [],
    }),
  ];
}

function generalLearningCandidate(context: ReflectionContext): QuestionCandidate {
  return directCandidate({
    priority: 6,
    tieBreaker: context.cycleId.toString(),
    kind: REFLECTION_QUESTION_KIND.generalLearning,
    signal: REFLECTION_DAY_SIGNAL.learning,
    type: REFLECTION_QUESTION_TYPE.yesNo,
    context: 'Значимых отклонений или результатов сегодня не зафиксировано.',
    prompt: 'Есть ли один полезный вывод из сегодняшнего дня?',
    required: true,
    sourceEntityIds: [],
    options: [],
  });
}

interface ReflectionFollowUpData {
  readonly kind: ReflectionQuestionKind;
  readonly signal: ReflectionDaySignal;
  readonly type: ReflectionQuestionType;
  readonly prompt: string;
  readonly context: string;
}

function followUpData(input: ReflectionFollowUpInput): ReflectionFollowUpData | null {
  const { question, answer } = input;
  if (
    question.kind === REFLECTION_QUESTION_KIND.mainDecisionSuccess &&
    typeof answer === 'string'
  ) {
    return {
      kind: REFLECTION_QUESTION_KIND.mainDecisionSuccess,
      signal: REFLECTION_DAY_SIGNAL.success,
      type: REFLECTION_QUESTION_TYPE.yesNo,
      prompt: 'Сохранить этот подход для следующего похожего Решения?',
      context: question.context,
    };
  }
  if (
    question.kind === REFLECTION_QUESTION_KIND.mainDecisionFailureReason &&
    typeof answer === 'string'
  ) {
    return {
      kind: REFLECTION_QUESTION_KIND.mainDecisionFailureLearning,
      signal: REFLECTION_DAY_SIGNAL.learning,
      type: REFLECTION_QUESTION_TYPE.shortCapture,
      prompt:
        answer === REFLECTION_FAILURE_REASON.other
          ? 'Что именно помешало завершить Решение?'
          : 'Что конкретно изменить в следующей попытке?',
      context: question.context,
    };
  }
  if (
    question.kind === REFLECTION_QUESTION_KIND.repeatedFriction &&
    Array.isArray(answer) &&
    answer.length > 0
  ) {
    return {
      kind: REFLECTION_QUESTION_KIND.significantCarry,
      signal: REFLECTION_DAY_SIGNAL.learning,
      type: REFLECTION_QUESTION_TYPE.shortCapture,
      prompt: 'Какую одну корректировку попробовать в следующий раз?',
      context: question.context,
    };
  }
  if (
    question.kind === REFLECTION_QUESTION_KIND.generalLearning &&
    typeof answer === 'boolean' &&
    answer
  ) {
    return {
      kind: REFLECTION_QUESTION_KIND.generalLearning,
      signal: REFLECTION_DAY_SIGNAL.learning,
      type: REFLECTION_QUESTION_TYPE.shortCapture,
      prompt: 'Какой один вывод стоит сохранить?',
      context: question.context,
    };
  }
  return null;
}

function candidate(
  priority: number,
  item: ReflectionContextItem,
  kind: ReflectionQuestionKind,
  signal: ReflectionDaySignal,
  type: ReflectionQuestionType,
  context: string,
  prompt: string,
  required: boolean,
  options: readonly ReflectionQuestionOption[] = [],
): QuestionCandidate {
  return directCandidate({
    priority,
    tieBreaker: item.entityId.toString(),
    kind,
    signal,
    type,
    context,
    prompt,
    required,
    sourceEntityIds: [item.entityId],
    options,
  });
}

function directCandidate(data: {
  readonly priority: number;
  readonly tieBreaker: string;
  readonly kind: ReflectionQuestionKind;
  readonly signal: ReflectionDaySignal;
  readonly type: ReflectionQuestionType;
  readonly context: string;
  readonly prompt: string;
  readonly required: boolean;
  readonly sourceEntityIds: readonly EntityId[];
  readonly options: readonly ReflectionQuestionOption[];
}): QuestionCandidate {
  const sourceKey =
    data.sourceEntityIds
      .map((id) => id.toString())
      .sort()
      .join('-') || 'day';
  return {
    priority: data.priority,
    tieBreaker: data.tieBreaker,
    question: ReflectionQuestion.create({
      id: `${data.kind}:${sourceKey}`,
      kind: data.kind,
      signal: data.signal,
      type: data.type,
      prompt: data.prompt,
      context: data.context,
      required: data.required,
      sourceEntityIds: data.sourceEntityIds,
      options: data.options,
    }),
  };
}
