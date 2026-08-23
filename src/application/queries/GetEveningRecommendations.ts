import { EVENING_PATTERN_TYPE, type EveningPatternType } from './DetectEveningPatterns';
import {
  EVENING_SIGNAL_SEVERITY,
  type EveningSignal,
  type EveningSignalSeverity,
  type GetEveningSignals,
} from './GetEveningSignals';
import type { EveningHistoryRange, ResolvedEveningHistoryRange } from './GetEveningHistory';

export const EVENING_RECOMMENDATION_TYPE = {
  reviewRepeatedCarry: 'REVIEW_REPEATED_CARRY',
  reducePrimaryDecisionTarget: 'REDUCE_PRIMARY_DECISION_TARGET',
  reduceTomorrowLoad: 'REDUCE_TOMORROW_LOAD',
  defineFirstAction: 'DEFINE_FIRST_ACTION',
  makeFirstActionStandard: 'MAKE_FIRST_ACTION_STANDARD',
  reviewQuickFrequency: 'REVIEW_QUICK_FREQUENCY',
  startEveningEarlier: 'START_EVENING_EARLIER',
  useQuickMode: 'USE_QUICK_MODE',
  keepShortReflection: 'KEEP_SHORT_REFLECTION',
  simplifyPreparation: 'SIMPLIFY_PREPARATION',
} as const;

export type EveningRecommendationType =
  (typeof EVENING_RECOMMENDATION_TYPE)[keyof typeof EVENING_RECOMMENDATION_TYPE];

export const EVENING_RECOMMENDATION_PRIORITY = {
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
  info: 'INFO',
} as const;

export type EveningRecommendationPriority =
  (typeof EVENING_RECOMMENDATION_PRIORITY)[keyof typeof EVENING_RECOMMENDATION_PRIORITY];

export const EVENING_RECOMMENDATION_APPLICABILITY = {
  decision: 'DECISION',
  tomorrowPlan: 'TOMORROW_PLAN',
  eveningPlanning: 'EVENING_PLANNING',
  eveningCycle: 'EVENING_CYCLE',
  reflection: 'REFLECTION',
  preparationPlan: 'PREPARATION_PLAN',
} as const;

export type EveningRecommendationApplicability =
  (typeof EVENING_RECOMMENDATION_APPLICABILITY)[keyof typeof EVENING_RECOMMENDATION_APPLICABILITY];

export interface EveningRecommendationProposedAction {
  readonly description: string;
  readonly requiresUserConfirmation: true;
}

export interface EveningRecommendation {
  readonly id: string;
  readonly type: EveningRecommendationType;
  readonly priority: EveningRecommendationPriority;
  readonly title: string;
  readonly rationale: string;
  readonly proposedAction: EveningRecommendationProposedAction;
  readonly sourceSignalIds: readonly string[];
  readonly targetEntityIds?: readonly string[];
  readonly applicability: EveningRecommendationApplicability;
}

export interface EveningRecommendationsResult {
  readonly analysisRange: ResolvedEveningHistoryRange;
  readonly recommendations: readonly EveningRecommendation[];
}

interface RecommendationDefinition {
  readonly type: EveningRecommendationType;
  readonly priority: EveningRecommendationPriority;
  readonly title: string;
  readonly action: string;
  readonly applicability: EveningRecommendationApplicability;
  readonly includeTargetEntityIds: boolean;
}

interface RecommendationCandidate {
  readonly recommendation: EveningRecommendation;
  readonly highestSignalSeverity: EveningSignalSeverity;
  readonly occurrences: number;
}

const MAX_ACTIVE_RECOMMENDATIONS = 3;

const RECOMMENDATION_ORDER: Readonly<Record<EveningRecommendationType, number>> = Object.freeze({
  [EVENING_RECOMMENDATION_TYPE.reviewRepeatedCarry]: 0,
  [EVENING_RECOMMENDATION_TYPE.reducePrimaryDecisionTarget]: 1,
  [EVENING_RECOMMENDATION_TYPE.reduceTomorrowLoad]: 2,
  [EVENING_RECOMMENDATION_TYPE.defineFirstAction]: 3,
  [EVENING_RECOMMENDATION_TYPE.makeFirstActionStandard]: 4,
  [EVENING_RECOMMENDATION_TYPE.useQuickMode]: 5,
  [EVENING_RECOMMENDATION_TYPE.simplifyPreparation]: 6,
  [EVENING_RECOMMENDATION_TYPE.keepShortReflection]: 7,
  [EVENING_RECOMMENDATION_TYPE.startEveningEarlier]: 8,
  [EVENING_RECOMMENDATION_TYPE.reviewQuickFrequency]: 9,
});

export class GetEveningRecommendations {
  public constructor(private readonly signals: Pick<GetEveningSignals, 'execute'>) {}

  public async execute(range: EveningHistoryRange): Promise<EveningRecommendationsResult> {
    const result = await this.signals.execute(range);
    return Object.freeze({
      analysisRange: result.analysisRange,
      recommendations: getEveningRecommendations(result.signals),
    });
  }
}

