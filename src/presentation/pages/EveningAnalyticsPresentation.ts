import {
  EVENING_HISTORY_RANGE_KIND,
  RECOMMENDATION_PREVIEW_KIND,
  type ApplyRecommendationInput,
  type EveningHistoryResult,
  type EveningHistorySummary,
  type EveningHistoryRange,
  type EveningRecommendationPreview,
} from '../../application';
import { EVENING_CYCLE_COMPLETION, type DayDate } from '../../domain';

export type EveningAnalyticsRangeDays = 7 | 30;

export interface EveningTrendBucket {
  readonly key: string;
  readonly label: string;
  readonly cycleCount: number;
  readonly completedCount: number;
  readonly completionPercent: number;
  readonly carryForwardCount: number;
  readonly carryForwardPercent: number;
}

export interface EveningTrendSegment {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  readonly percent: number;
  readonly tone: 'positive' | 'accent' | 'muted';
}

export interface EveningTrendsPresentation {
  readonly periodLabel: 'По дням' | 'По неделям';
  readonly buckets: readonly EveningTrendBucket[];
  readonly completion: Readonly<{
    completedCount: number;
    cycleCount: number;
  }>;
  readonly carryForwardCount: number;
  readonly preparation: Readonly<{
    completedCount: number;
    planCount: number;
    segments: readonly EveningTrendSegment[];
  }>;
  readonly modes: Readonly<{
    cycleCount: number;
    segments: readonly EveningTrendSegment[];
  }>;
  readonly firstAction: Readonly<{
    count: number;
    planCount: number;
    segments: readonly EveningTrendSegment[];
  }> | null;
}

export interface RecommendationDialogState {
  readonly preview: EveningRecommendationPreview;
  readonly targetOutcome: string;
  readonly selectedActionId: string;
  readonly firstActionTitle: string;
  readonly firstActionResult: string;
  readonly keptDecisionIds: readonly string[];
  readonly isSubmitting: boolean;
  readonly error: string | null;
}

export function createEveningAnalyticsRange(
  days: EveningAnalyticsRangeDays,
  endDate: DayDate,
): EveningHistoryRange {
  return {
    kind: days === 7 ? EVENING_HISTORY_RANGE_KIND.last7Days : EVENING_HISTORY_RANGE_KIND.last30Days,
    endDate,
  };
}

export function createEveningTrendsPresentation(
  history: EveningHistoryResult,
  summary: EveningHistorySummary,
): EveningTrendsPresentation {
  const bucketSize = history.range.dayCount <= 7 ? 1 : 7;
  const buckets = createTrendBuckets(history, bucketSize);
  const maxCarryForward = Math.max(1, ...buckets.map((bucket) => bucket.carryForwardCount));
  const scaledBuckets = buckets.map((bucket) =>
    Object.freeze({
      ...bucket,
      carryForwardPercent: Math.round((bucket.carryForwardCount / maxCarryForward) * 100),
    }),
  );
  const preparationPlanCount =
    summary.preparationCounts.NOT_CREATED +
    summary.preparationCounts.IN_PROGRESS +
    summary.preparationCounts.COMPLETED;
  const modeCount =
    summary.modeCounts.NORMAL + summary.modeCounts.QUICK + summary.modeCounts.EMERGENCY;

  return Object.freeze({
    periodLabel: bucketSize === 1 ? 'По дням' : 'По неделям',
    buckets: Object.freeze(scaledBuckets),
    completion: Object.freeze({
      completedCount: summary.completedCount,
      cycleCount: summary.cycleCount,
    }),
    carryForwardCount: summary.resolutionCounts.CARRY_FORWARD,
    preparation: Object.freeze({
      completedCount: summary.preparationCounts.COMPLETED,
      planCount: preparationPlanCount,
      segments: createSegments([
        {
          key: 'completed',
          label: 'Готово',
          count: summary.preparationCounts.COMPLETED,
          tone: 'positive',
        },
        {
          key: 'in-progress',
          label: 'В процессе',
          count: summary.preparationCounts.IN_PROGRESS,
          tone: 'accent',
        },
        {
          key: 'not-created',
          label: 'Не создано',
          count: summary.preparationCounts.NOT_CREATED,
          tone: 'muted',
        },
      ]),
    }),
    modes: Object.freeze({
      cycleCount: modeCount,
      segments: createSegments([
        {
          key: 'normal',
          label: 'NORMAL',
          count: summary.modeCounts.NORMAL,
          tone: 'positive',
        },
        {
          key: 'quick',
          label: 'QUICK',
          count: summary.modeCounts.QUICK,
          tone: 'accent',
        },
        {
          key: 'late',
          label: 'Поздний',
          count: summary.modeCounts.EMERGENCY,
          tone: 'muted',
        },
      ]),
    }),
    firstAction:
      summary.tomorrowPlanCount === 0
        ? null
        : Object.freeze({
            count: summary.firstActionCount,
            planCount: summary.tomorrowPlanCount,
            segments: createSegments([
              {
                key: 'present',
                label: 'Есть',
                count: summary.firstActionCount,
                tone: 'positive',
              },
              {
                key: 'missing',
                label: 'Не задан',
                count: Math.max(0, summary.tomorrowPlanCount - summary.firstActionCount),
                tone: 'muted',
              },
            ]),
          }),
  });
}

