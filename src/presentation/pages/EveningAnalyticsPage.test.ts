import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — тест выполняется в Node, а production tsconfig не включает Node types.
import { readFileSync } from 'node:fs';
import {
  EVENING_HISTORY_RANGE_KIND,
  EVENING_PATTERN_SEVERITY,
  EVENING_PATTERN_TYPE,
  EVENING_RECOMMENDATION_APPLICABILITY,
  EVENING_RECOMMENDATION_PRIORITY,
  EVENING_RECOMMENDATION_TYPE,
  EVENING_SIGNAL_SEVERITY,
  RECOMMENDATION_APPLICATION_STATUS,
  RECOMMENDATION_PREVIEW_KIND,
  type EveningHistoryItem,
  type EveningRecommendation,
  type EveningRecommendationPreview,
} from '../../application';
import {
  EVENING_CYCLE_COMPLETION,
  EVENING_CYCLE_MODE,
  EVENING_CYCLE_STATE,
  PREPARATION_PLAN_STATUS,
  TOMORROW_PLAN_STATUS,
  DayDate,
} from '../../domain';
import { EveningAnalyticsView, type EveningAnalyticsModel } from './EveningAnalyticsPage';
import {
  createEveningAnalyticsRange,
  createEveningTrendsPresentation,
  createRecommendationDialogState,
  recommendationInput,
} from './EveningAnalyticsPresentation';

const analyticsPageSource = readFileSync(
  new URL('./EveningAnalyticsPage.tsx', import.meta.url),
  'utf8',
);

