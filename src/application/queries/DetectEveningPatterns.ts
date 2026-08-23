import {
  EVENING_CYCLE_MODE,
  EVENING_CYCLE_STATE,
  EVENING_MODE_REASON,
  REFLECTION_SIGNAL_TYPE,
  TOMORROW_PLAN_STATUS,
} from '../../domain';
import {
  EVENING_HISTORY_PREPARATION_STATE,
  type EveningHistoryItem,
  type EveningHistoryRange,
  type EveningHistoryResult,
  type GetEveningHistory,
  type ResolvedEveningHistoryRange,
} from './GetEveningHistory';
import { summarizeEveningHistory, type EveningHistorySummary } from './GetEveningHistorySummary';

export const EVENING_PATTERN_TYPE = {
  repeatedCarryForward: 'REPEATED_CARRY_FORWARD',
  repeatedScopeTooLarge: 'REPEATED_SCOPE_TOO_LARGE',
  repeatedUnclearNextStep: 'REPEATED_UNCLEAR_NEXT_STEP',
  repeatedTimeInsufficient: 'REPEATED_TIME_INSUFFICIENT',
  missingFirstAction: 'MISSING_FIRST_ACTION',
  frequentQuickMode: 'FREQUENT_QUICK_MODE',
  frequentLateCompletion: 'FREQUENT_LATE_COMPLETION',
  unfinishedEvenings: 'UNFINISHED_EVENINGS',
  skippedReflection: 'SKIPPED_REFLECTION',
  insufficientPreparation: 'INSUFFICIENT_PREPARATION',
} as const;

export type EveningPatternType = (typeof EVENING_PATTERN_TYPE)[keyof typeof EVENING_PATTERN_TYPE];

export const EVENING_PATTERN_SEVERITY = {
  low: 'LOW',
  medium: 'MEDIUM',
  high: 'HIGH',
} as const;

export type EveningPatternSeverity =
  (typeof EVENING_PATTERN_SEVERITY)[keyof typeof EVENING_PATTERN_SEVERITY];

export interface EveningPatternSourceEntity {
  readonly entityType: string;
  readonly entityId: string;
}

export interface EveningPatternRange {
  readonly startDate: string;
  readonly endDate: string;
  readonly dayCount: number;
}

export interface EveningPattern {
  readonly id: string;
  readonly type: EveningPatternType;
  readonly title: string;
  readonly severity: EveningPatternSeverity;
  readonly severityLabel: string;
  readonly confidence: number;
  readonly occurrences: number;
  readonly range: EveningPatternRange;
  readonly sourceEntityIds: readonly string[];
  readonly sourceEntities: readonly EveningPatternSourceEntity[];
  readonly supportingDayIds: readonly string[];
  readonly metrics: Readonly<Record<string, number>>;
}

export interface EveningPatternDetectionResult {
  readonly analysisRange: ResolvedEveningHistoryRange;
  readonly patterns: readonly EveningPattern[];
}

interface PatternEvidence {
  readonly dateKey: string;
  readonly dayId: string;
}

interface PatternDraft {
  readonly type: EveningPatternType;
  readonly evidence: readonly PatternEvidence[];
  readonly sources?: readonly EveningPatternSourceEntity[];
  readonly metrics: Readonly<Record<string, number>>;
  readonly identity?: string;
}

const MIN_OCCURRENCES = 2;

const TITLE_BY_TYPE: Readonly<Record<EveningPatternType, string>> = Object.freeze({
  [EVENING_PATTERN_TYPE.repeatedCarryForward]: 'Повторный перенос одного объекта',
  [EVENING_PATTERN_TYPE.repeatedScopeTooLarge]: 'Регулярно слишком большой объём',
  [EVENING_PATTERN_TYPE.repeatedUnclearNextStep]: 'Регулярно неясен следующий шаг',
  [EVENING_PATTERN_TYPE.repeatedTimeInsufficient]: 'Регулярно не хватает времени',
  [EVENING_PATTERN_TYPE.missingFirstAction]: 'План на завтра без первого шага',
  [EVENING_PATTERN_TYPE.frequentQuickMode]: 'Частое быстрое завершение вечера',
  [EVENING_PATTERN_TYPE.frequentLateCompletion]: 'Частое позднее завершение вечера',
  [EVENING_PATTERN_TYPE.unfinishedEvenings]: 'Вечерние циклы остаются незавершёнными',
  [EVENING_PATTERN_TYPE.skippedReflection]: 'Осмысление дня регулярно пропускается',
  [EVENING_PATTERN_TYPE.insufficientPreparation]: 'Подготовка к следующему дню недостаточна',
});

