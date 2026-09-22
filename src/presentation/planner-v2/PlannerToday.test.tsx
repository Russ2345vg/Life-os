import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DayDate } from '../../domain';
import { PlannerToday } from './PlannerToday';

describe('Planner Today', () => {
  it('renders an optional main, collapsed completed and an accessible quick add', () => {
    const html = renderToStaticMarkup(
      createElement(PlannerToday, {
        date: DayDate.create('2026-09-13'),
        day: 'today',
        overview: { main: null, actions: [], unscheduled: [], completed: [] },
        goals: [],
        availableActions: [],
        mainDirectionId: null,
        directionChoices: [],
        busy: false,
        onSelectDay: vi.fn(),
        onOpenAction: vi.fn(),
        onMainDirection: vi.fn(),
        onComplete: vi.fn(),
        onPlan: vi.fn(),
        onQuickAdd: async () => {},
        onNewAction: vi.fn(),
        onOpenSleep: vi.fn(),
      }),
    );
    expect(html).toContain('Сегодня');
    expect(html).toContain('aria-label="Новое действие на сегодня"');
    expect(html).toContain('Выполнено');
    expect(html).not.toContain('<details open');
    expect(html).not.toContain('Начать');
    expect(html).not.toContain('Главное действие');
    expect(html).toContain('Подготовка ко сну');
    expect(html).toContain('Прогресс дня');
    expect(html).toContain('planner-today-sidebar');
  });
});
