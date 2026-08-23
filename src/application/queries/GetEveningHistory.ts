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
  type PreparationPlan,
  type PreparationPlanStatus,
  type ReflectionDaySignal,
  type ReflectionQuestionKind,
  type ReflectionSignalType,
  type TomorrowPlan,
  type TomorrowPlanStatus,
  type TomorrowPlanningQuality,
} from '../../domain';
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
  readonly answer: string | readonly string[];
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