interface UnscaledEveningTrendBucket {
  readonly key: string;
  readonly label: string;
  readonly cycleCount: number;
  readonly completedCount: number;
  readonly completionPercent: number;
  readonly carryForwardCount: number;
}

function createTrendBuckets(
  history: EveningHistoryResult,
  bucketSize: number,
): readonly UnscaledEveningTrendBucket[] {
  const itemsByDate = new Map(history.items.map((item) => [item.dateKey, item]));
  const startDate = parseDateKey(history.range.startDate);
  const buckets: UnscaledEveningTrendBucket[] = [];

  for (let offset = 0; offset < history.range.dayCount; offset += bucketSize) {
    const bucketDayCount = Math.min(bucketSize, history.range.dayCount - offset);
    const dates = Array.from({ length: bucketDayCount }, (_, index) =>
      shiftDate(startDate, offset + index),
    );
    const items = dates
      .map((date) => itemsByDate.get(formatDateKey(date)))
      .filter((item) => item !== undefined);
    const completedCount = items.filter(
      (item) => item.completion === EVENING_CYCLE_COMPLETION.completed,
    ).length;
    const cycleCount = items.length;
    const carryForwardCount = items.reduce(
      (sum, item) => sum + item.resolutionCounts.CARRY_FORWARD,
      0,
    );

    buckets.push(
      Object.freeze({
        key: formatDateKey(dates[0]!),
        label:
          bucketSize === 1
            ? formatDailyBucketLabel(dates[0]!)
            : formatWeeklyBucketLabel(dates[0]!, dates[dates.length - 1]!),
        cycleCount,
        completedCount,
        completionPercent: cycleCount === 0 ? 0 : Math.round((completedCount / cycleCount) * 100),
        carryForwardCount,
      }),
    );
  }

  return Object.freeze(buckets);
}

function createSegments(
  values: readonly Omit<EveningTrendSegment, 'percent'>[],
): readonly EveningTrendSegment[] {
  const total = values.reduce((sum, value) => sum + value.count, 0);
  return Object.freeze(
    values.map((value) =>
      Object.freeze({
        ...value,
        percent: total === 0 ? 0 : (value.count / total) * 100,
      }),
    ),
  );
}

function parseDateKey(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

function shiftDate(value: Date, days: number): Date {
  const shifted = new Date(value.getTime());
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted;
}

function formatDateKey(value: Date): string {
  return [
    value.getUTCFullYear().toString().padStart(4, '0'),
    (value.getUTCMonth() + 1).toString().padStart(2, '0'),
    value.getUTCDate().toString().padStart(2, '0'),
  ].join('-');
}

function formatDailyBucketLabel(value: Date): string {
  const weekdays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] as const;
  return `${weekdays[value.getUTCDay()]} ${value.getUTCDate()}`;
}

function formatWeeklyBucketLabel(start: Date, end: Date): string {
  const startLabel = `${start.getUTCDate().toString().padStart(2, '0')}.${(start.getUTCMonth() + 1)
    .toString()
    .padStart(2, '0')}`;
  const endLabel = `${end.getUTCDate().toString().padStart(2, '0')}.${(end.getUTCMonth() + 1)
    .toString()
    .padStart(2, '0')}`;
  return `${startLabel}–${endLabel}`;
}

export function createRecommendationDialogState(
  preview: EveningRecommendationPreview,
): RecommendationDialogState {
  return {
    preview,
    targetOutcome:
      preview.kind === RECOMMENDATION_PREVIEW_KIND.targetOutcome
        ? (preview.proposedValue ?? preview.currentValue ?? '')
        : '',
    selectedActionId:
      preview.kind === RECOMMENDATION_PREVIEW_KIND.firstAction
        ? (preview.candidateActions[0]?.id ?? '')
        : '',
    firstActionTitle: '',
    firstActionResult: '',
    keptDecisionIds:
      preview.kind === RECOMMENDATION_PREVIEW_KIND.supportingDecisions
        ? preview.decisions.map((decision) => decision.id)
        : [],
    isSubmitting: false,
    error: null,
  };
}

export function recommendationInput(
  state: RecommendationDialogState,
): ApplyRecommendationInput | null {
  const preview = state.preview;
  if (preview.kind === RECOMMENDATION_PREVIEW_KIND.targetOutcome) {
    const targetOutcome = state.targetOutcome.trim();
    return targetOutcome.length === 0 ? null : { kind: 'SET_TARGET_OUTCOME', targetOutcome };
  }
  if (preview.kind === RECOMMENDATION_PREVIEW_KIND.firstAction) {
    if (preview.candidateActions.length > 0) {
      return state.selectedActionId.length === 0
        ? null
        : { kind: 'ASSIGN_FIRST_ACTION', actionId: state.selectedActionId };
    }
    const title = state.firstActionTitle.trim();
    const expectedResult = state.firstActionResult.trim();
    return title.length === 0 || expectedResult.length === 0
      ? null
      : { kind: 'CREATE_FIRST_ACTION', title, expectedResult };
  }
  if (preview.kind === RECOMMENDATION_PREVIEW_KIND.supportingDecisions) {
    return state.keptDecisionIds.length >= preview.decisions.length
      ? null
      : { kind: 'KEEP_SUPPORTING_DECISIONS', decisionIds: state.keptDecisionIds };
  }
  if (preview.kind === RECOMMENDATION_PREVIEW_KIND.resolved) return null;
  return { kind: 'ACKNOWLEDGE' };
}