export function getEveningRecommendations(
  signals: readonly EveningSignal[],
): readonly EveningRecommendation[] {
  const byType = groupSignalsByType(signals);
  const candidates: RecommendationCandidate[] = [];

  for (const signal of byType.get(EVENING_PATTERN_TYPE.repeatedCarryForward) ?? []) {
    candidates.push(
      toCandidate([signal], {
        type: EVENING_RECOMMENDATION_TYPE.reviewRepeatedCarry,
        priority: EVENING_RECOMMENDATION_PRIORITY.high,
        title: 'Пересмотреть Решение перед очередным переносом',
        action:
          'Перед следующим переносом уменьшить объём Решения, определить препятствие или отказаться от Решения.',
        applicability: EVENING_RECOMMENDATION_APPLICABILITY.decision,
        includeTargetEntityIds: true,
      }),
    );
  }

  const scopeSignals = byType.get(EVENING_PATTERN_TYPE.repeatedScopeTooLarge) ?? [];
  const timeSignals = byType.get(EVENING_PATTERN_TYPE.repeatedTimeInsufficient) ?? [];
  const loadSignals = [...scopeSignals, ...timeSignals];
  if (loadSignals.length > 0) {
    candidates.push(
      toCandidate(
        loadSignals,
        scopeSignals.length > 0
          ? {
              type: EVENING_RECOMMENDATION_TYPE.reducePrimaryDecisionTarget,
              priority: EVENING_RECOMMENDATION_PRIORITY.high,
              title: 'Уменьшить Норму главного Решения',
              action: 'В TomorrowPlan уменьшить ожидаемый результат главного Решения на завтра.',
              applicability: EVENING_RECOMMENDATION_APPLICABILITY.tomorrowPlan,
              includeTargetEntityIds: true,
            }
          : {
              type: EVENING_RECOMMENDATION_TYPE.reduceTomorrowLoad,
              priority: EVENING_RECOMMENDATION_PRIORITY.medium,
              title: 'Сократить объём завтрашнего фокуса',
              action: 'В TomorrowPlan сократить объём главного Решения на завтра.',
              applicability: EVENING_RECOMMENDATION_APPLICABILITY.tomorrowPlan,
              includeTargetEntityIds: true,
            },
      ),
    );
  }

  const unclearSignals = byType.get(EVENING_PATTERN_TYPE.repeatedUnclearNextStep) ?? [];
  const missingSignals = byType.get(EVENING_PATTERN_TYPE.missingFirstAction) ?? [];
  const firstActionSignals = [...unclearSignals, ...missingSignals];
  if (firstActionSignals.length > 0) {
    candidates.push(
      toCandidate(
        firstActionSignals,
        unclearSignals.length > 0
          ? {
              type: EVENING_RECOMMENDATION_TYPE.defineFirstAction,
              priority: EVENING_RECOMMENDATION_PRIORITY.medium,
              title: 'Сформулировать конкретный первый шаг на завтра',
              action:
                'Записать в TomorrowPlan одно конкретное действие, с которого начнётся работа завтра.',
              applicability: EVENING_RECOMMENDATION_APPLICABILITY.tomorrowPlan,
              includeTargetEntityIds: true,
            }
          : {
              type: EVENING_RECOMMENDATION_TYPE.makeFirstActionStandard,
              priority: EVENING_RECOMMENDATION_PRIORITY.medium,
              title: 'Сделать первый шаг обязательной частью вечернего планирования',
              action:
                'Добавлять конкретный firstAction в TomorrowPlan при каждом вечернем планировании.',
              applicability: EVENING_RECOMMENDATION_APPLICABILITY.eveningPlanning,
              includeTargetEntityIds: false,
            },
      ),
    );
  }

  addSingleTypeCandidate(candidates, byType, EVENING_PATTERN_TYPE.frequentQuickMode, {
    type: EVENING_RECOMMENDATION_TYPE.reviewQuickFrequency,
    priority: EVENING_RECOMMENDATION_PRIORITY.info,
    title: 'Проверить, нужен ли полный вечерний сценарий каждый день',
    action:
      'Определить, в какие дни полный вечерний сценарий действительно нужен, а в какие достаточно QUICK.',
    applicability: EVENING_RECOMMENDATION_APPLICABILITY.eveningCycle,
    includeTargetEntityIds: false,
  });
  addSingleTypeCandidate(candidates, byType, EVENING_PATTERN_TYPE.frequentLateCompletion, {
    type: EVENING_RECOMMENDATION_TYPE.startEveningEarlier,
    priority: EVENING_RECOMMENDATION_PRIORITY.low,
    title: 'Начинать вечернее завершение раньше',
    action:
      'Перенести начало вечернего завершения на более раннее время, используя существующий вечерний порог, если он настроен.',
    applicability: EVENING_RECOMMENDATION_APPLICABILITY.eveningCycle,
    includeTargetEntityIds: false,
  });
  addSingleTypeCandidate(candidates, byType, EVENING_PATTERN_TYPE.unfinishedEvenings, {
    type: EVENING_RECOMMENDATION_TYPE.useQuickMode,
    priority: EVENING_RECOMMENDATION_PRIORITY.low,
    title: 'Использовать быстрый режим, когда на полный вечер не хватает времени',
    action: 'Выбирать QUICK вместо пропуска в дни, когда времени на полный сценарий недостаточно.',
    applicability: EVENING_RECOMMENDATION_APPLICABILITY.eveningCycle,
    includeTargetEntityIds: false,
  });
  addSingleTypeCandidate(candidates, byType, EVENING_PATTERN_TYPE.skippedReflection, {
    type: EVENING_RECOMMENDATION_TYPE.keepShortReflection,
    priority: EVENING_RECOMMENDATION_PRIORITY.low,
    title: 'Оставлять хотя бы один короткий вывод по значимым дням',
    action:
      'Записывать один короткий вывод в значимый день без обязательного прохождения полной рефлексии.',
    applicability: EVENING_RECOMMENDATION_APPLICABILITY.reflection,
    includeTargetEntityIds: false,
  });
  addSingleTypeCandidate(candidates, byType, EVENING_PATTERN_TYPE.insufficientPreparation, {
    type: EVENING_RECOMMENDATION_TYPE.simplifyPreparation,
    priority: EVENING_RECOMMENDATION_PRIORITY.low,
    title: 'Оставлять только реально необходимые пункты подготовки',
    action:
      'Убрать из PreparationPlan необязательные пункты и отдельно проверить обязательные пункты подготовки.',
    applicability: EVENING_RECOMMENDATION_APPLICABILITY.preparationPlan,
    includeTargetEntityIds: false,
  });

  return Object.freeze(
    candidates
      .sort(compareCandidates)
      .slice(0, MAX_ACTIVE_RECOMMENDATIONS)
      .map((candidate) => candidate.recommendation),
  );
}

