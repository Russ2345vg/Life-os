import { describe, expect, it } from 'vitest';
import { DayDate } from '../../domain';
import {
  EVENING_PATTERN_SEVERITY,
  EVENING_PATTERN_TYPE,
  type EveningPattern,
  type EveningPatternType,
} from './DetectEveningPatterns';
import { EVENING_SIGNAL_SEVERITY, GetEveningSignals, getEveningSignals } from './GetEveningSignals';
import {
  EVENING_HISTORY_RANGE_KIND,
  type EveningHistoryRange,
  type ResolvedEveningHistoryRange,
} from './GetEveningHistory';

describe('E10.3 GetEveningSignals', () => {
  it.each([
    [
      EVENING_PATTERN_TYPE.repeatedCarryForward,
      'Решение переносится несколько дней',
      'За 7 дней это Решение переносилось 4 раза.',
    ],
    [
      EVENING_PATTERN_TYPE.repeatedScopeTooLarge,
      'Запланированный объём регулярно оказывается слишком большим',
      'За 7 дней слишком большой запланированный объём отмечался 4 раза.',
    ],
    [
      EVENING_PATTERN_TYPE.repeatedUnclearNextStep,
      'Следующий шаг часто остаётся неясным',
      'За 7 дней неясный следующий шаг отмечался 4 раза.',
    ],
    [
      EVENING_PATTERN_TYPE.repeatedTimeInsufficient,
      'План регулярно не помещается в доступное время',
      'За 7 дней недостаток доступного времени отмечался 4 раза.',
    ],
    [
      EVENING_PATTERN_TYPE.missingFirstAction,
      'На завтра часто не определяется конкретный первый шаг',
      'За 7 дней конкретный первый шаг на завтра отсутствовал 4 раза.',
    ],
    [
      EVENING_PATTERN_TYPE.frequentQuickMode,
      'Быстрый режим используется часто',
      'За 7 дней быстрый режим использовался 4 раза.',
    ],
    [
      EVENING_PATTERN_TYPE.frequentLateCompletion,
      'День регулярно закрывается в позднем режиме',
      'За 7 дней поздний режим завершения использовался 4 раза.',
    ],
    [
      EVENING_PATTERN_TYPE.unfinishedEvenings,
      'Вечерние циклы часто остаются незавершёнными',
      'За 7 дней вечерний цикл начинался, но не завершался 4 раза.',
    ],
    [
      EVENING_PATTERN_TYPE.skippedReflection,
      'Осмысление регулярно пропускается',
      'За 7 дней осмысление дня было пропущено 4 раза.',
    ],
    [
      EVENING_PATTERN_TYPE.insufficientPreparation,
      'Подготовка к завтра регулярно остаётся неполной',
      'За 7 дней подготовка к завтра оставалась неполной 4 раза.',
    ],
  ] as const)('преобразует %s в пользовательский сигнал', (type, title, summary) => {
    const [signal] = getEveningSignals([pattern(type)]);

    expect(signal).toMatchObject({
      type,
      severity: EVENING_SIGNAL_SEVERITY.attention,
      title,
      summary,
      evidence: {
        occurrences: 4,
        range: { startDate: '2026-08-01', endDate: '2026-08-07', dayCount: 7 },
        occurrenceRate: 0.571,
      },
      firstDetectedAt: '2026-08-01',
      lastDetectedAt: '2026-08-07',
    });
  });

  it('создаёт наблюдаемый сигнал о повторном пропуске конкретного environment-item', () => {
    const [signal] = getEveningSignals([
      pattern(EVENING_PATTERN_TYPE.repeatedEnvironmentItemSkip, {
        sourceLabel: 'Убрать телефон',
        sourceEntityIds: ['ENVIRONMENT:SLEEP:PHONE_AWAY'],
        sourceEntities: [
          { entityType: 'ENVIRONMENT_ITEM', entityId: 'ENVIRONMENT:SLEEP:PHONE_AWAY' },
        ],
        occurrences: 2,
        supportingDayIds: ['day-01', 'day-03'],
        metrics: { sampleSize: 4, occurrenceRate: 0.5, minimumOccurrences: 2 },
      }),
    ]);

    expect(signal).toMatchObject({
      title: 'Пункт «Убрать телефон» часто пропускается',
      summary: 'За 7 дней пункт был осознанно пропущен 2 раза.',
      sourceEntityIds: ['ENVIRONMENT:SLEEP:PHONE_AWAY'],
      evidence: { occurrences: 2, occurrenceRate: 0.5 },
    });
  });

  it('формулирует связь practice/calm как наблюдение, а не причинный вывод', () => {
    const [signal] = getEveningSignals([
      pattern(EVENING_PATTERN_TYPE.relaxationPracticeCalmImprovement, {
        sourceLabel: 'Дыхание',
        sourceEntityIds: ['BREATHING'],
        sourceEntities: [{ entityType: 'RELAXATION_PRACTICE', entityId: 'BREATHING' }],
        occurrences: 3,
        supportingDayIds: ['day-01', 'day-02', 'day-03'],
        metrics: {
          sampleSize: 3,
          occurrenceRate: 1,
          pairedObservationCount: 3,
          averageCalmDelta: 1.333,
        },
      }),
    ]);

    expect(signal).toMatchObject({
      title: 'После практики «Дыхание» средняя оценка спокойствия была выше',
      summary:
        'В 3 парных наблюдениях средняя оценка спокойствия после практики была выше на 1.333.',
      evidence: {
        occurrences: 3,
        metrics: expect.objectContaining({ averageCalmDelta: 1.333 }),
      },
    });
    expect(signal!.summary.toLocaleLowerCase('ru')).not.toContain('улучшает');
  });

  it('не объединяет разные environment-items в один signal', () => {
    const signals = getEveningSignals([
      pattern(EVENING_PATTERN_TYPE.repeatedEnvironmentItemSkip, {
        id: 'pattern-phone',
        sourceEntityIds: ['PHONE_AWAY'],
        sourceEntities: [{ entityType: 'ENVIRONMENT_ITEM', entityId: 'PHONE_AWAY' }],
      }),
      pattern(EVENING_PATTERN_TYPE.repeatedEnvironmentItemSkip, {
        id: 'pattern-water',
        sourceEntityIds: ['WATER'],
        sourceEntities: [{ entityType: 'ENVIRONMENT_ITEM', entityId: 'WATER' }],
      }),
    ]);

    expect(signals.map((signal) => signal.sourceEntityIds)).toEqual([['PHONE_AWAY'], ['WATER']]);
  });

  it.each([
    [EVENING_PATTERN_SEVERITY.low, EVENING_SIGNAL_SEVERITY.info],
    [EVENING_PATTERN_SEVERITY.medium, EVENING_SIGNAL_SEVERITY.attention],
    [EVENING_PATTERN_SEVERITY.high, EVENING_SIGNAL_SEVERITY.important],
  ] as const)('детерминированно преобразует severity %s в %s', (source, expected) => {
    const [signal] = getEveningSignals([
      pattern(EVENING_PATTERN_TYPE.repeatedScopeTooLarge, { severity: source }),
    ]);

    expect(signal!.severity).toBe(expected);
  });

  it('ранжирует перенос Решения выше структурных и процессных сигналов', () => {
    const signals = getEveningSignals([
      pattern(EVENING_PATTERN_TYPE.frequentLateCompletion, {
        severity: EVENING_PATTERN_SEVERITY.low,
      }),
      pattern(EVENING_PATTERN_TYPE.unfinishedEvenings),
      pattern(EVENING_PATTERN_TYPE.frequentQuickMode, {
        severity: EVENING_PATTERN_SEVERITY.high,
      }),
      pattern(EVENING_PATTERN_TYPE.repeatedScopeTooLarge, {
        severity: EVENING_PATTERN_SEVERITY.low,
      }),
      pattern(EVENING_PATTERN_TYPE.repeatedCarryForward, {
        severity: EVENING_PATTERN_SEVERITY.low,
      }),
    ]);

    expect(signals.map((signal) => signal.type)).toEqual([
      EVENING_PATTERN_TYPE.repeatedCarryForward,
      EVENING_PATTERN_TYPE.repeatedScopeTooLarge,
      EVENING_PATTERN_TYPE.frequentQuickMode,
      EVENING_PATTERN_TYPE.unfinishedEvenings,
      EVENING_PATTERN_TYPE.frequentLateCompletion,
    ]);
  });

  it('объединяет дубли одного смысла и не дублирует evidence', () => {
    const signals = getEveningSignals([
      pattern(EVENING_PATTERN_TYPE.repeatedScopeTooLarge, {
        id: 'pattern-a',
        occurrences: 2,
        range: { startDate: '2026-08-01', endDate: '2026-08-02', dayCount: 2 },
        sourceEntityIds: ['decision-a'],
        supportingDayIds: ['day-01', 'day-02'],
      }),
      pattern(EVENING_PATTERN_TYPE.repeatedScopeTooLarge, {
        id: 'pattern-b',
        occurrences: 2,
        range: { startDate: '2026-08-02', endDate: '2026-08-03', dayCount: 2 },
        sourceEntityIds: ['decision-b'],
        supportingDayIds: ['day-02', 'day-03'],
      }),
    ]);

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      evidence: {
        occurrences: 3,
        range: { startDate: '2026-08-01', endDate: '2026-08-03', dayCount: 3 },
      },
      sourcePatternIds: ['pattern-a', 'pattern-b'],
      sourceEntityIds: ['decision-a', 'decision-b'],
      supportingDayIds: ['day-01', 'day-02', 'day-03'],
    });
  });

  it('дедуплицирует перенос одного Решения, но сохраняет разные Решения раздельно', () => {
    const sharedSource = [{ entityType: 'DECISION', entityId: 'decision-a' }];
    const otherSource = [{ entityType: 'DECISION', entityId: 'decision-b' }];
    const signals = getEveningSignals([
      pattern(EVENING_PATTERN_TYPE.repeatedCarryForward, {
        id: 'carry-a-1',
        sourceEntityIds: ['decision-a'],
        sourceEntities: sharedSource,
      }),
      pattern(EVENING_PATTERN_TYPE.repeatedCarryForward, {
        id: 'carry-a-2',
        sourceEntityIds: ['decision-a'],
        sourceEntities: sharedSource,
      }),
      pattern(EVENING_PATTERN_TYPE.repeatedCarryForward, {
        id: 'carry-b',
        sourceEntityIds: ['decision-b'],
        sourceEntities: otherSource,
      }),
    ]);

    expect(signals).toHaveLength(2);
    expect(
      signals
        .map((signal) => signal.sourcePatternIds)
        .sort((left, right) => left.join('|').localeCompare(right.join('|'))),
    ).toEqual([['carry-a-1', 'carry-a-2'], ['carry-b']]);
  });

  it('возвращает несколько сигналов и пустой массив без Pattern', () => {
    expect(getEveningSignals([])).toEqual([]);

    const signals = getEveningSignals([
      pattern(EVENING_PATTERN_TYPE.repeatedTimeInsufficient),
      pattern(EVENING_PATTERN_TYPE.skippedReflection),
      pattern(EVENING_PATTERN_TYPE.insufficientPreparation),
    ]);
    expect(signals).toHaveLength(3);
  });

  it('передаёт 7, 30 и custom range существующему детектору без повторного анализа', async () => {
    const received: EveningHistoryRange[] = [];
    const analysisRange: ResolvedEveningHistoryRange = {
      kind: EVENING_HISTORY_RANGE_KIND.custom,
      startDate: '2026-07-01',
      endDate: '2026-08-21',
      dayCount: 52,
    };
    const query = new GetEveningSignals({
      execute: async (range) => {
        received.push(range);
        return {
          analysisRange,
          patterns: [pattern(EVENING_PATTERN_TYPE.frequentQuickMode)],
        };
      },
    });
    const endDate = DayDate.create('2026-08-21');
    const ranges: EveningHistoryRange[] = [
      { kind: EVENING_HISTORY_RANGE_KIND.last7Days, endDate },
      { kind: EVENING_HISTORY_RANGE_KIND.last30Days, endDate },
      {
        kind: EVENING_HISTORY_RANGE_KIND.custom,
        startDate: DayDate.create('2026-07-01'),
        endDate,
      },
    ];

    for (const range of ranges) {
      const result = await query.execute(range);
      expect(result.analysisRange).toBe(analysisRange);
      expect(result.signals).toHaveLength(1);
    }
    expect(received).toEqual(ranges);
  });

  it('стабилен при повторном вызове и не переносит enum-названия в тексты', () => {
    const patterns = Object.values(EVENING_PATTERN_TYPE).map((type) => pattern(type));

    const first = getEveningSignals(patterns);
    const second = getEveningSignals(patterns);

    expect(second).toEqual(first);
    for (const signal of first) {
      const text = `${signal.title} ${signal.summary}`;
      for (const technicalName of Object.values(EVENING_PATTERN_TYPE)) {
        expect(text).not.toContain(technicalName);
      }
    }
  });

  it('оставляет частый быстрый режим информационным при LOW Pattern', () => {
    const [signal] = getEveningSignals([
      pattern(EVENING_PATTERN_TYPE.frequentQuickMode, {
        severity: EVENING_PATTERN_SEVERITY.low,
      }),
    ]);

    expect(signal).toMatchObject({
      severity: EVENING_SIGNAL_SEVERITY.info,
      title: 'Быстрый режим используется часто',
    });
  });
});

function pattern(type: EveningPatternType, patch: Partial<EveningPattern> = {}): EveningPattern {
  return Object.freeze({
    id: `pattern-${type.toLowerCase()}`,
    type,
    title: 'Технический Pattern',
    severity: EVENING_PATTERN_SEVERITY.medium,
    severityLabel: 'Средняя',
    confidence: 0.8,
    occurrences: 4,
    range: { startDate: '2026-08-01', endDate: '2026-08-07', dayCount: 7 },
    sourceEntityIds: ['decision-a'],
    sourceEntities: [{ entityType: 'DECISION', entityId: 'decision-a' }],
    sourceLabel: null,
    supportingDayIds: ['day-01', 'day-02', 'day-04', 'day-07'],
    metrics: { sampleSize: 7, occurrenceRate: 0.571 },
    ...patch,
  });
}
