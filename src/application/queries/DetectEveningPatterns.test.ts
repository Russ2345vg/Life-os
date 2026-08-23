import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EVENING_CYCLE_COMPLETION,
  EVENING_CYCLE_MODE,
  EVENING_CYCLE_STATE,
  EVENING_MODE_REASON,
  EVENING_STAGE_SKIP_REASON,
  PREPARATION_PLAN_STATUS,
  REFLECTION_SIGNAL_TYPE,
  TOMORROW_PLANNING_QUALITY,
  TOMORROW_PLAN_STATUS,
} from '../../domain';
import {
  DetectEveningPatterns,
  EVENING_PATTERN_TYPE,
  detectEveningPatterns,
} from './DetectEveningPatterns';
import {
  EVENING_HISTORY_RANGE_KIND,
  type EveningHistoryItem,
  type EveningHistoryRange,
  type EveningHistoryResult,
  type ResolvedEveningHistoryRange,
} from './GetEveningHistory';
import { summarizeEveningHistory } from './GetEveningHistorySummary';

describe('E10.2 DetectEveningPatterns', () => {
  it('не считает один перенос закономерностью', () => {
    const result = detect([carryItem(1, 'decision-a')]);

    expect(patternsOf(result, EVENING_PATTERN_TYPE.repeatedCarryForward)).toHaveLength(0);
  });

  it('находит повторный перенос одного объекта в соседние дни и сохраняет источник', () => {
    const result = detect([carryItem(1, 'decision-a'), carryItem(2, 'decision-a')]);
    const [pattern] = patternsOf(result, EVENING_PATTERN_TYPE.repeatedCarryForward);

    expect(pattern).toMatchObject({
      occurrences: 2,
      sourceEntityIds: ['decision-a'],
      supportingDayIds: ['day-01', 'day-02'],
      range: { startDate: '2026-08-01', endDate: '2026-08-02', dayCount: 2 },
    });
    expect(pattern!.title).not.toContain('REPEATED_CARRY_FORWARD');
  });

  it.each([
    [REFLECTION_SIGNAL_TYPE.scopeTooLarge, EVENING_PATTERN_TYPE.repeatedScopeTooLarge],
    [REFLECTION_SIGNAL_TYPE.nextStepUnclear, EVENING_PATTERN_TYPE.repeatedUnclearNextStep],
    [REFLECTION_SIGNAL_TYPE.timeInsufficient, EVENING_PATTERN_TYPE.repeatedTimeInsufficient],
  ] as const)('находит повторяющуюся структурированную причину %s', (signalType, patternType) => {
    const result = detect([
      signalItem(1, signalType, 'decision-a'),
      signalItem(3, signalType, 'decision-b'),
    ]);

    expect(patternsOf(result, patternType)).toEqual([
      expect.objectContaining({
        occurrences: 2,
        sourceEntityIds: ['decision-a', 'decision-b'],
      }),
    ]);
  });

  it('находит частое использование QUICK', () => {
    const result = detect([
      item(1, { mode: EVENING_CYCLE_MODE.quick }),
      item(2, { mode: EVENING_CYCLE_MODE.quick }),
      item(3),
      item(4),
    ]);

    expect(patternsOf(result, EVENING_PATTERN_TYPE.frequentQuickMode)).toEqual([
      expect.objectContaining({
        occurrences: 2,
        metrics: expect.objectContaining({ occurrenceRate: 0.5 }),
      }),
    ]);
  });

  it('находит частое EMERGENCY или позднее завершение', () => {
    const result = detect([
      item(1, { mode: EVENING_CYCLE_MODE.emergency }),
      item(2, { modeReason: EVENING_MODE_REASON.lateNight }),
      item(3),
      item(4),
    ]);

    expect(patternsOf(result, EVENING_PATTERN_TYPE.frequentLateCompletion)).toHaveLength(1);
  });

  it('находит завершённые TomorrowPlan без firstAction', () => {
    const missingAction = {
      mode: EVENING_CYCLE_MODE.emergency,
      hasTomorrowPlan: true,
      tomorrowPlanStatus: TOMORROW_PLAN_STATUS.completed,
      tomorrowPlanningQuality: TOMORROW_PLANNING_QUALITY.minimal,
      hasFirstAction: false,
    } as const;
    const result = detect([item(1, missingAction), item(2, missingAction)]);

    expect(patternsOf(result, EVENING_PATTERN_TYPE.missingFirstAction)).toHaveLength(1);
  });

  it('находит циклы, которые начались, но не завершились', () => {
    const unfinished = {
      state: EVENING_CYCLE_STATE.resolving,
      completion: null,
      completedAt: null,
      durationMs: null,
    } as const;
    const result = detect([item(1, unfinished), item(2, unfinished), item(3), item(4)]);

    expect(patternsOf(result, EVENING_PATTERN_TYPE.unfinishedEvenings)).toEqual([
      expect.objectContaining({ occurrences: 2 }),
    ]);
  });

  it('находит пропуск Reflection только в режимах, где пропуск допустим', () => {
    const skippedReflection = {
      mode: EVENING_CYCLE_MODE.quick,
      skippedStages: [
        {
          stage: EVENING_CYCLE_STATE.reflecting,
          reason: EVENING_STAGE_SKIP_REASON.quickMode,
          skippedAt: '2026-08-02T00:10:00.000Z',
        },
      ],
    } as const;
    const result = detect([item(1, skippedReflection), item(2, skippedReflection)]);

    expect(patternsOf(result, EVENING_PATTERN_TYPE.skippedReflection)).toHaveLength(1);
  });

  it('находит слабую preparation по REQUIRED-пропускам и минимальному объёму', () => {
    const result = detect([
      item(1, {
        preparationState: PREPARATION_PLAN_STATUS.completed,
        preparationItems: preparationItems({
          total: 2,
          skipped: 1,
          required: 1,
          requiredSkipped: 1,
        }),
      }),
      item(2, {
        preparationState: PREPARATION_PLAN_STATUS.completed,
        preparationItems: preparationItems({ total: 1, completed: 1, required: 1 }),
      }),
    ]);

    expect(patternsOf(result, EVENING_PATTERN_TYPE.insufficientPreparation)).toEqual([
      expect.objectContaining({
        occurrences: 2,
        metrics: expect.objectContaining({ requiredSkippedCount: 1, minimalPreparationCount: 1 }),
      }),
    ]);
  });

  it('не создаёт ложных закономерностей в нормальной истории', () => {
    const normal = [1, 2, 3, 4, 5].map((day) => item(day));

    expect(detect(normal).patterns).toEqual([]);
  });

  it('возвращает стабильные id без дублей при одинаковом запросе', async () => {
    const history = historyOf([
      signalItem(1, REFLECTION_SIGNAL_TYPE.scopeTooLarge, 'decision-a', true),
      signalItem(2, REFLECTION_SIGNAL_TYPE.scopeTooLarge, 'decision-a', true),
    ]);
    const detector = new DetectEveningPatterns({ execute: async () => history });
    const range: EveningHistoryRange = {
      kind: EVENING_HISTORY_RANGE_KIND.last7Days,
      endDate: DayDate.create('2026-08-07'),
    };

    const first = await detector.execute(range);
    const second = await detector.execute(range);

    expect(second.patterns).toEqual(first.patterns);
    expect(new Set(first.patterns.map((pattern) => pattern.id)).size).toBe(first.patterns.length);
    expect(patternsOf(first, EVENING_PATTERN_TYPE.repeatedScopeTooLarge)).toHaveLength(1);
  });

  it('читает историю по одному разу для диапазонов 7 и 30 дней', async () => {
    const received: EveningHistoryRange[] = [];
    const history = historyOf([]);
    const detector = new DetectEveningPatterns({
      execute: async (range) => {
        received.push(range);
        return history;
      },
    });
    const endDate = DayDate.create('2026-08-21');

    await detector.execute({ kind: EVENING_HISTORY_RANGE_KIND.last7Days, endDate });
    await detector.execute({ kind: EVENING_HISTORY_RANGE_KIND.last30Days, endDate });

    expect(received.map((range) => range.kind).sort()).toEqual([
      EVENING_HISTORY_RANGE_KIND.last30Days,
      EVENING_HISTORY_RANGE_KIND.last7Days,
    ]);
  });

  it('относит сигналы после полуночи к EveningCycle.dayId, а не календарной дате сигнала', () => {
    const first = signalItem(1, REFLECTION_SIGNAL_TYPE.scopeTooLarge, 'decision-a');
    const afterMidnight = signalItem(2, REFLECTION_SIGNAL_TYPE.scopeTooLarge, 'decision-a');
    const result = detect([
      first,
      {
        ...afterMidnight,
        signals: [
          {
            ...afterMidnight.signals[0]!,
            createdAt: '2026-08-03T00:15:00.000Z',
          },
        ],
      },
    ]);

    expect(patternsOf(result, EVENING_PATTERN_TYPE.repeatedScopeTooLarge)[0]).toMatchObject({
      supportingDayIds: ['day-01', 'day-02'],
      range: { startDate: '2026-08-01', endDate: '2026-08-02' },
    });
  });
});