export class DetectEveningPatterns {
  public constructor(private readonly history: Pick<GetEveningHistory, 'execute'>) {}

  public async execute(range: EveningHistoryRange): Promise<EveningPatternDetectionResult> {
    const history = await this.history.execute(range);
    return detectEveningPatterns(history, summarizeEveningHistory(history));
  }
}

export function detectEveningPatterns(
  history: EveningHistoryResult,
  summary: EveningHistorySummary,
): EveningPatternDetectionResult {
  const drafts: PatternDraft[] = [
    ...detectRepeatedCarryForward(history.items, summary.cycleCount),
    ...detectRepeatedReasons(history.items, summary.cycleCount),
  ];

  const firstActionEligible = history.items.filter(
    (item) =>
      item.mode === EVENING_CYCLE_MODE.emergency &&
      item.hasTomorrowPlan &&
      item.tomorrowPlanStatus === TOMORROW_PLAN_STATUS.completed,
  );
  addFrequencyPattern(
    drafts,
    EVENING_PATTERN_TYPE.missingFirstAction,
    firstActionEligible.filter((item) => !item.hasFirstAction),
    Math.max(1, firstActionEligible.length),
    0.4,
  );
  addFrequencyPattern(
    drafts,
    EVENING_PATTERN_TYPE.frequentQuickMode,
    history.items.filter((item) => item.mode === EVENING_CYCLE_MODE.quick),
    Math.max(1, summary.cycleCount),
    0.35,
    { summaryOccurrences: summary.modeCounts.QUICK },
  );
  addFrequencyPattern(
    drafts,
    EVENING_PATTERN_TYPE.frequentLateCompletion,
    history.items.filter(
      (item) =>
        item.mode === EVENING_CYCLE_MODE.emergency ||
        item.modeReason === EVENING_MODE_REASON.lateNight,
    ),
    Math.max(1, summary.cycleCount),
    0.3,
    { emergencyCount: summary.modeCounts.EMERGENCY },
  );
  addFrequencyPattern(
    drafts,
    EVENING_PATTERN_TYPE.unfinishedEvenings,
    history.items.filter(
      (item) => item.state !== EVENING_CYCLE_STATE.completed && item.startedAt !== null,
    ),
    Math.max(1, summary.cycleCount),
    0.25,
    { summaryOccurrences: summary.unfinishedCount },
  );

  const reflectionEligible = history.items.filter(
    (item) => item.mode === EVENING_CYCLE_MODE.quick || item.mode === EVENING_CYCLE_MODE.emergency,
  );
  addFrequencyPattern(
    drafts,
    EVENING_PATTERN_TYPE.skippedReflection,
    reflectionEligible.filter((item) =>
      item.skippedStages.some((stage) => stage.stage === EVENING_CYCLE_STATE.reflecting),
    ),
    Math.max(1, reflectionEligible.length),
    0.4,
  );

  const preparationEligible = history.items.filter(
    (item) => item.preparationState !== EVENING_HISTORY_PREPARATION_STATE.notCreated,
  );
  const weakPreparation = preparationEligible.filter(
    (item) =>
      item.preparationItems.requiredSkipped > 0 ||
      item.preparationItems.requiredPending > 0 ||
      item.preparationItems.total <= 1,
  );
  addFrequencyPattern(
    drafts,
    EVENING_PATTERN_TYPE.insufficientPreparation,
    weakPreparation,
    Math.max(1, preparationEligible.length),
    0.4,
    {
      requiredSkippedCount: weakPreparation.reduce(
        (sum, item) => sum + item.preparationItems.requiredSkipped,
        0,
      ),
      requiredPendingCount: weakPreparation.reduce(
        (sum, item) => sum + item.preparationItems.requiredPending,
        0,
      ),
      minimalPreparationCount: weakPreparation.filter((item) => item.preparationItems.total <= 1)
        .length,
    },
  );

  const patterns = drafts
    .map(toPattern)
    .sort(
      (left, right) =>
        severityRank(right.severity) - severityRank(left.severity) ||
        left.type.localeCompare(right.type) ||
        left.id.localeCompare(right.id),
    );

  return Object.freeze({
    analysisRange: history.range,
    patterns: Object.freeze(patterns),
  });
}

