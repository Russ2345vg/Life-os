import { describe, expect, it, vi } from 'vitest';
import {
  EVENING_CYCLE_COMPLETION,
  EVENING_CYCLE_MODE,
  EVENING_CYCLE_STATE,
  PREPARATION_PLAN_STATUS,
  REFLECTION_DAY_SIGNAL,
  REFLECTION_QUESTION_KIND,
  TOMORROW_PLAN_STATUS,
  DayDate,
} from '../../domain';
import { EVENING_HISTORY_RANGE_KIND, type EveningHistoryItem } from './GetEveningHistory';
import { GetEveningAnalytics } from './GetEveningAnalytics';

describe('E11.2 GetEveningAnalytics performance projection', () => {
  it.each([30, 90, 365])(
    'обрабатывает %i циклов с большими вложенными наборами за одно чтение истории',
    async (cycleCount) => {
      const history = historyWithSize(cycleCount);
      const execute = vi.fn().mockResolvedValue(history);
      const findByRecommendationIds = vi.fn().mockResolvedValue([]);
      const query = new GetEveningAnalytics({ execute }, { findByRecommendationIds });

      const result = await query.execute({
        kind: EVENING_HISTORY_RANGE_KIND.custom,
        startDate: DayDate.create(history.range.startDate),
        endDate: DayDate.create(history.range.endDate),
      });

      expect(result.summary.cycleCount).toBe(cycleCount);
      expect(result.summary.reflectionAnswerCount).toBe(cycleCount * 20);
      expect(result.history.items.flatMap((item) => item.reflectionAnswers)).toHaveLength(
        cycleCount * 20,
      );
      expect(execute).toHaveBeenCalledTimes(1);
      expect(findByRecommendationIds).toHaveBeenCalledTimes(1);
      expect(result.recommendationCards).toHaveLength(result.recommendations.length);
    },
  );
});

function historyWithSize(cycleCount: number) {
  const items = Array.from({ length: cycleCount }, (_, index) => historyItem(index));
  return {
    range: {
      kind: EVENING_HISTORY_RANGE_KIND.custom,
      startDate: items.at(-1)!.dateKey,
      endDate: items[0]!.dateKey,
      dayCount: cycleCount,
    },
    items,
  } as const;
}

function historyItem(index: number): EveningHistoryItem {
  const dateKey = dateBefore('2026-12-31', index);
  const answeredAt = `${dateKey}T20:30:00.000Z`;
  return {
    cycleId: `cycle-${index}`,
    dayId: `day-${index}`,
    dateKey,
    state: EVENING_CYCLE_STATE.completed,
    completion: EVENING_CYCLE_COMPLETION.completed,
    mode: index % 4 === 0 ? EVENING_CYCLE_MODE.quick : EVENING_CYCLE_MODE.normal,
    modeReason: null,
    startedAt: `${dateKey}T20:00:00.000Z`,
    completedAt: `${dateKey}T21:00:00.000Z`,
    durationMs: 3_600_000,
    resolutionCounts: { COMPLETE: 4, CARRY_FORWARD: 2, REVISE: 0, DROP: 1 },
    reflectionAnswerCount: 20,
    reflectionAnswers: Array.from({ length: 20 }, (_, answerIndex) => ({
      questionId: `question-${answerIndex}`,
      kind: REFLECTION_QUESTION_KIND.generalLearning,
      signal: REFLECTION_DAY_SIGNAL.learning,
      answer: `Ответ ${answerIndex}`,
      answeredAt,
    })),
    resolutions: Array.from({ length: 7 }, (_, resolutionIndex) => ({
      resolution: resolutionIndex < 4 ? ('COMPLETE' as const) : ('CARRY_FORWARD' as const),
      entityType: 'LIFE_ACTION',
      entityId: `action-${resolutionIndex}`,
      note: resolutionIndex < 4 ? null : 'Недостаточно времени',
    })),
    structuredReasons: [],
    signals: [],
    hasTomorrowPlan: true,
    tomorrowPlanStatus: TOMORROW_PLAN_STATUS.completed,
    tomorrowPlanningQuality: null,
    primaryDecision: `decision-${index}`,
    hasFirstAction: true,
    firstActionId: `first-action-${index}`,
    preparationState: PREPARATION_PLAN_STATUS.completed,
    preparationItems: {
      total: 12,
      completed: 10,
      skipped: 2,
      pending: 0,
      required: 5,
      requiredSkipped: 0,
      requiredPending: 0,
    },
    skippedStages: [],
  };
}

function dateBefore(endDate: string, offset: number): string {
  const date = new Date(`${endDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}