function detect(items: readonly EveningHistoryItem[]) {
  const history = historyOf(items);
  return detectEveningPatterns(history, summarizeEveningHistory(history));
}

function patternsOf(
  result: ReturnType<typeof detectEveningPatterns>,
  type: (typeof EVENING_PATTERN_TYPE)[keyof typeof EVENING_PATTERN_TYPE],
) {
  return result.patterns.filter((pattern) => pattern.type === type);
}

function historyOf(items: readonly EveningHistoryItem[]): EveningHistoryResult {
  return Object.freeze({
    range: rangeOf('2026-08-01', '2026-08-30', 30),
    items: Object.freeze([...items]),
  });
}

function rangeOf(
  startDate: string,
  endDate: string,
  dayCount: number,
): ResolvedEveningHistoryRange {
  return Object.freeze({
    kind: EVENING_HISTORY_RANGE_KIND.custom,
    startDate,
    endDate,
    dayCount,
  });
}

function item(day: number, patch: Partial<EveningHistoryItem> = {}): EveningHistoryItem {
  const dayText = day.toString().padStart(2, '0');
  const dateKey = `2026-08-${dayText}`;
  const base: EveningHistoryItem = {
    cycleId: `cycle-${dayText}`,
    dayId: `day-${dayText}`,
    dateKey,
    state: EVENING_CYCLE_STATE.completed,
    completion: EVENING_CYCLE_COMPLETION.completed,
    mode: EVENING_CYCLE_MODE.normal,
    modeReason: null,
    startedAt: `${dateKey}T21:00:00.000Z`,
    completedAt: `${dateKey}T21:20:00.000Z`,
    durationMs: 1_200_000,
    resolutionCounts: { COMPLETE: 1, CARRY_FORWARD: 0, REVISE: 0, DROP: 0 },
    reflectionAnswerCount: 1,
    reflectionAnswers: [],
    resolutions: [],
    structuredReasons: [],
    signals: [],
    hasTomorrowPlan: true,
    tomorrowPlanStatus: TOMORROW_PLAN_STATUS.completed,
    tomorrowPlanningQuality: TOMORROW_PLANNING_QUALITY.full,
    primaryDecision: `decision-${dayText}`,
    hasFirstAction: true,
    firstActionId: `action-${dayText}`,
    preparationState: PREPARATION_PLAN_STATUS.completed,
    preparationItems: preparationItems({ total: 2, completed: 2, required: 1 }),
    skippedStages: [],
  };
  return Object.freeze({ ...base, ...patch });
}