function detectRepeatedCarryForward(
  items: readonly EveningHistoryItem[],
  sampleSize: number,
): readonly PatternDraft[] {
  const byEntity = new Map<
    string,
    { readonly source: EveningPatternSourceEntity; readonly evidence: PatternEvidence[] }
  >();

  for (const item of items) {
    for (const reason of item.resolutions) {
      if (reason.resolution !== 'CARRY_FORWARD') continue;
      const key = `${reason.entityType}:${reason.entityId}`;
      const group = byEntity.get(key) ?? {
        source: { entityType: reason.entityType, entityId: reason.entityId },
        evidence: [],
      };
      if (!group.evidence.some((entry) => entry.dateKey === item.dateKey)) {
        group.evidence.push(toEvidence(item));
      }
      byEntity.set(key, group);
    }
  }

  const drafts: PatternDraft[] = [];
  for (const [identity, group] of byEntity) {
    const consecutive = consecutiveEvidence(group.evidence);
    if (consecutive.length < MIN_OCCURRENCES) continue;
    drafts.push({
      type: EVENING_PATTERN_TYPE.repeatedCarryForward,
      evidence: consecutive,
      sources: [group.source],
      identity,
      metrics: {
        sampleSize,
        consecutiveCarryCount: consecutive.length,
        occurrenceRate: ratio(consecutive.length, sampleSize),
        minimumOccurrences: MIN_OCCURRENCES,
      },
    });
  }
  return drafts;
}

function detectRepeatedReasons(
  items: readonly EveningHistoryItem[],
  sampleSize: number,
): readonly PatternDraft[] {
  const definitions: readonly {
    readonly type: EveningPatternType;
    readonly acceptedValues: ReadonlySet<string>;
  }[] = [
    {
      type: EVENING_PATTERN_TYPE.repeatedScopeTooLarge,
      acceptedValues: new Set([REFLECTION_SIGNAL_TYPE.scopeTooLarge, 'TOO_LARGE']),
    },
    {
      type: EVENING_PATTERN_TYPE.repeatedUnclearNextStep,
      acceptedValues: new Set(['UNCLEAR_NEXT_STEP', REFLECTION_SIGNAL_TYPE.nextStepUnclear]),
    },
    {
      type: EVENING_PATTERN_TYPE.repeatedTimeInsufficient,
      acceptedValues: new Set([REFLECTION_SIGNAL_TYPE.timeInsufficient, 'INSUFFICIENT_TIME']),
    },
  ];

  return definitions.flatMap((definition) => {
    const matchingItems = items.filter((item) => itemHasReason(item, definition.acceptedValues));
    const evidence = uniqueEvidence(matchingItems.map(toEvidence));
    if (evidence.length < MIN_OCCURRENCES) return [];
    const sourceEntityIds = new Set<string>();
    for (const item of matchingItems) {
      for (const signal of item.signals) {
        if (definition.acceptedValues.has(signal.type)) {
          sourceEntityIds.add(signal.sourceEntityId);
        }
      }
    }
    return [
      {
        type: definition.type,
        evidence,
        sources: [...sourceEntityIds].sort().map((entityId) => ({
          entityType: 'REFLECTION_SOURCE',
          entityId,
        })),
        metrics: {
          sampleSize,
          occurrenceRate: ratio(evidence.length, sampleSize),
          minimumOccurrences: MIN_OCCURRENCES,
        },
      },
    ];
  });
}

function itemHasReason(item: EveningHistoryItem, acceptedValues: ReadonlySet<string>): boolean {
  if (item.signals.some((signal) => acceptedValues.has(signal.type))) return true;
  return item.reflectionAnswers.some((answer) => {
    const values = Array.isArray(answer.answer) ? answer.answer : [answer.answer];
    return values.some((value) => acceptedValues.has(value.trim().toUpperCase()));
  });
}

function addFrequencyPattern(
  drafts: PatternDraft[],
  type: EveningPatternType,
  items: readonly EveningHistoryItem[],
  sampleSize: number,
  minimumRate: number,
  additionalMetrics: Readonly<Record<string, number>> = {},
): void {
  const evidence = uniqueEvidence(items.map(toEvidence));
  const occurrenceRate = ratio(evidence.length, sampleSize);
  if (evidence.length < MIN_OCCURRENCES || occurrenceRate < minimumRate) return;
  drafts.push({
    type,
    evidence,
    metrics: {
      sampleSize,
      occurrenceRate,
      minimumRate,
      minimumOccurrences: MIN_OCCURRENCES,
      ...additionalMetrics,
    },
  });
}

