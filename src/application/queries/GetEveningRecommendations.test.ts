import { describe, expect, it, vi } from 'vitest';
import { DayDate } from '../../domain';
import { EVENING_PATTERN_TYPE, type EveningPatternType } from './DetectEveningPatterns';
import {
  EVENING_RECOMMENDATION_APPLICABILITY,
  EVENING_RECOMMENDATION_PRIORITY,
  EVENING_RECOMMENDATION_TYPE,
  GetEveningRecommendations,
  getEveningRecommendations,
} from './GetEveningRecommendations';
import {
  EVENING_SIGNAL_SEVERITY,
  type EveningSignal,
  type EveningSignalSeverity,
} from './GetEveningSignals';
import {
  EVENING_HISTORY_RANGE_KIND,
  type EveningHistoryRange,
  type ResolvedEveningHistoryRange,
} from './GetEveningHistory';

describe('E10.4 GetEveningRecommendations', () => {
  it('repeated carry → предлагает пересмотреть Решение перед переносом', () => {
    const [recommendation] = getEveningRecommendations([
      signal(EVENING_PATTERN_TYPE.repeatedCarryForward, {
        id: 'carry-signal',
        sourceEntityIds: ['decision-a'],
      }),
    ]);

    expect(recommendation).toMatchObject({
      type: EVENING_RECOMMENDATION_TYPE.reviewRepeatedCarry,
      priority: EVENING_RECOMMENDATION_PRIORITY.high,
      title: 'Пересмотреть Решение перед очередным переносом',
      proposedAction: {
        description:
          'Перед следующим переносом уменьшить объём Решения, определить препятствие или отказаться от Решения.',
        requiresUserConfirmation: true,
      },
      sourceSignalIds: ['carry-signal'],
      targetEntityIds: ['decision-a'],
      applicability: EVENING_RECOMMENDATION_APPLICABILITY.decision,
    });
  });

  it('scope too large → предлагает уменьшить Норму главного Решения в TomorrowPlan', () => {
    const [recommendation] = getEveningRecommendations([
      signal(EVENING_PATTERN_TYPE.repeatedScopeTooLarge),
    ]);

    expect(recommendation).toMatchObject({
      type: EVENING_RECOMMENDATION_TYPE.reducePrimaryDecisionTarget,
      title: 'Уменьшить Норму главного Решения',
      applicability: EVENING_RECOMMENDATION_APPLICABILITY.tomorrowPlan,
      proposedAction: {
        description: 'В TomorrowPlan уменьшить ожидаемый результат главного Решения на завтра.',
        requiresUserConfirmation: true,
      },
    });
  });

  it('unclear next step → предлагает сформулировать конкретное первое действие', () => {
    const [recommendation] = getEveningRecommendations([
      signal(EVENING_PATTERN_TYPE.repeatedUnclearNextStep),
    ]);

    expect(recommendation).toMatchObject({
      type: EVENING_RECOMMENDATION_TYPE.defineFirstAction,
      title: 'Сформулировать конкретный первый шаг на завтра',
      proposedAction: {
        description:
          'Записать в TomorrowPlan одно конкретное действие, с которого начнётся работа завтра.',
      },
    });
  });

  it('insufficient time → выбирает одно сокращение завтрашнего фокуса', () => {
    const recommendations = getEveningRecommendations([
      signal(EVENING_PATTERN_TYPE.repeatedTimeInsufficient),
    ]);

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]).toMatchObject({
      type: EVENING_RECOMMENDATION_TYPE.reduceTomorrowLoad,
      title: 'Сократить объём завтрашнего фокуса',
      proposedAction: {
        description: 'В TomorrowPlan сократить объём главного Решения на завтра.',
      },
    });
  });

  it('missing firstAction → предлагает сделать первый шаг частью вечернего планирования', () => {
    const [recommendation] = getEveningRecommendations([
      signal(EVENING_PATTERN_TYPE.missingFirstAction),
    ]);

    expect(recommendation).toMatchObject({
      type: EVENING_RECOMMENDATION_TYPE.makeFirstActionStandard,
      title: 'Сделать первый шаг обязательной частью вечернего планирования',
      applicability: EVENING_RECOMMENDATION_APPLICABILITY.eveningPlanning,
      proposedAction: {
        description:
          'Добавлять конкретный firstAction в TomorrowPlan при каждом вечернем планировании.',
        requiresUserConfirmation: true,
      },
    });
  });

  it('frequent QUICK → оставляет рекомендацию информационной', () => {
    const [recommendation] = getEveningRecommendations([
      signal(EVENING_PATTERN_TYPE.frequentQuickMode),
    ]);

    expect(recommendation).toMatchObject({
      type: EVENING_RECOMMENDATION_TYPE.reviewQuickFrequency,
      priority: EVENING_RECOMMENDATION_PRIORITY.info,
      title: 'Проверить, нужен ли полный вечерний сценарий каждый день',
    });
  });

  it('frequent late mode → предлагает начинать завершение раньше без новой системы напоминаний', () => {
    const [recommendation] = getEveningRecommendations([
      signal(EVENING_PATTERN_TYPE.frequentLateCompletion),
    ]);

    expect(recommendation).toMatchObject({
      type: EVENING_RECOMMENDATION_TYPE.startEveningEarlier,
      title: 'Начинать вечернее завершение раньше',
      proposedAction: {
        description:
          'Перенести начало вечернего завершения на более раннее время, используя существующий вечерний порог, если он настроен.',
      },
    });
  });

  it('incomplete cycles → предпочитает QUICK полному пропуску', () => {
    const [recommendation] = getEveningRecommendations([
      signal(EVENING_PATTERN_TYPE.unfinishedEvenings),
    ]);

    expect(recommendation).toMatchObject({
      type: EVENING_RECOMMENDATION_TYPE.useQuickMode,
      title: 'Использовать быстрый режим, когда на полный вечер не хватает времени',
      proposedAction: {
        description:
          'Выбирать QUICK вместо пропуска в дни, когда времени на полный сценарий недостаточно.',
      },
    });
  });

  it('skipped reflection → предлагает один короткий вывод вместо обязательной полной рефлексии', () => {
    const [recommendation] = getEveningRecommendations([
      signal(EVENING_PATTERN_TYPE.skippedReflection),
    ]);

    expect(recommendation).toMatchObject({
      type: EVENING_RECOMMENDATION_TYPE.keepShortReflection,
      title: 'Оставлять хотя бы один короткий вывод по значимым дням',
      proposedAction: {
        description:
          'Записывать один короткий вывод в значимый день без обязательного прохождения полной рефлексии.',
      },
    });
  });

  it('incomplete preparation → предлагает оставить необходимое и проверить обязательное', () => {
    const [recommendation] = getEveningRecommendations([
      signal(EVENING_PATTERN_TYPE.insufficientPreparation),
    ]);

    expect(recommendation).toMatchObject({
      type: EVENING_RECOMMENDATION_TYPE.simplifyPreparation,
      title: 'Оставлять только реально необходимые пункты подготовки',
      applicability: EVENING_RECOMMENDATION_APPLICABILITY.preparationPlan,
      proposedAction: {
        description:
          'Убрать из PreparationPlan необязательные пункты и отдельно проверить обязательные пункты подготовки.',
      },
    });
  });

  it('повторный environment skip → только подтверждаемое ручное рассмотрение пункта', () => {
    const [recommendation] = getEveningRecommendations([
      signal(EVENING_PATTERN_TYPE.repeatedEnvironmentItemSkip, {
        sourceEntityIds: ['ENVIRONMENT:SLEEP:PHONE_AWAY'],
      }),
    ]);

    expect(recommendation).toMatchObject({
      type: EVENING_RECOMMENDATION_TYPE.reviewEnvironmentItem,
      priority: EVENING_RECOMMENDATION_PRIORITY.low,
      applicability: EVENING_RECOMMENDATION_APPLICABILITY.preparationPlan,
      proposedAction: {
        description:
          'Осознанно пересмотреть этот пункт подготовки без автоматического изменения обязательного ядра.',
        requiresUserConfirmation: true,
      },
    });
  });

  it('practice/calm observation → информационная recommendation без медицинского вывода', () => {
    const [recommendation] = getEveningRecommendations([
      signal(EVENING_PATTERN_TYPE.relaxationPracticeCalmImprovement, {
        sourceEntityIds: ['BREATHING'],
      }),
    ]);

    expect(recommendation).toMatchObject({
      type: EVENING_RECOMMENDATION_TYPE.considerRelaxationPractice,
      priority: EVENING_RECOMMENDATION_PRIORITY.info,
      applicability: EVENING_RECOMMENDATION_APPLICABILITY.eveningCycle,
      proposedAction: {
        description:
          'Учесть это субъективное наблюдение при следующем выборе практики; настройки автоматически не менять.',
        requiresUserConfirmation: true,
      },
    });
  });

  it('ранжирует главное Решение, структурный сбой и процесс выше INFO', () => {
    const recommendations = getEveningRecommendations([
      signal(EVENING_PATTERN_TYPE.frequentQuickMode, {
        severity: EVENING_SIGNAL_SEVERITY.important,
      }),
      signal(EVENING_PATTERN_TYPE.frequentLateCompletion),
      signal(EVENING_PATTERN_TYPE.missingFirstAction),
      signal(EVENING_PATTERN_TYPE.repeatedCarryForward),
    ]);

    expect(recommendations.map((item) => item.type)).toEqual([
      EVENING_RECOMMENDATION_TYPE.reviewRepeatedCarry,
      EVENING_RECOMMENDATION_TYPE.makeFirstActionStandard,
      EVENING_RECOMMENDATION_TYPE.startEveningEarlier,
    ]);
  });

  it('дедуплицирует родственные scope too large и insufficient time', () => {
    const recommendations = getEveningRecommendations([
      signal(EVENING_PATTERN_TYPE.repeatedScopeTooLarge, { id: 'scope-signal' }),
      signal(EVENING_PATTERN_TYPE.repeatedTimeInsufficient, { id: 'time-signal' }),
    ]);

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]).toMatchObject({
      type: EVENING_RECOMMENDATION_TYPE.reducePrimaryDecisionTarget,
      sourceSignalIds: ['scope-signal', 'time-signal'],
    });
  });

  it('возвращает максимум 3 активные рекомендации', () => {
    const recommendations = getEveningRecommendations([
      signal(EVENING_PATTERN_TYPE.repeatedCarryForward),
      signal(EVENING_PATTERN_TYPE.repeatedScopeTooLarge),
      signal(EVENING_PATTERN_TYPE.repeatedUnclearNextStep),
      signal(EVENING_PATTERN_TYPE.unfinishedEvenings),
      signal(EVENING_PATTERN_TYPE.frequentQuickMode),
    ]);

    expect(recommendations).toHaveLength(3);
  });

  it('пустые Signals → пустой результат', () => {
    expect(getEveningRecommendations([])).toEqual([]);
  });

  it('повторный вызов стабилен, включая порядок и ID', () => {
    const signals = [
      signal(EVENING_PATTERN_TYPE.repeatedTimeInsufficient),
      signal(EVENING_PATTERN_TYPE.repeatedCarryForward),
      signal(EVENING_PATTERN_TYPE.skippedReflection),
    ];

    const first = getEveningRecommendations(signals);
    const second = getEveningRecommendations(signals);

    expect(second).toEqual(first);
    expect(second.map((item) => item.id)).toEqual(first.map((item) => item.id));
  });

  it('использует только getEveningSignals и ничего автоматически не изменяет', async () => {
    const inputSignal = signal(EVENING_PATTERN_TYPE.repeatedScopeTooLarge);
    const range: EveningHistoryRange = {
      kind: EVENING_HISTORY_RANGE_KIND.last7Days,
      endDate: DayDate.create('2026-08-21'),
    };
    const analysisRange: ResolvedEveningHistoryRange = {
      kind: EVENING_HISTORY_RANGE_KIND.last7Days,
      startDate: '2026-08-15',
      endDate: '2026-08-21',
      dayCount: 7,
    };
    const getSignals = vi.fn(async () => ({ analysisRange, signals: [inputSignal] }));
    const state = Object.freeze({
      tomorrowPlanVersion: 7,
      decisionVersion: 3,
      preparationPlanVersion: 2,
      eveningCycleVersion: 5,
    });
    const before = { ...state };

    const result = await new GetEveningRecommendations({ execute: getSignals }).execute(range);

    expect(getSignals).toHaveBeenCalledOnce();
    expect(getSignals).toHaveBeenCalledWith(range);
    expect(result.analysisRange).toBe(analysisRange);
    expect(result.recommendations[0]?.proposedAction.requiresUserConfirmation).toBe(true);
    expect(state).toEqual(before);
    expect(inputSignal).toEqual(signal(EVENING_PATTERN_TYPE.repeatedScopeTooLarge));
  });
});

function signal(type: EveningPatternType, patch: Partial<EveningSignal> = {}): EveningSignal {
  const severity: EveningSignalSeverity = EVENING_SIGNAL_SEVERITY.attention;
  return Object.freeze({
    id: `signal-${type.toLowerCase()}`,
    type,
    severity,
    title: `Signal ${type}`,
    summary: `За 7 дней сигнал ${type} отмечался 4 раза.`,
    evidence: Object.freeze({
      occurrences: 4,
      range: Object.freeze({
        startDate: '2026-08-15',
        endDate: '2026-08-21',
        dayCount: 7,
      }),
      occurrenceRate: 0.571,
      metrics: Object.freeze({ sampleSize: 7, occurrenceRate: 0.571 }),
    }),
    sourcePatternIds: Object.freeze([`pattern-${type.toLowerCase()}`]),
    sourceEntityIds: Object.freeze(['decision-a']),
    supportingDayIds: Object.freeze(['day-1', 'day-2', 'day-4', 'day-7']),
    firstDetectedAt: '2026-08-15',
    lastDetectedAt: '2026-08-21',
    ...patch,
  });
}
