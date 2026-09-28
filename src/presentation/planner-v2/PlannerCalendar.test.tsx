import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DayDate } from '../../domain';
import { createLifeActionDraft } from '../../test/helpers/LifeActionTestFactory';
import { buildPlannerViews } from './plannerViewsModel';
import { PlannerCalendar } from './PlannerCalendar';

describe('PlannerCalendar time view', () => {
  it('shows an hourly week, untimed work and honest unknown capacity', () => {
    const timed = createLifeActionDraft('timed');
    timed.setPlan(DayDate.create('2026-09-28'), false);
    timed.setTimePlanning({
      estimateMinutes: 90,
      scheduledStartMinute: 600,
      scheduledDurationMinutes: 60,
    });
    const untimed = createLifeActionDraft('untimed');
    untimed.setPlan(DayDate.create('2026-09-28'), false);
    const data = buildPlannerViews({
      goals: [],
      actions: [timed, untimed],
      directions: [],
      spheres: [],
    });
    const html = renderToStaticMarkup(
      createElement(PlannerCalendar, {
        data,
        today: '2026-09-28',
        busy: false,
        onComplete: vi.fn(),
        onPlan: async () => {},
        onLink: async () => {},
        onGoalStatus: async () => {},
        onGoalDirection: async () => {},
        onGoalNextAction: async () => {},
        onSetTime: async () => {},
        capacity: [null, null, null, null, null, null, null],
        onSetCapacity: async () => {},
      }),
    );
    expect(html).toContain('Расписание недели');
    expect(html).toContain('Пока без времени');
    expect(html).toContain('Доступное время не задано');
    expect(html).toContain('Выбрать время');
    expect(html).toContain('10:00');
    expect(html).not.toContain('из 6 доступных часов');
  });
});
