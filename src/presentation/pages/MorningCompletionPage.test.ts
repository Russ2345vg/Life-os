import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DayDate } from '../../domain';
import {
  MORNING_COMPLETION_STATUS,
  type MorningCompletionOverview,
  type MorningHistoryOverview,
} from '../../application';
import { MorningCompletionView, formatMorningPhysicalSummary } from './MorningCompletionPage';

describe('MorningCompletionView', () => {
  it('делает единственным главным действием handoff и показывает реальные итоги', () => {
    const markup = renderToStaticMarkup(
      createElement(MorningCompletionView, {
        overview: completion(),
        history: history(),
        view: 'summary',
        period: 7,
        busy: false,
        error: null,
        onStartWorkBlock: () => undefined,
        onViewChange: () => undefined,
        onPeriodChange: () => undefined,
        onRetry: () => undefined,
      }),
    );

    expect(markup).toContain('Утро завершено');
    expect(markup).toContain('Ты подготовил день. Можно переходить к работе.');
    expect(markup).toContain('Начать рабочий блок');
    expect(markup.match(/morning-completion-cta/g)).toHaveLength(1);
    expect(markup).toContain('Вода выпита');
    expect(markup).toContain('Холодный душ выполнен');
    expect(markup).toContain('2 упражнения · 6 подходов · 60 повторений · 45 сек · 12 мин');
    expect(markup).toContain('Подготовить релиз');
    expect(markup).toContain('08:00–09:30');
    expect(markup).toContain('Начало');
    expect(markup).toContain('Завершение');
    expect(markup).toContain('35 мин');
  });

  it('показывает разрешённый partial без оценки качества', () => {
    const markup = renderToStaticMarkup(
      createElement(MorningCompletionView, {
        overview: {
          ...completion(),
          status: MORNING_COMPLETION_STATUS.partialAllowed,
          quickStart: { waterCompleted: true, coldShower: 'skipped' },
          physical: { ...completion().physical, completed: false, skipped: true },
          mainAction: { ...completion().mainAction, status: 'skipped', title: null },
        },
        history: history(),
        view: 'summary',
        period: 7,
        busy: false,
        error: null,
        onStartWorkBlock: () => undefined,
        onViewChange: () => undefined,
        onPeriodChange: () => undefined,
        onRetry: () => undefined,
      }),
    );

    expect(markup).toContain('Пропуски учтены');
    expect(markup).not.toContain('Допустимые пропуски учтены');
    expect(markup).toContain('Холодный душ осознанно пропущен');
    expect(markup).toContain('Физическая активность осознанно пропущена');
    expect(markup).toContain('Сегодня без главного действия');
    expect(markup).not.toMatch(/\d+\/100|качество утра|рейтинг продуктивности/i);
  });

  it('после finish заменяет CTA на закрытое состояние', () => {
    const markup = renderToStaticMarkup(
      createElement(MorningCompletionView, {
        overview: {
          ...completion(),
          status: MORNING_COMPLETION_STATUS.workBlockStarted,
          canStartWorkBlock: false,
          finishedAt: new Date('2026-08-23T07:47:00.000+09:00'),
        },
        history: history(),
        view: 'summary',
        period: 7,
        busy: false,
        error: null,
        onStartWorkBlock: () => undefined,
        onViewChange: () => undefined,
        onPeriodChange: () => undefined,
        onRetry: () => undefined,
      }),
    );

    expect(markup).toContain('Переход к работе зафиксирован');
    expect(markup).toContain('Результаты утра сохранены.');
    expect(markup).not.toContain('Утренний цикл');
    expect(markup).not.toContain('morning-completion-cta');
    expect(markup).not.toContain('← Утренний центр');
  });

  it('показывает объяснимую историю и 7/30-дневный период', () => {
    const markup = renderToStaticMarkup(
      createElement(MorningCompletionView, {
        overview: completion(),
        history: history(),
        view: 'history',
        period: 7,
        busy: false,
        error: null,
        onStartWorkBlock: () => undefined,
        onViewChange: () => undefined,
        onPeriodChange: () => undefined,
        onRetry: () => undefined,
      }),
    );

    expect(markup).toContain('Последние утра');
    expect(markup).toContain('История утра');
    expect(markup).toContain('7 дней');
    expect(markup).toContain('30 дней');
    expect(markup).toContain('Средняя длительность обычного утра');
    expect(markup).toContain('30 мин');
    expect(markup).toContain('Подготовить релиз');
    expect(markup).not.toMatch(/MorningCycle|MOR-\d+|lifecycle|гигиен|одежд|фраз/i);
  });

  it('показывает понятную пустую историю без технических нулевых отношений', () => {
    const emptyHistory: MorningHistoryOverview = {
      items: [],
      periods: {
        sevenDays: emptyPeriod(),
        thirtyDays: emptyPeriod(),
      },
    };
    const markup = renderToStaticMarkup(
      createElement(MorningCompletionView, {
        overview: completion(),
        history: emptyHistory,
        view: 'history',
        period: 7,
        busy: false,
        error: null,
        onStartWorkBlock: () => undefined,
        onViewChange: () => undefined,
        onPeriodChange: () => undefined,
        onRetry: () => undefined,
      }),
    );

    expect(markup).toContain('История появится после первого завершённого утра.');
    expect(markup).not.toContain('0 из 0');
    expect(markup).not.toContain('Фактические MorningCycle');
  });
});