describe('E10.6–E10.7 EveningAnalyticsPage', () => {
  it('выбирает готовые диапазоны истории на 7 и 30 дней', () => {
    const date = DayDate.create('2026-08-21');

    expect(createEveningAnalyticsRange(7, date)).toEqual({
      kind: EVENING_HISTORY_RANGE_KIND.last7Days,
      endDate: date,
    });
    expect(createEveningAnalyticsRange(30, date)).toEqual({
      kind: EVENING_HISTORY_RANGE_KIND.last30Days,
      endDate: date,
    });
  });

  it('показывает готовые закономерности, не более трёх сигналов и безопасные действия', () => {
    const model = eveningAnalyticsModel();
    const markup = renderToStaticMarkup(
      createElement(EveningAnalyticsView, {
        model,
        rangeDays: 7,
        actionRecommendationId: null,
        actionError: null,
        onPreviewRecommendation: () => undefined,
        onDismissRecommendation: () => undefined,
        onOpenEvening: () => undefined,
      }),
    );

    expect(markup).toContain('Закономерности');
    expect(markup).toContain('Приоритетные сигналы');
    expect(markup).toContain('Учесть');
    expect(markup).toContain('Не сейчас');
    expect(markup).toContain('История вечеров');
    expect(markup).toContain('Ответов: 2');
    expect(markup.match(/class="evening-signal-order"/g)).toHaveLength(3);
    expect(markup).not.toContain('Сигнал 4');
    expect(markup).not.toContain('PENDING');
    expect(markup).not.toContain('cycle-technical-id');
    expect(markup).not.toContain('recommendation-technical-id');
  });

  it('показывает компактные тенденции с числовыми итогами без наведения', () => {
    const model = eveningAnalyticsModel();
    const markup = renderToStaticMarkup(
      createElement(EveningAnalyticsView, {
        model,
        rangeDays: 7,
        actionRecommendationId: null,
        actionError: null,
        onPreviewRecommendation: () => undefined,
        onDismissRecommendation: () => undefined,
        onOpenEvening: () => undefined,
      }),
    );

    expect(markup).toContain('Тенденции');
    expect(markup).toContain('Завершение циклов');
    expect(markup).toContain('4 из 5');
    expect(markup).toContain('1 перенос за период');
    expect(markup).toContain('Полнота PreparationPlan');
    expect(markup).toContain('NORMAL');
    expect(markup).toContain('QUICK');
    expect(markup).toContain('Поздний');
    expect(markup).toContain('Первый шаг завтра');
    expect(markup).toContain('class="evening-level is-neutral"');
    expect(markup).toContain('class="evening-analytics-section is-gold-accent"');
    expect(markup).not.toContain('title=');
  });

  it('оставляет 7 дневных столбцов и агрегирует 30 дней в пять недель', () => {
    const model = eveningAnalyticsModel();
    const daily = createEveningTrendsPresentation(model.history, model.summary);
    const monthly = createEveningTrendsPresentation(
      {
        range: {
          kind: EVENING_HISTORY_RANGE_KIND.last30Days,
          startDate: '2026-07-23',
          endDate: '2026-08-21',
          dayCount: 30,
        },
        items: model.history.items,
      },
      model.summary,
    );

    expect(daily.periodLabel).toBe('По дням');
    expect(daily.buckets).toHaveLength(7);
    expect(daily.buckets.map((bucket) => bucket.label)).toEqual([
      'Сб 15',
      'Вс 16',
      'Пн 17',
      'Вт 18',
      'Ср 19',
      'Чт 20',
      'Пт 21',
    ]);
    expect(monthly.periodLabel).toBe('По неделям');
    expect(monthly.buckets).toHaveLength(5);
    expect(monthly.buckets.at(-1)?.label).toBe('20.08–21.08');
  });

  it('оставляет SKIPPED в истории, но не снижает операционную аналитику', () => {
    const model = eveningAnalyticsModel();
    const completed = model.history.items[0]!;
    const skipped: EveningHistoryItem = {
      ...completed,
      cycleId: 'skipped-cycle',
      dateKey: '2026-08-21',
      completion: EVENING_CYCLE_COMPLETION.skipped,
      mode: EVENING_CYCLE_MODE.quick,
      skipReason: 'Поздняя дорога домой',
      startedAt: null,
      completedAt: '2026-08-21T14:00:00.000Z',
      durationMs: null,
    };
    const trends = createEveningTrendsPresentation(
      { ...model.history, items: [completed, skipped] },
      {
        ...model.summary,
        cycleCount: model.summary.cycleCount + 1,
        skippedCount: model.summary.skippedCount + 1,
      },
    );
    const markup = renderToStaticMarkup(
      createElement(EveningAnalyticsView, {
        model: {
          ...model,
          history: { ...model.history, items: [completed, skipped] },
          trends,
        },
        rangeDays: 7,
        actionRecommendationId: null,
        actionError: null,
        onPreviewRecommendation: () => undefined,
        onDismissRecommendation: () => undefined,
        onOpenEvening: () => undefined,
      }),
    );

    expect(trends.completion).toEqual({ completedCount: 4, cycleCount: 5 });
    expect(trends.buckets.at(-1)).toMatchObject({ cycleCount: 0, completionPercent: 0 });
    expect(markup).toContain('Ритуал пропущен');
    expect(markup).toContain('Причина: Поздняя дорога домой');
    expect(markup).not.toContain('Завершено сокращённо');
  });

  it('создаёт применение только после отдельного подтверждения предпросмотра', () => {
    const preview = targetOutcomePreview();
    const initial = createRecommendationDialogState(preview);

    expect(initial.targetOutcome).toBe('Сделать один раздел');
    expect(recommendationInput(initial)).toEqual({
      kind: 'SET_TARGET_OUTCOME',
      targetOutcome: 'Сделать один раздел',
    });
    expect(recommendationInput({ ...initial, targetOutcome: '   ' })).toBeNull();
  });

  it('загружает готовый application read-model один раз и не пересчитывает цепочку из React', () => {
    expect(analyticsPageSource).toContain('getEveningAnalytics');
    expect(analyticsPageSource).toContain('.execute(range)');
    expect(analyticsPageSource).not.toContain('getEveningHistory.execute(range)');
    expect(analyticsPageSource).not.toContain('detectEveningPatterns.execute(range)');
    expect(analyticsPageSource).not.toContain('getEveningSignals.execute(range)');
    expect(analyticsPageSource).not.toContain('Promise.all([');
  });

  it('перестраивает KPI, карточки и историю для mobile без сложных графиков', () => {
    const globalCss = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');

    expect(globalCss).toMatch(
      /\.evening-analytics-kpis\s*{[^}]*grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/,
    );
    expect(globalCss).toMatch(
      /@media \(max-width: 52rem\)[\s\S]*?\.evening-analytics-kpis\s*{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
    );
    expect(globalCss).toMatch(
      /@media \(max-width: 52rem\)[\s\S]*?\.evening-pattern-list\s*{[^}]*grid-template-columns:\s*1fr/,
    );
    expect(globalCss).toMatch(
      /\.evening-analytics-header \.section-page-header h1\s*{[^}]*font-size:\s*clamp\(2rem, 5\.6vw, 4rem\)/,
    );
    expect(globalCss).toMatch(
      /@media \(max-width: 52rem\)[\s\S]*?\.evening-trends-grid,[\s\S]*?grid-template-columns:\s*1fr/,
    );
    expect(globalCss).not.toContain('evening-analytics-chart');
    expect(globalCss).not.toContain('evening-analytics-canvas');
  });
});

function eveningAnalyticsModel(): EveningAnalyticsModel {
  const range = {
    kind: EVENING_HISTORY_RANGE_KIND.last7Days,
    startDate: '2026-08-15',
    endDate: '2026-08-21',
    dayCount: 7,
  } as const;
  const historyItem: EveningHistoryItem = {
    cycleId: 'cycle-technical-id',
    dayId: 'day-technical-id',
    dateKey: '2026-08-20',
    state: EVENING_CYCLE_STATE.completed,
    completion: EVENING_CYCLE_COMPLETION.completed,
    mode: EVENING_CYCLE_MODE.normal,
    modeReason: null,
    skipReason: null,
    startedAt: '2026-08-20T12:00:00.000Z',
    completedAt: '2026-08-20T12:18:00.000Z',
    durationMs: 1_080_000,
    resolutionCounts: { COMPLETE: 1, CARRY_FORWARD: 0, REVISE: 0, DROP: 0 },
    reflectionAnswerCount: 2,
    reflectionAnswers: [],
    resolutions: [],
    structuredReasons: [],
    signals: [],
    hasTomorrowPlan: true,
    tomorrowPlanStatus: TOMORROW_PLAN_STATUS.completed,
    tomorrowPlanningQuality: null,
    primaryDecision: 'decision-technical-id',
    hasFirstAction: true,
    firstActionId: 'action-technical-id',
    preparationState: PREPARATION_PLAN_STATUS.completed,
    preparationItems: {
      total: 1,
      completed: 1,
      skipped: 0,
      pending: 0,
      required: 1,
      requiredSkipped: 0,
      requiredPending: 0,
    },
    environmentItems: [],
    relaxation: null,
    sleepCheck: null,
    skippedStages: [],
  };
  const signals = [1, 2, 3, 4].map((number) => ({
    id: `signal-${number}`,
    type: EVENING_PATTERN_TYPE.repeatedTimeInsufficient,
    severity: EVENING_SIGNAL_SEVERITY.attention,
    title: `Сигнал ${number}`,
    summary: `Наблюдение ${number}`,
    evidence: { occurrences: 2, range, occurrenceRate: 0.4, metrics: {} },
    sourcePatternIds: [],
    sourceEntityIds: [],
    supportingDayIds: [],
    firstDetectedAt: range.startDate,
    lastDetectedAt: range.endDate,
  }));
  const recommendation = eveningRecommendation();

  const history = { range, items: [historyItem] } as const;
  const summary = {
    range,
    cycleCount: 5,
    completedCount: 4,
    skippedCount: 0,
    unfinishedCount: 1,
    modeCounts: { NORMAL: 4, QUICK: 1, EMERGENCY: 0 },
    totalDurationMs: 4_500_000,
    averageDurationMs: 900_000,
    resolutionCounts: { COMPLETE: 3, CARRY_FORWARD: 1, REVISE: 0, DROP: 0 },
    reflectionAnswerCount: 7,
    signalCount: 4,
    tomorrowPlanCount: 4,
    primaryDecisionCount: 4,
    firstActionCount: 3,
    preparationCounts: { NOT_CREATED: 0, IN_PROGRESS: 1, COMPLETED: 3 },
    skippedStageCount: 0,
  } as const;

  return {
    history,
    summary,
    trends: createEveningTrendsPresentation(history, summary),
    patterns: [
      {
        id: 'pattern-technical-id',
        type: EVENING_PATTERN_TYPE.repeatedTimeInsufficient,
        title: 'Регулярно не хватает времени',
        severity: EVENING_PATTERN_SEVERITY.medium,
        severityLabel: 'Средняя значимость',
        confidence: 0.7,
        occurrences: 2,
        range,
        sourceEntityIds: [],
        sourceEntities: [],
        sourceLabel: null,
        supportingDayIds: [],
        metrics: {},
      },
    ],
    signals,
    recommendations: [
      {
        recommendation,
        status: RECOMMENDATION_APPLICATION_STATUS.pending,
        resultMessage: null,
        application: null,
      },
    ],
  };
}

function eveningRecommendation(): EveningRecommendation {
  return {
    id: 'recommendation-technical-id',
    type: EVENING_RECOMMENDATION_TYPE.reducePrimaryDecisionTarget,
    priority: EVENING_RECOMMENDATION_PRIORITY.high,
    title: 'Уменьшить Норму главного Решения',
    rationale: 'Запланированный объём регулярно оказывается слишком большим.',
    proposedAction: {
      description: 'Сократить ожидаемый результат на завтра.',
      requiresUserConfirmation: true,
    },
    sourceSignalIds: [],
    applicability: EVENING_RECOMMENDATION_APPLICABILITY.tomorrowPlan,
  };
}

function targetOutcomePreview(): EveningRecommendationPreview {
  const now = new Date('2026-08-21T12:00:00.000Z');
  return {
    kind: RECOMMENDATION_PREVIEW_KIND.targetOutcome,
    recommendation: eveningRecommendation(),
    confirmationRequired: true,
    currentValue: 'Сделать два раздела',
    proposedValue: 'Сделать один раздел',
    opensExistingEditor: false,
    application: {
      recommendationId: 'recommendation-technical-id',
      status: RECOMMENDATION_APPLICATION_STATUS.pending,
      targetType: null,
      targetId: null,
      resultMessage: null,
      createdAt: now,
      updatedAt: now,
      appliedAt: null,
      dismissedAt: null,
      version: 0,
    },
  };
}
