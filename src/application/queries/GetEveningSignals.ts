import {
  EVENING_PATTERN_SEVERITY,
  EVENING_PATTERN_TYPE,
  type DetectEveningPatterns,
  type EveningPattern,
  type EveningPatternRange,
  type EveningPatternSeverity,
  type EveningPatternType,
} from './DetectEveningPatterns';
import type { EveningHistoryRange, ResolvedEveningHistoryRange } from './GetEveningHistory';

export const EVENING_SIGNAL_SEVERITY = {
  info: 'INFO',
  attention: 'ATTENTION',
  important: 'IMPORTANT',
} as const;

export type EveningSignalSeverity =
  (typeof EVENING_SIGNAL_SEVERITY)[keyof typeof EVENING_SIGNAL_SEVERITY];

export interface EveningSignalEvidence {
  readonly occurrences: number;
  readonly range: EveningPatternRange;
  readonly occurrenceRate: number | null;
  readonly metrics: Readonly<Record<string, number>>;
}

export interface EveningSignal {
  readonly id: string;
  readonly type: EveningPatternType;
  readonly severity: EveningSignalSeverity;
  readonly title: string;
  readonly summary: string;
  readonly evidence: EveningSignalEvidence;
  readonly sourcePatternIds: readonly string[];
  readonly sourceEntityIds: readonly string[];
  readonly supportingDayIds: readonly string[];
  readonly firstDetectedAt: string;
  readonly lastDetectedAt: string;
}

export interface EveningSignalsResult {
  readonly analysisRange: ResolvedEveningHistoryRange;
  readonly signals: readonly EveningSignal[];
}

interface SignalCopy {
  readonly title: string;
  readonly evidencePhrase: string;
}

interface PatternGroup {
  readonly key: string;
  readonly patterns: EveningPattern[];
}

interface RankedSignal {
  readonly signal: EveningSignal;
  readonly priorityTier: number;
}

const COPY_BY_TYPE: Readonly<Record<EveningPatternType, SignalCopy>> = Object.freeze({
  [EVENING_PATTERN_TYPE.repeatedCarryForward]: {
    title: 'Решение переносится несколько дней',
    evidencePhrase: 'это Решение переносилось',
  },
  [EVENING_PATTERN_TYPE.repeatedScopeTooLarge]: {
    title: 'Запланированный объём регулярно оказывается слишком большим',
    evidencePhrase: 'слишком большой запланированный объём отмечался',
  },
  [EVENING_PATTERN_TYPE.repeatedUnclearNextStep]: {
    title: 'Следующий шаг часто остаётся неясным',
    evidencePhrase: 'неясный следующий шаг отмечался',
  },
  [EVENING_PATTERN_TYPE.repeatedTimeInsufficient]: {
    title: 'План регулярно не помещается в доступное время',
    evidencePhrase: 'недостаток доступного времени отмечался',
  },
  [EVENING_PATTERN_TYPE.missingFirstAction]: {
    title: 'На завтра часто не определяется конкретный первый шаг',
    evidencePhrase: 'конкретный первый шаг на завтра отсутствовал',
  },
  [EVENING_PATTERN_TYPE.frequentQuickMode]: {
    title: 'Быстрый режим используется часто',
    evidencePhrase: 'быстрый режим использовался',
  },
  [EVENING_PATTERN_TYPE.frequentLateCompletion]: {
    title: 'День регулярно закрывается в позднем режиме',
    evidencePhrase: 'поздний режим завершения использовался',
  },
  [EVENING_PATTERN_TYPE.unfinishedEvenings]: {
    title: 'Вечерние циклы часто остаются незавершёнными',
    evidencePhrase: 'вечерний цикл начинался, но не завершался',
  },
  [EVENING_PATTERN_TYPE.skippedReflection]: {
    title: 'Осмысление регулярно пропускается',
    evidencePhrase: 'осмысление дня было пропущено',
  },
  [EVENING_PATTERN_TYPE.insufficientPreparation]: {
    title: 'Подготовка к завтра регулярно остаётся неполной',
    evidencePhrase: 'подготовка к завтра оставалась неполной',
  },
  [EVENING_PATTERN_TYPE.repeatedEnvironmentItemSkip]: {
    title: 'Один пункт подготовки часто пропускается',
    evidencePhrase: 'пункт был осознанно пропущен',
  },
  [EVENING_PATTERN_TYPE.relaxationPracticeCalmImprovement]: {
    title: 'После выбранной практики средняя оценка спокойствия была выше',
    evidencePhrase: 'наблюдалась более высокая оценка спокойствия',
  },
});