function toPattern(draft: PatternDraft): EveningPattern {
  const evidence = uniqueEvidence(draft.evidence);
  const sources = uniqueSources(draft.sources ?? []);
  const occurrenceRate = draft.metrics.occurrenceRate ?? 0;
  const severity = calculateSeverity(evidence.length, occurrenceRate);
  const range = evidenceRange(evidence);
  const identity = [
    draft.type,
    draft.identity ?? '',
    range.startDate,
    range.endDate,
    ...sources.map((source) => `${source.entityType}:${source.entityId}`),
  ].join('|');

  return Object.freeze({
    id: `evening-pattern-${stableHash(identity)}`,
    type: draft.type,
    title: TITLE_BY_TYPE[draft.type],
    severity,
    severityLabel: severityLabel(severity),
    confidence: calculateConfidence(evidence.length, occurrenceRate),
    occurrences: evidence.length,
    range,
    sourceEntityIds: Object.freeze(sources.map((source) => source.entityId)),
    sourceEntities: Object.freeze(sources),
    supportingDayIds: Object.freeze(evidence.map((entry) => entry.dayId)),
    metrics: Object.freeze({ ...draft.metrics }),
  });
}

function consecutiveEvidence(evidence: readonly PatternEvidence[]): readonly PatternEvidence[] {
  const sorted = uniqueEvidence(evidence);
  const qualifying: PatternEvidence[] = [];
  let run: PatternEvidence[] = [];
  for (const entry of sorted) {
    const previous = run.at(-1);
    if (previous === undefined || dayDifference(previous.dateKey, entry.dateKey) === 1) {
      run.push(entry);
      continue;
    }
    if (run.length >= MIN_OCCURRENCES) qualifying.push(...run);
    run = [entry];
  }
  if (run.length >= MIN_OCCURRENCES) qualifying.push(...run);
  return uniqueEvidence(qualifying);
}

function uniqueEvidence(evidence: readonly PatternEvidence[]): readonly PatternEvidence[] {
  const byDate = new Map<string, PatternEvidence>();
  for (const entry of evidence) {
    if (!byDate.has(entry.dateKey)) byDate.set(entry.dateKey, entry);
  }
  return [...byDate.values()].sort((left, right) => left.dateKey.localeCompare(right.dateKey));
}

function uniqueSources(
  sources: readonly EveningPatternSourceEntity[],
): readonly EveningPatternSourceEntity[] {
  const byKey = new Map<string, EveningPatternSourceEntity>();
  for (const source of sources) {
    byKey.set(`${source.entityType}:${source.entityId}`, Object.freeze({ ...source }));
  }
  return [...byKey.values()].sort(
    (left, right) =>
      left.entityType.localeCompare(right.entityType) ||
      left.entityId.localeCompare(right.entityId),
  );
}

function toEvidence(item: EveningHistoryItem): PatternEvidence {
  return Object.freeze({ dateKey: item.dateKey, dayId: item.dayId });
}

function evidenceRange(evidence: readonly PatternEvidence[]): EveningPatternRange {
  const first = evidence[0]!;
  const last = evidence.at(-1)!;
  return Object.freeze({
    startDate: first.dateKey,
    endDate: last.dateKey,
    dayCount: dayDifference(first.dateKey, last.dateKey) + 1,
  });
}

function calculateSeverity(occurrences: number, occurrenceRate: number): EveningPatternSeverity {
  if (occurrences >= 5 || (occurrences >= 3 && occurrenceRate >= 0.6)) {
    return EVENING_PATTERN_SEVERITY.high;
  }
  if (occurrences >= 3 || occurrenceRate >= 0.5) return EVENING_PATTERN_SEVERITY.medium;
  return EVENING_PATTERN_SEVERITY.low;
}

function calculateConfidence(occurrences: number, occurrenceRate: number): number {
  return round(Math.min(0.95, 0.45 + occurrences * 0.1 + Math.min(1, occurrenceRate) * 0.25));
}

function severityLabel(severity: EveningPatternSeverity): string {
  if (severity === EVENING_PATTERN_SEVERITY.high) return 'Высокая';
  if (severity === EVENING_PATTERN_SEVERITY.medium) return 'Средняя';
  return 'Низкая';
}

function severityRank(severity: EveningPatternSeverity): number {
  if (severity === EVENING_PATTERN_SEVERITY.high) return 3;
  if (severity === EVENING_PATTERN_SEVERITY.medium) return 2;
  return 1;
}

function ratio(count: number, sampleSize: number): number {
  return round(count / Math.max(1, sampleSize));
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function dayDifference(startDate: string, endDate: string): number {
  return Math.round(
    (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000,
  );
}

function stableHash(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}
