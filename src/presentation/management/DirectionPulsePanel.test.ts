import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DayDate } from '../../domain';
import { DirectionPulsePanel } from './DirectionsSection';

describe('DirectionPulsePanel', () => {
  it('renders pulse facts and selected-period dynamics without percentages or KPI', () => {
    const markup = renderToStaticMarkup(
      createElement(DirectionPulsePanel, {
        pulse: {
          operationalState: 'moving',
          activeProjectCount: 2,
          pausedProjectCount: 1,
          completedProjectCount: 3,
          activeDecisionCount: 4,
          unfinishedActionCount: 5,
          completedActionCount: 6,
          completedSessionCount: 7,
          totalActualTimeMs: 8 * 60 * 60_000 + 30 * 60_000,
          lastRealMovementAt: new Date('2026-08-10T08:00:00.000Z'),
          dynamics: {
            periodDays: 7,
            startDate: DayDate.create('2026-08-04'),
            endDate: DayDate.create('2026-08-10'),
            completedActionCount: 2,
            completedSessionCount: 3,
            actualTimeMs: 90 * 60_000,
          },
        },
        onPeriodChange: vi.fn(),
      }),
    );

    expect(markup).toContain('Движение');
    expect(markup).toContain('Решения');
    expect(markup).toContain('Действия');
    expect(markup).toContain('Сессии');
    expect(markup).toContain('4</dd>');
    expect(markup).toContain('5 незавершённых');
    expect(markup).toContain('6 выполнено');
    expect(markup).toContain('8 ч 30 мин');
    expect(markup).toContain('<dd>7</dd>');
    expect(markup).toContain('Последнее движение');
    expect(markup).toContain('2 выполненных действий');
    expect(markup).toContain('3 сессий');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).not.toContain('%');
    expect(markup).not.toContain('KPI');
    expect(markup).not.toMatch(/Decisions|Actions|Sessions/);
  });
});
