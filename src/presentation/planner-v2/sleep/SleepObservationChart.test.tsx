import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  confirmSleepObservation,
  createWakeObservationDraft,
  type SleepObservation,
  setSleepMorningFeedback,
} from '../../../domain/sleep/SleepObservation';
import type { NightCycle } from '../../../domain/sleep/SleepSchedule';
import { SleepObservationChart } from './SleepObservationChart';
import { selectSleepChartDays } from './sleepObservationChartModel';

describe('SleepObservationChart', () => {
  it('shows subjective feedback for a no-times night without drawing factual sleep', () => {
    const rated = setSleepMorningFeedback(null, {
      id: 'feedback',
      cycleDate: '2026-10-03',
      nightCycleId: null,
      timeZone: 'Asia/Chita',
      patch: { sleepQuality: 'GOOD', energy: 'TIRED' },
      now: new Date('2026-10-04T01:00:00Z'),
    });
    const html = render({ observations: [rated] });
    expect(html).toContain('Качество сна: Хорошо');
    expect(html).toContain('Утром: Устал');
    expect(html).toContain('Время сна не записано');
    expect(html).not.toContain('sleep-observation-chart__fact');
    expect(html).not.toContain('Время в постели:');
  });
  it('renders explicit loading, error and empty states', () => {
    expect(render({ loading: true })).toContain('Загружаем наблюдения');
    expect(render({ error: 'История недоступна' })).toContain('role="alert"');
    expect(render()).toContain('Нет записи');
    expect(render()).toContain('30 дней');
  });

  it('excludes drafts and renders plan, fact and time in bed as accessible text', () => {
    const confirmed = confirmedObservation('2026-10-03');
    const draft = createWakeObservationDraft({
      id: 'sleep-observation:2026-10-04',
      cycleDate: '2026-10-04',
      nightCycleId: 'night-2',
      wakeOccurrenceId: 'wake-2',
      wakeKind: 'QR',
      wokeAt: new Date('2026-10-05T00:00:00.000Z'),
      timeZone: 'Asia/Chita',
      now: new Date('2026-10-05T00:01:00.000Z'),
    });
    const html = render({ observations: [draft, confirmed], plans: [plan('2026-10-03')] });

    expect(html).toContain('7 дней');
    expect(html).toContain('30 дней');
    expect(html).toContain('Факт: 23:30–09:00');
    expect(html).toContain('План: 23:00–08:30');
    expect(html).toContain('Время в постели: 9 ч 30 мин');
    expect(html).toContain('Не подтверждено');
    expect(html.match(/Факт:/g) ?? []).toHaveLength(1);
    expect(html).toContain('<svg');
    expect(html).toContain('sleep-observation-chart__mobile');
  });

  it('selects 7 or 30 calendar nights including gaps and month boundaries', () => {
    const observations = Array.from({ length: 31 }, (_, index) =>
      confirmedObservation(`2026-10-${String(index + 1).padStart(2, '0')}`),
    );
    const days = selectSleepChartDays([observations[0]!, observations[30]!], 7, '2026-11-02');
    expect(days).toHaveLength(7);
    expect(days[0]?.cycleDate).toBe('2026-11-02');
    expect(days[0]?.observation).toBeNull();
    expect(days[2]?.observation?.cycleDate).toBe('2026-10-31');
    expect(days[6]?.cycleDate).toBe('2026-10-27');
    expect(selectSleepChartDays(observations, 30, '2026-10-31')).toHaveLength(30);
    expect(selectSleepChartDays(observations, 7, '2026-10-03')[0]?.observation?.cycleDate).toBe(
      '2026-10-03',
    );
  });
});

function render(overrides: Partial<Parameters<typeof SleepObservationChart>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(SleepObservationChart, {
      observations: [],
      plans: [],
      loading: false,
      error: null,
      endCycleDate: '2026-10-04',
      ...overrides,
    }),
  );
}

function confirmedObservation(cycleDate: string): SleepObservation {
  const day = Number(cycleDate.slice(-2));
  return confirmSleepObservation(null, {
    id: `sleep-observation:${cycleDate}`,
    cycleDate,
    nightCycleId: `night-${cycleDate}`,
    wentToBedAt: new Date(Date.UTC(2026, 9, day, 14, 30)),
    wokeAt: new Date(Date.UTC(2026, 9, day + 1, 0, 0)),
    timeZone: 'Asia/Chita',
    confirmedAt: new Date(Date.UTC(2026, 9, day + 1, 0, 5)),
  });
}

function plan(cycleDate: string): NightCycle {
  return {
    id: `night-${cycleDate}`,
    cycleDate,
    plannedSleepAt: new Date('2026-10-03T14:00:00.000Z'),
    plannedWakeAt: new Date('2026-10-03T23:30:00.000Z'),
    preparationItems: [],
    preparationCompletionKind: null,
    preparationCompletedAt: null,
    createdAt: new Date('2026-10-03T12:00:00.000Z'),
  };
}
