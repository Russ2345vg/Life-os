import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  confirmSleepObservation,
  createWakeObservationDraft,
  type SleepObservation,
} from '../../../domain/sleep/SleepObservation';
import type { NightCycle } from '../../../domain/sleep/SleepSchedule';
import { SleepObservationChart } from './SleepObservationChart';
import { selectChartObservations } from './sleepObservationChartModel';

describe('SleepObservationChart', () => {
  it('renders explicit loading, error and empty states', () => {
    expect(render({ loading: true })).toContain('Загружаем наблюдения');
    expect(render({ error: 'История недоступна' })).toContain('role="alert"');
    expect(render()).toContain('График появится после первой подтверждённой ночи');
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
    expect(html).not.toContain('2026-10-04');
    expect(html).toContain('<svg');
    expect(html).toContain('sleep-observation-chart__mobile');
  });

  it('selects the requested newest 7 or 30 confirmed nights', () => {
    const observations = Array.from({ length: 31 }, (_, index) =>
      confirmedObservation(`2026-10-${String(index + 1).padStart(2, '0')}`),
    );
    expect(selectChartObservations(observations, 7)).toHaveLength(7);
    expect(selectChartObservations(observations, 30)).toHaveLength(30);
    expect(selectChartObservations(observations, 7)[0]?.cycleDate).toBe('2026-10-31');
  });
});

function render(overrides: Partial<Parameters<typeof SleepObservationChart>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(SleepObservationChart, {
      observations: [],
      plans: [],
      loading: false,
      error: null,
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
