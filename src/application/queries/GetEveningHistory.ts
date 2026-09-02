import {
  EVENING_CYCLE_STATE,
  OPEN_LOOP_RESOLUTION,
  PREPARATION_ITEM_STATUS,
  REFLECTION_RESULT_STATUS,
  DayDate,
  type EveningCycle,
  type EveningCycleCompletion,
  type EveningCycleMode,
  type EveningCycleState,
  type EveningModeReason,
  type EveningStageSkipReason,
  type CorrectiveActionKind,
  type PreparationCategory,
  type PreparationItemStatus,
  type PreparationPlan,
  type PreparationPlanStatus,
  type RelaxationPractice,
  type ReflectionDaySignal,
  type ReflectionAnswer,
  type ReflectionQuestionKind,
  type ReflectionSignalType,
  type ScreenFreeState,
  type SleepCheckAnswerValue,
  type SleepCheckQuestionId,
  type SubjectiveRating,
  type TomorrowPlan,
  type TomorrowPlanStatus,
  type TomorrowPlanningQuality,
} from '../../domain';
import type { PreparationArea } from '../../domain/preparation';
import { DomainError } from '../../shared/errors/DomainError';
import type { EveningHistoryReader } from '../ports/EveningHistoryReader';

export const EVENING_HISTORY_RANGE_KIND = {
  last7Days: 'LAST_7_DAYS',
  last30Days: 'LAST_30_DAYS',
  custom: 'CUSTOM',
} as const;

export type EveningHistoryRangeKind =
  (typeof EVENING_HISTORY_RANGE_KIND)[keyof typeof EVENING_HISTORY_RANGE_KIND];

export type EveningHistoryRange =
  | {
      readonly kind:
        typeof EVENING_HISTORY_RANGE_KIND.last7Days | typeof EVENING_HISTORY_RANGE_KIND.last30Days;
      readonly endDate: DayDate;
    }
  | {
      readonly kind: typeof EVENING_HISTORY_RANGE_KIND.custom;
      readonly startDate: DayDate;
      readonly endDate: DayDate;
    };

export interface ResolvedEveningHistoryRange {
  readonly kind: EveningHistoryRangeKind;
  readonly startDate: string;
  readonly endDate: string;
  readonly dayCount: number;
}

export interface EveningHistoryResolutionCounts {
  readonly COMPLETE: number;
  readonly CARRY_FORWARD: number;
  readonly REVISE: number;
  readonly DROP: number;
}

export interface EveningHistoryReflectionAnswer {
  readonly questionId: string;
  readonly kind: ReflectionQuestionKind | null;
  readonly signal: ReflectionDaySignal | null;
  readonly answer: ReflectionAnswer;
  readonly answeredAt: string;
}

export interface EveningHistoryReflectionSignal {
  readonly type: ReflectionSignalType;
  readonly sourceEntityId: string;
  readonly createdAt: string;
}

export interface EveningHistoryResolution {
  readonly resolution: 'COMPLETE' | 'CARRY_FORWARD' | 'DROP';
  readonly entityType: string;
  readonly entityId: string;
  readonly note: string | null;
}

export interface EveningHistoryResolutionReason {
  readonly resolution: 'COMPLETE' | 'CARRY_FORWARD' | 'DROP';
  readonly entityType: string;
  readonly entityId: string;
  readonly note: string;
}

export interface EveningHistorySkippedStage {
  readonly stage: EveningCycleState;
  readonly reason: EveningStageSkipReason;
  readonly skippedAt: string;
}

export interface EveningHistoryEnvironmentItem {
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly area: PreparationArea;
  readonly category: PreparationCategory;
  readonly required: boolean;
  readonly recommendedDurationMinutes: number | null;
  readonly status: PreparationItemStatus;
  readonly completedAt: string | null;
  readonly skippedAt: string | null;
  readonly skipReason: string | null;
}