function carryItem(day: number, entityId: string): EveningHistoryItem {
  return item(day, {
    resolutionCounts: { COMPLETE: 0, CARRY_FORWARD: 1, REVISE: 0, DROP: 0 },
    resolutions: [{ resolution: 'CARRY_FORWARD', entityType: 'DECISION', entityId, note: null }],
  });
}

function signalItem(
  day: number,
  type: (typeof REFLECTION_SIGNAL_TYPE)[keyof typeof REFLECTION_SIGNAL_TYPE],
  sourceEntityId: string,
  duplicateAsAnswer = false,
): EveningHistoryItem {
  const dateKey = `2026-08-${day.toString().padStart(2, '0')}`;
  return item(day, {
    signals: [{ type, sourceEntityId, createdAt: `${dateKey}T22:00:00.000Z` }],
    reflectionAnswers: duplicateAsAnswer
      ? [
          {
            questionId: `question-${day}`,
            kind: null,
            signal: null,
            answer: type,
            answeredAt: `${dateKey}T22:00:00.000Z`,
          },
        ]
      : [],
  });
}

function preparationItems(
  patch: Partial<EveningHistoryItem['preparationItems']>,
): EveningHistoryItem['preparationItems'] {
  return {
    total: 0,
    completed: 0,
    skipped: 0,
    pending: 0,
    required: 0,
    requiredSkipped: 0,
    requiredPending: 0,
    ...patch,
  };
}