const STRUCTURAL_TYPES: ReadonlySet<EveningPatternType> = new Set([
  EVENING_PATTERN_TYPE.repeatedCarryForward,
  EVENING_PATTERN_TYPE.repeatedScopeTooLarge,
  EVENING_PATTERN_TYPE.repeatedUnclearNextStep,
  EVENING_PATTERN_TYPE.repeatedTimeInsufficient,
  EVENING_PATTERN_TYPE.missingFirstAction,
]);

const TYPE_ORDER: Readonly<Record<EveningPatternType, number>> = Object.freeze({
  [EVENING_PATTERN_TYPE.repeatedCarryForward]: 0,
  [EVENING_PATTERN_TYPE.repeatedScopeTooLarge]: 1,
  [EVENING_PATTERN_TYPE.repeatedUnclearNextStep]: 2,
  [EVENING_PATTERN_TYPE.repeatedTimeInsufficient]: 3,
  [EVENING_PATTERN_TYPE.missingFirstAction]: 4,
  [EVENING_PATTERN_TYPE.unfinishedEvenings]: 5,
  [EVENING_PATTERN_TYPE.insufficientPreparation]: 6,
  [EVENING_PATTERN_TYPE.skippedReflection]: 7,
  [EVENING_PATTERN_TYPE.frequentLateCompletion]: 8,
  [EVENING_PATTERN_TYPE.frequentQuickMode]: 9,
  [EVENING_PATTERN_TYPE.repeatedEnvironmentItemSkip]: 10,
  [EVENING_PATTERN_TYPE.relaxationPracticeCalmImprovement]: 11,
});

export class GetEveningSignals {
  public constructor(private readonly patterns: Pick<DetectEveningPatterns, 'execute'>) {}

  public async execute(range: EveningHistoryRange): Promise<EveningSignalsResult> {
    const detected = await this.patterns.execute(range);
    return Object.freeze({
      analysisRange: detected.analysisRange,
      signals: getEveningSignals(detected.patterns),
    });
  }
}

export function getEveningSignals(patterns: readonly EveningPattern[]): readonly EveningSignal[] {
  const groups = groupPatterns(patterns);
  const signals = groups
    .map((group): RankedSignal => {
      const signal = toSignal(group);
      return { signal, priorityTier: priorityTier(group.patterns, signal) };
    })
    .sort(compareSignals)
    .map((ranked) => ranked.signal);
  return Object.freeze(signals);
}

function groupPatterns(patterns: readonly EveningPattern[]): readonly PatternGroup[] {
  const byKey = new Map<string, PatternGroup>();
  for (const pattern of patterns) {
    const key = deduplicationKey(pattern);
    const group = byKey.get(key) ?? { key, patterns: [] };
    group.patterns.push(pattern);
    byKey.set(key, group);
  }
  return [...byKey.values()].sort((left, right) => left.key.localeCompare(right.key));
}

function deduplicationKey(pattern: EveningPattern): string {
  if (
    pattern.type !== EVENING_PATTERN_TYPE.repeatedCarryForward &&
    pattern.type !== EVENING_PATTERN_TYPE.repeatedEnvironmentItemSkip &&
    pattern.type !== EVENING_PATTERN_TYPE.relaxationPracticeCalmImprovement
  ) {
    return pattern.type;
  }
  const sources =
    pattern.sourceEntities.length > 0
      ? pattern.sourceEntities.map((source) => `${source.entityType}:${source.entityId}`).sort()
      : pattern.sourceEntityIds.map((entityId) => `UNKNOWN:${entityId}`).sort();
  return `${pattern.type}|${sources.join('|')}`;
}

function toSignal(group: PatternGroup): EveningSignal {
  const patterns = [...group.patterns].sort((left, right) => left.id.localeCompare(right.id));
  const type = patterns[0]!.type;
  const sourcePatternIds = uniqueSorted(patterns.map((pattern) => pattern.id));
  const sourceEntityIds = uniqueSorted(patterns.flatMap((pattern) => pattern.sourceEntityIds));
  const supportingDayIds = uniqueSorted(patterns.flatMap((pattern) => pattern.supportingDayIds));
  const range = mergedRange(patterns);
  const occurrences = Math.max(
    supportingDayIds.length,
    ...patterns.map((pattern) => pattern.occurrences),
  );
  const severity = signalSeverity(patterns);
  const occurrenceRate = maximumOccurrenceRate(patterns);
  const copy = COPY_BY_TYPE[type];
  const metrics = Object.freeze({ ...patterns.at(-1)!.metrics });
  const sourceLabel =
    patterns.find((pattern) => pattern.sourceLabel !== null)?.sourceLabel ??
    sourceEntityIds[0] ??
    '';
  const title =
    type === EVENING_PATTERN_TYPE.repeatedEnvironmentItemSkip
      ? `Пункт «${sourceLabel}» часто пропускается`
      : type === EVENING_PATTERN_TYPE.relaxationPracticeCalmImprovement
        ? `После практики «${sourceLabel}» средняя оценка спокойствия была выше`
        : copy.title;
  const summary =
    type === EVENING_PATTERN_TYPE.relaxationPracticeCalmImprovement
      ? `В ${occurrences} парных наблюдениях средняя оценка спокойствия после практики была выше на ${metrics.averageCalmDelta}.`
      : `За ${range.dayCount} ${dayWord(range.dayCount)} ${copy.evidencePhrase} ${occurrences} ${timeWord(occurrences)}.`;

  return Object.freeze({
    id: `evening-signal-${stableHash(group.key)}`,
    type,
    severity,
    title,
    summary,
    evidence: Object.freeze({ occurrences, range, occurrenceRate, metrics }),
    sourcePatternIds: Object.freeze(sourcePatternIds),
    sourceEntityIds: Object.freeze(sourceEntityIds),
    supportingDayIds: Object.freeze(supportingDayIds),
    firstDetectedAt: range.startDate,
    lastDetectedAt: range.endDate,
  });
}