function groupSignalsByType(
  signals: readonly EveningSignal[],
): ReadonlyMap<EveningPatternType, readonly EveningSignal[]> {
  const byType = new Map<EveningPatternType, EveningSignal[]>();
  for (const signal of signals) {
    const group = byType.get(signal.type) ?? [];
    group.push(signal);
    byType.set(signal.type, group);
  }
  for (const group of byType.values()) {
    group.sort((left, right) => left.id.localeCompare(right.id));
  }
  return byType;
}

function addSingleTypeCandidate(
  candidates: RecommendationCandidate[],
  byType: ReadonlyMap<EveningPatternType, readonly EveningSignal[]>,
  signalType: EveningPatternType,
  definition: RecommendationDefinition,
): void {
  const signals = byType.get(signalType) ?? [];
  if (signals.length > 0) candidates.push(toCandidate(signals, definition));
}

function toCandidate(
  signals: readonly EveningSignal[],
  definition: RecommendationDefinition,
): RecommendationCandidate {
  const sourceSignalIds = uniqueSorted(signals.map((signal) => signal.id));
  const targetEntityIds = uniqueSorted(signals.flatMap((signal) => signal.sourceEntityIds));
  const identity = `${definition.type}|${sourceSignalIds.join('|')}`;
  const recommendation = Object.freeze({
    id: `evening-recommendation-${stableHash(identity)}`,
    type: definition.type,
    priority: definition.priority,
    title: definition.title,
    rationale: signals
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((signal) => signal.summary)
      .join(' '),
    proposedAction: Object.freeze({
      description: definition.action,
      requiresUserConfirmation: true as const,
    }),
    sourceSignalIds: Object.freeze(sourceSignalIds),
    ...(definition.includeTargetEntityIds && targetEntityIds.length > 0
      ? { targetEntityIds: Object.freeze(targetEntityIds) }
      : {}),
    applicability: definition.applicability,
  });
  return {
    recommendation,
    highestSignalSeverity: highestSignalSeverity(signals),
    occurrences: Math.max(...signals.map((signal) => signal.evidence.occurrences)),
  };
}

function compareCandidates(left: RecommendationCandidate, right: RecommendationCandidate): number {
  return (
    priorityRank(right.recommendation.priority) - priorityRank(left.recommendation.priority) ||
    signalSeverityRank(right.highestSignalSeverity) -
      signalSeverityRank(left.highestSignalSeverity) ||
    right.occurrences - left.occurrences ||
    RECOMMENDATION_ORDER[left.recommendation.type] -
      RECOMMENDATION_ORDER[right.recommendation.type] ||
    left.recommendation.id.localeCompare(right.recommendation.id)
  );
}

function highestSignalSeverity(signals: readonly EveningSignal[]): EveningSignalSeverity {
  return signals.reduce<EveningSignalSeverity>(
    (highest, signal) =>
      signalSeverityRank(signal.severity) > signalSeverityRank(highest) ? signal.severity : highest,
    EVENING_SIGNAL_SEVERITY.info,
  );
}

function priorityRank(priority: EveningRecommendationPriority): number {
  if (priority === EVENING_RECOMMENDATION_PRIORITY.high) return 4;
  if (priority === EVENING_RECOMMENDATION_PRIORITY.medium) return 3;
  if (priority === EVENING_RECOMMENDATION_PRIORITY.low) return 2;
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

function stableHash(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}