describe('formatMorningPhysicalSummary', () => {
  it('не выдумывает отсутствующие метрики', () => {
    expect(
      formatMorningPhysicalSummary({
        completed: true,
        skipped: false,
        exerciseCount: 1,
        completedSets: 2,
        totalRepetitions: 0,
        totalDurationSeconds: 60,
        sessionDurationMs: 4 * 60_000,
      }),
    ).toBe('1 упражнение · 2 подхода · 60 сек · 4 мин');
  });

  it('не округляет положительную короткую сессию до нуля', () => {
    expect(
      formatMorningPhysicalSummary({
        completed: true,
        skipped: false,
        exerciseCount: 1,
        completedSets: 1,
        totalRepetitions: 10,
        totalDurationSeconds: 0,
        sessionDurationMs: 10_000,
      }),
    ).toBe('1 упражнение · 1 подход · 10 повторений · < 1 мин');
  });
});

function completion(): MorningCompletionOverview {
  return {
    date: DayDate.create('2026-08-23'),
    status: MORNING_COMPLETION_STATUS.ready,
    canStartWorkBlock: true,
    startedAt: new Date('2026-08-23T07:12:00.000+09:00'),
    completedAt: new Date('2026-08-23T07:47:00.000+09:00'),
    finishedAt: null,
    durationMs: 35 * 60_000,
    shortened: false,
    quickStart: { waterCompleted: true, coldShower: 'completed' },
    physical: {
      completed: true,
      skipped: false,
      exerciseCount: 2,
      completedSets: 6,
      totalRepetitions: 60,
      totalDurationSeconds: 45,
      sessionDurationMs: 12 * 60_000,
    },
    mainAction: {
      title: 'Подготовить релиз',
      scheduledTime: '08:00–09:30',
      expectedResult: 'Стабильная сборка',
      firstStepTitle: 'Проверить critical path',
      status: 'ready',
    },
  };
}

function history(): MorningHistoryOverview {
  return {
    items: [
      {
        date: DayDate.create('2026-08-23'),
        lifecycleState: 'FINISHED',
        startedAt: new Date('2026-08-23T07:12:00.000+09:00'),
        finishedAt: new Date('2026-08-23T07:47:00.000+09:00'),
        durationMs: 35 * 60_000,
        shortened: false,
        waterCompleted: true,
        coldShower: 'completed',
        physical: completion().physical,
        mainActionTitle: 'Подготовить релиз',
        mainActionSkipped: false,
      },
    ],
    periods: {
      sevenDays: {
        completedMornings: 1,
        averageNormalMorningDurationMs: 30 * 60_000,
        waterCompletedMornings: 1,
        coldShowerCompletedMornings: 1,
        physicallyActiveMornings: 1,
        averagePhysicalSessionDurationMs: 12 * 60_000,
      },
      thirtyDays: {
        completedMornings: 1,
        averageNormalMorningDurationMs: 30 * 60_000,
        waterCompletedMornings: 1,
        coldShowerCompletedMornings: 1,
        physicallyActiveMornings: 1,
        averagePhysicalSessionDurationMs: 12 * 60_000,
      },
    },
  };
}

function emptyPeriod(): MorningHistoryOverview['periods']['sevenDays'] {
  return {
    completedMornings: 0,
    averageNormalMorningDurationMs: null,
    waterCompletedMornings: 0,
    coldShowerCompletedMornings: 0,
    physicallyActiveMornings: 0,
    averagePhysicalSessionDurationMs: null,
  };
}
