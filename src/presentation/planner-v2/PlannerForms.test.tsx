import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PlannerActionForm } from './PlannerActionForm';
import { PlannerGoalForm } from './PlannerGoalForm';

describe('Planner UI forms', () => {
  it('keeps the Goal fixed when creating from its card', () => {
    const html = renderToStaticMarkup(
      createElement(PlannerActionForm, {
        goals: [{ id: 'g', title: 'Цель' }],
        initialGoalId: 'g',
        lockGoal: true,
        onSubmit: async () => {},
        onCancel: () => {},
        currentDate: '2026-09-13',
      }),
    );
    expect(html).toContain('type="hidden" name="goalId" value="g"');
    expect(html).not.toContain('<select name="goalId"');
  });
  it('does not visually disguise an unavailable prefilled goal as an unassigned action', () => {
    const html = renderToStaticMarkup(
      createElement(PlannerActionForm, {
        goals: [],
        initialGoalId: 'archived-goal',
        onSubmit: async () => {},
        onCancel: () => {},
        currentDate: '2026-09-13',
      }),
    );
    expect(html).toContain('Цель недоступна');
    expect(html).toContain('Выберите другую цель или «Без цели»');
  });
  it('renders optional selectors and a microphone next to editable text', () => {
    const action = renderToStaticMarkup(
      createElement(PlannerActionForm, {
        goals: [],
        onSubmit: async () => {},
        onCancel: () => {},
        currentDate: '2026-09-13',
      }),
    );
    const goal = renderToStaticMarkup(
      createElement(PlannerGoalForm, {
        directions: [],
        onSubmit: async () => {},
        onCancel: () => {},
      }),
    );
    expect(action).toContain('Название');
    expect(action).toContain('Без цели');
    expect(action).toContain('type="date"');
    expect(action).toContain('Дополнительно');
    expect(action).toContain('aria-controls="planner-action-title"');
    expect(action).not.toContain('name="date" required');
    expect(goal).toContain('Можно выбрать позже');
    expect(goal).toContain('Желаемый результат');
    expect(goal).toContain('aria-controls="planner-goal-title"');
    expect(goal).not.toContain('Шаг 1');
  });
});