export interface EveningHistoryRelaxationFacts {
  readonly defaultPractice: RelaxationPractice;
  readonly selectedPractice: RelaxationPractice;
  readonly plannedPracticeDurationMinutes: number;
  readonly actualPracticeDurationMs: number | null;
  readonly drinkCompletedAt: string | null;
  readonly hygieneCompletedAt: string | null;
  readonly practiceStartedAt: string | null;
  readonly practiceCompletedAt: string | null;
  readonly screenFreePlannedDurationMinutes: number;
  readonly screenFreeOutcome: ScreenFreeState;
  readonly screenFreeActualDurationMs: number | null;
  readonly screenFreeStartedAt: string | null;
  readonly screenFreeSkippedAt: string | null;
  readonly screenFreeCompletedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface EveningHistorySleepCheckAnswer {
  readonly questionId: SleepCheckQuestionId;
  readonly initialAnswer: SleepCheckAnswerValue;
  readonly initialAnsweredAt: string;
  readonly retriedAnswer: SleepCheckAnswerValue | null;
  readonly retriedAnsweredAt: string | null;
}

export interface EveningHistoryCorrectiveAction {
  readonly questionId: SleepCheckQuestionId;
  readonly action: CorrectiveActionKind;
  readonly selectedAt: string;
  readonly completedAt: string | null;
  readonly capturedThought: string | null;
}

export interface EveningHistorySleepCheckFacts {
  readonly calmBefore: SubjectiveRating;
  readonly calmAfter: SubjectiveRating | null;
  readonly calmDelta: number | null;
  readonly sleepReadinessBefore: SubjectiveRating;
  readonly sleepReadinessAfter: SubjectiveRating | null;
  readonly sleepReadinessDelta: number | null;
  readonly beforeRatedAt: string;
  readonly afterRatedAt: string | null;
  readonly answers: readonly EveningHistorySleepCheckAnswer[];
  readonly correctiveAction: EveningHistoryCorrectiveAction | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const EVENING_HISTORY_PREPARATION_STATE = {
  notCreated: 'NOT_CREATED',
} as const;

export type EveningHistoryPreparationState =
  typeof EVENING_HISTORY_PREPARATION_STATE.notCreated | PreparationPlanStatus;

export interface EveningHistoryItem {
  readonly cycleId: string;
  readonly dayId: string;
  readonly dateKey: string;
  readonly state: EveningCycleState;
  readonly completion: EveningCycleCompletion | null;
  readonly mode: EveningCycleMode;
  readonly modeReason: EveningModeReason | null;
  readonly skipReason: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly durationMs: number | null;
  readonly resolutionCounts: EveningHistoryResolutionCounts;
  readonly reflectionAnswerCount: number;
  readonly reflectionAnswers: readonly EveningHistoryReflectionAnswer[];
  readonly resolutions: readonly EveningHistoryResolution[];
  readonly structuredReasons: readonly EveningHistoryResolutionReason[];
  readonly signals: readonly EveningHistoryReflectionSignal[];
  readonly hasTomorrowPlan: boolean;
  readonly tomorrowPlanStatus: TomorrowPlanStatus | null;
  readonly tomorrowPlanningQuality: TomorrowPlanningQuality | null;
  readonly primaryDecision: string | null;
  readonly hasFirstAction: boolean;
  readonly firstActionId: string | null;
  readonly preparationState: EveningHistoryPreparationState;
  readonly preparationItems: Readonly<{
    total: number;
    completed: number;
    skipped: number;
    pending: number;
    required: number;
    requiredSkipped: number;
    requiredPending: number;
  }>;
  readonly environmentItems: readonly EveningHistoryEnvironmentItem[];
  readonly relaxation: EveningHistoryRelaxationFacts | null;
  readonly sleepCheck: EveningHistorySleepCheckFacts | null;
  readonly skippedStages: readonly EveningHistorySkippedStage[];
}

export interface EveningHistoryResult {
  readonly range: ResolvedEveningHistoryRange;
  readonly items: readonly EveningHistoryItem[];
}

export class GetEveningHistory {
  public constructor(private readonly reader: EveningHistoryReader) {}