function mergedRange(patterns: readonly EveningPattern[]): EveningPatternRange {
  const startDate = patterns
    .map((pattern) => pattern.range.startDate)
    .sort((left, right) => left.localeCompare(right))[0]!;
  const endDate = patterns
    .map((pattern) => pattern.range.endDate)
    .sort((left, right) => right.localeCompare(left))[0]!;
  return Object.freeze({
    startDate,
    endDate,
    dayCount: dayDifference(startDate, endDate) + 1,
  });
}

function signalSeverity(patterns: readonly EveningPattern[]): EveningSignalSeverity {
  const severity = patterns.reduce<EveningPatternSeverity>(
    (highest, pattern) =>
      patternSeverityRank(pattern.severity) > patternSeverityRank(highest)
        ? pattern.severity
        : highest,
    EVENING_PATTERN_SEVERITY.low,
  );
  if (severity === EVENING_PATTERN_SEVERITY.high) return EVENING_SIGNAL_SEVERITY.important;
  if (severity === EVENING_PATTERN_SEVERITY.medium) return EVENING_SIGNAL_SEVERITY.attention;
  return EVENING_SIGNAL_SEVERITY.info;
}

function maximumOccurrenceRate(patterns: readonly EveningPattern[]): number | null {
  const rates = patterns
    .map((pattern) => pattern.metrics.occurrenceRate)
    .filter((value): value is number => typeof value === 'number');
  return rates.length === 0 ? null : Math.max(...rates);
}

function compareSignals(left: RankedSignal, right: RankedSignal): number {
  return (
    left.priorityTier - right.priorityTier ||
    signalSeverityRank(right.signal.severity) - signalSeverityRank(left.signal.severity) ||
    right.signal.evidence.occurrences - left.signal.evidence.occurrences ||
    TYPE_ORDER[left.signal.type] - TYPE_ORDER[right.signal.type] ||
    left.signal.id.localeCompare(right.signal.id)
  );
}

function priorityTier(patterns: readonly EveningPattern[], signal: EveningSignal): number {
  if (
    signal.type === EVENING_PATTERN_TYPE.repeatedCarryForward &&
    patterns.some((pattern) =>
      pattern.sourceEntities.some(
        (source) => source.entityType.trim().toUpperCase() === 'DECISION',
      ),
    )
  ) {
    return 0;
  }
  if (STRUCTURAL_TYPES.has(signal.type)) return 1;
  if (signal.severity === EVENING_SIGNAL_SEVERITY.info) return 3;
  return 2;
}

function patternSeverityRank(severity: EveningPatternSeverity): number {
  if (severity === EVENING_PATTERN_SEVERITY.high) return 3;
  if (severity === EVENING_PATTERN_SEVERITY.medium) return 2;
  return 1;
}

function signalSeverityRank(severity: EveningSignalSeverity): number {
  if (severity === EVENING_SIGNAL_SEVERITY.important) return 3;
  if (severity === EVENING_SIGNAL_SEVERITY.attention) return 2;
  return 1;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function dayWord(count: number): string {
  const modulo100 = count % 100;
  if (modulo100 >= 11 && modulo100 <= 14) return 'дней';
  const modulo10 = count % 10;
  if (modulo10 === 1) return 'день';
  if (modulo10 >= 2 && modulo10 <= 4) return 'дня';
  return 'дней';
}

function timeWord(count: number): string {
  const modulo100 = count % 100;
  if (modulo100 >= 11 && modulo100 <= 14) return 'раз';
  const modulo10 = count % 10;
  if (modulo10 === 1) return 'раз';
  if (modulo10 >= 2 && modulo10 <= 4) return 'раза';
  return 'раз';
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