  public async execute(range: EveningHistoryRange): Promise<EveningHistoryResult> {
    const resolved = resolveEveningHistoryRange(range);
    const source = await this.reader.read({
      startDate: resolved.startDateValue,
      endDate: resolved.endDateValue,
    });
    const tomorrowByCycle = new Map(
      source.tomorrowPlans.map((plan) => [plan.cycleId.toString(), plan]),
    );
    const preparationByCycle = new Map(
      source.preparationPlans.map((plan) => [plan.cycleId.toString(), plan]),
    );
    const items = source.cycles
      .filter((cycle) => cycle.state === EVENING_CYCLE_STATE.completed || cycle.startedAt !== null)
      .filter((cycle) =>
        isWithinRange(cycle.dateKey, resolved.startDateValue, resolved.endDateValue),
      )
      .map((cycle) =>
        toHistoryItem(
          cycle,
          tomorrowByCycle.get(cycle.id.toString()) ?? null,
          preparationByCycle.get(cycle.id.toString()) ?? null,
        ),
      )
      .sort((left, right) => right.dateKey.localeCompare(left.dateKey));

    return Object.freeze({
      range: Object.freeze({
        kind: range.kind,
        startDate: resolved.startDateValue.toString(),
        endDate: resolved.endDateValue.toString(),
        dayCount: resolved.dayCount,
      }),
      items: Object.freeze(items),
    });
  }
}

interface InternalResolvedRange {
  readonly startDateValue: DayDate;
  readonly endDateValue: DayDate;
  readonly dayCount: number;
}

export function resolveEveningHistoryRange(range: EveningHistoryRange): InternalResolvedRange {
  let dayCount: number;
  let startDateValue: DayDate;
  if (range.kind === EVENING_HISTORY_RANGE_KIND.custom) {
    dayCount = inclusiveDayCount(range.startDate, range.endDate);
    startDateValue = range.startDate;
  } else {
    dayCount = range.kind === EVENING_HISTORY_RANGE_KIND.last7Days ? 7 : 30;
    startDateValue = shiftDayDate(range.endDate, -(dayCount - 1));
  }
  const { endDate: endDateValue } = range;
  if (startDateValue.isAfter(endDateValue)) {
    throw new DomainError(
      'evening_history.invalid_date_range',
      'Начальная дата истории вечерних циклов не может быть позже конечной.',
    );
  }
  return Object.freeze({ startDateValue, endDateValue, dayCount });
}

function toHistoryItem(
  cycle: EveningCycle,
  tomorrowPlan: TomorrowPlan | null,
  preparationPlan: PreparationPlan | null,
): EveningHistoryItem {
  const questions = new Map(cycle.reflectionQuestions.map((question) => [question.id, question]));
  const answers = cycle.reflectionResults
    .filter(
      (result) => result.status === REFLECTION_RESULT_STATUS.answered && result.answer !== null,
    )
    .map((result) => {
      const question = questions.get(result.questionId);
      return Object.freeze({
        questionId: result.questionId,
        kind: question?.kind ?? null,
        signal: question?.signal ?? null,
        answer: Array.isArray(result.answer) ? Object.freeze([...result.answer]) : result.answer!,
        answeredAt: result.answeredAt.toISOString(),
      });
    });
  const resolutionCounts = emptyResolutionCounts();
  for (const resolution of cycle.openLoopResolutions) {
    resolutionCounts[resolution.resolution] += 1;
  }
  const activePreparationItems = preparationPlan?.activeItems ?? [];
  const completedAt = cycle.completedAt;
  const startedAt = cycle.startedAt;

  return Object.freeze({
    cycleId: cycle.id.toString(),
    dayId: cycle.dayId.toString(),
    dateKey: cycle.dateKey.toString(),
    state: cycle.state,
    completion: cycle.state === EVENING_CYCLE_STATE.completed ? cycle.completion : null,
    mode: cycle.mode,
    modeReason: cycle.modeReason,
    skipReason: cycle.skipReason,
    startedAt: startedAt?.toISOString() ?? null,
    completedAt: completedAt?.toISOString() ?? null,
    durationMs:
      startedAt === null || completedAt === null
        ? null
        : Math.max(0, completedAt.getTime() - startedAt.getTime()),
    resolutionCounts: Object.freeze(resolutionCounts),
    reflectionAnswerCount: answers.length,
    reflectionAnswers: Object.freeze(answers),
    resolutions: Object.freeze(
      cycle.openLoopResolutions.map((resolution) =>
        Object.freeze({
          resolution: resolution.resolution,
          entityType: resolution.entityType,
          entityId: resolution.entityId.toString(),
          note: resolution.note,
        }),
      ),
    ),
    structuredReasons: Object.freeze(
      cycle.openLoopResolutions
        .filter((resolution) => resolution.note !== null)
        .map((resolution) =>
          Object.freeze({
            resolution: resolution.resolution,
            entityType: resolution.entityType,
            entityId: resolution.entityId.toString(),
            note: resolution.note!,
          }),
        ),
    ),
    signals: Object.freeze(
      cycle.reflectionSignals.map((signal) =>
        Object.freeze({
          type: signal.type,
          sourceEntityId: signal.sourceEntityId.toString(),
          createdAt: signal.createdAt.toISOString(),
        }),
      ),
    ),
    hasTomorrowPlan: tomorrowPlan !== null,
    tomorrowPlanStatus: tomorrowPlan?.status ?? null,
    tomorrowPlanningQuality: tomorrowPlan?.planningQuality ?? null,
    primaryDecision: tomorrowPlan?.primaryDecisionId?.toString() ?? null,
    hasFirstAction: tomorrowPlan?.firstActionId !== null && tomorrowPlan !== null,
    firstActionId: tomorrowPlan?.firstActionId?.toString() ?? null,
    preparationState: preparationPlan?.status ?? EVENING_HISTORY_PREPARATION_STATE.notCreated,
    preparationItems: Object.freeze({
      total: activePreparationItems.length,
      completed: activePreparationItems.filter(
        (item) => item.status === PREPARATION_ITEM_STATUS.completed,
      ).length,
      skipped: activePreparationItems.filter(
        (item) => item.status === PREPARATION_ITEM_STATUS.skipped,
      ).length,
      pending: activePreparationItems.filter(
        (item) => item.status === PREPARATION_ITEM_STATUS.pending,
      ).length,
      required: activePreparationItems.filter((item) => item.required).length,
      requiredSkipped: activePreparationItems.filter(
        (item) => item.required && item.status === PREPARATION_ITEM_STATUS.skipped,
      ).length,
      requiredPending: activePreparationItems.filter(
        (item) => item.required && item.status === PREPARATION_ITEM_STATUS.pending,
      ).length,
    }),
    environmentItems: Object.freeze(
      activePreparationItems.map((item) =>
        Object.freeze({
          id: item.id.toString(),
          key: item.key,
          title: item.title,
          area: item.area,
          category: item.category,
          required: item.required,
          recommendedDurationMinutes: item.recommendedDurationMinutes,
          status: item.status,
          completedAt: item.completedAt?.toISOString() ?? null,
          skippedAt: item.skippedAt?.toISOString() ?? null,
          skipReason: item.skipReason,
        }),
      ),
    ),
    relaxation: relaxationFacts(cycle),
    sleepCheck: sleepCheckFacts(cycle),
    skippedStages: Object.freeze(
      cycle.skippedStages.map((stage) =>
        Object.freeze({
          stage: stage.stage,
          reason: stage.reason,
          skippedAt: stage.skippedAt.toISOString(),
        }),
      ),
    ),
  });
}

function relaxationFacts(cycle: EveningCycle): EveningHistoryRelaxationFacts | null {
  const relaxation = cycle.relaxation;
  if (relaxation === null) return null;
  return Object.freeze({
    defaultPractice: relaxation.defaultPractice,
    selectedPractice: relaxation.selectedPractice,
    plannedPracticeDurationMinutes: relaxation.practiceDurationMinutes,
    actualPracticeDurationMs: elapsedMs(
      relaxation.practiceTimerStartedAt,
      relaxation.practiceCompletedAt,
    ),
    drinkCompletedAt: relaxation.drinkCompletedAt?.toISOString() ?? null,
    hygieneCompletedAt: relaxation.hygieneCompletedAt?.toISOString() ?? null,
    practiceStartedAt: relaxation.practiceTimerStartedAt?.toISOString() ?? null,
    practiceCompletedAt: relaxation.practiceCompletedAt?.toISOString() ?? null,
    screenFreePlannedDurationMinutes: relaxation.screenFreeDurationMinutes,
    screenFreeOutcome: relaxation.screenFreeState,
    screenFreeActualDurationMs: elapsedMs(
      relaxation.screenFreeStartedAt,
      relaxation.screenFreeCompletedAt,
    ),
    screenFreeStartedAt: relaxation.screenFreeStartedAt?.toISOString() ?? null,
    screenFreeSkippedAt: relaxation.screenFreeSkippedAt?.toISOString() ?? null,
    screenFreeCompletedAt: relaxation.screenFreeCompletedAt?.toISOString() ?? null,
    createdAt: relaxation.createdAt.toISOString(),
    updatedAt: relaxation.updatedAt.toISOString(),
  });
}

function sleepCheckFacts(cycle: EveningCycle): EveningHistorySleepCheckFacts | null {
  const sleepCheck = cycle.sleepCheck;
  if (sleepCheck === null) return null;
  const retryByQuestion = new Map(
    sleepCheck.retriedAnswers.map((answer) => [answer.questionId, answer]),
  );
  const correctiveAction = sleepCheck.correctiveAction;
  return Object.freeze({
    calmBefore: sleepCheck.calmBefore,
    calmAfter: sleepCheck.calmAfter,
    calmDelta: sleepCheck.calmAfter === null ? null : sleepCheck.calmAfter - sleepCheck.calmBefore,
    sleepReadinessBefore: sleepCheck.sleepReadinessBefore,
    sleepReadinessAfter: sleepCheck.sleepReadinessAfter,
    sleepReadinessDelta:
      sleepCheck.sleepReadinessAfter === null
        ? null
        : sleepCheck.sleepReadinessAfter - sleepCheck.sleepReadinessBefore,
    beforeRatedAt: sleepCheck.beforeRatedAt.toISOString(),
    afterRatedAt: sleepCheck.afterRatedAt?.toISOString() ?? null,
    answers: Object.freeze(
      sleepCheck.initialAnswers.map((answer) => {
        const retry = retryByQuestion.get(answer.questionId) ?? null;
        return Object.freeze({
          questionId: answer.questionId,
          initialAnswer: answer.value,
          initialAnsweredAt: answer.answeredAt.toISOString(),
          retriedAnswer: retry?.value ?? null,
          retriedAnsweredAt: retry?.answeredAt.toISOString() ?? null,
        });
      }),
    ),
    correctiveAction:
      correctiveAction === null
        ? null
        : Object.freeze({
            questionId: correctiveAction.questionId,
            action: correctiveAction.action,
            selectedAt: correctiveAction.selectedAt.toISOString(),
            completedAt: correctiveAction.completedAt?.toISOString() ?? null,
            capturedThought: correctiveAction.capturedThought,
          }),
    startedAt: sleepCheck.startedAt?.toISOString() ?? null,
    completedAt: sleepCheck.completedAt?.toISOString() ?? null,
    createdAt: sleepCheck.createdAt.toISOString(),
    updatedAt: sleepCheck.updatedAt.toISOString(),
  });
}

function elapsedMs(startedAt: Date | null, completedAt: Date | null): number | null {
  if (startedAt === null || completedAt === null) return null;
  return Math.max(0, completedAt.getTime() - startedAt.getTime());
}

function emptyResolutionCounts(): {
  COMPLETE: number;
  CARRY_FORWARD: number;
  REVISE: number;
  DROP: number;
} {
  // In E3, REVISE opens the entity editor and is deliberately not persisted as
  // a final OpenLoopResolution. Keeping the bucket explicit makes the read-model
  // stable without inventing a second source of evening events.
  return {
    [OPEN_LOOP_RESOLUTION.complete]: 0,
    [OPEN_LOOP_RESOLUTION.carryForward]: 0,
    [OPEN_LOOP_RESOLUTION.revise]: 0,
    [OPEN_LOOP_RESOLUTION.drop]: 0,
  };
}

function isWithinRange(value: DayDate, startDate: DayDate, endDate: DayDate): boolean {
  return !value.isBefore(startDate) && !value.isAfter(endDate);
}

function inclusiveDayCount(startDate: DayDate, endDate: DayDate): number {
  if (startDate.isAfter(endDate)) {
    throw new DomainError(
      'evening_history.invalid_date_range',
      'Начальная дата истории вечерних циклов не может быть позже конечной.',
    );
  }
  return (
    Math.floor((toUtcDate(endDate).getTime() - toUtcDate(startDate).getTime()) / 86_400_000) + 1
  );
}

function shiftDayDate(value: DayDate, days: number): DayDate {
  const date = toUtcDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return DayDate.fromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function toUtcDate(value: DayDate): Date {
  const [year, month, day] = value.toString().split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}
