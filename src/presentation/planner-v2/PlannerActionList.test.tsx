import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DayDate, EntityId, Goal, LifeAction, LifeActionTitle } from '../../domain';
import { PlannerActionList } from './PlannerActionList';

const now = new Date('2026-09-13T10:00:00Z');
const goal = Goal.create({ id: EntityId.create('goal'), title: 'Здоровье', now });

function action(
  id: string,
  title: string,
  date: string | null,
  status: 'draft' | 'completed' = 'draft',
  goalId: EntityId | null = goal.id,
) {
  const value = LifeAction.createDraft({
    id: EntityId.create(id),
    title: LifeActionTitle.create(title),
    plannedDate: date ? DayDate.create(date) : null,
    goalId,
    createdAt: now,
    eventId: EntityId.create(`${id}-event`),
  });
  value.setPlanningMetadata({
    priority: 'high',
    occurrence: {
      ruleId: 'rule:daily',
      slot: id,
      ruleRevision: 1,
      originalDate: date ?? '2026-09-13',
    },
  });
  if (status === 'completed') value.complete(null, now, EntityId.create(`${id}-complete`));
  return value;
}

const operations = {
  busy: false,
  onComplete: () => {},
  onPlan: async () => {},
  onLink: async () => {},
};

describe('PlannerActionList', () => {
  it('shows one active row for a recurring series instead of every materialized occurrence', () => {
    const html = renderToStaticMarkup(
      createElement(PlannerActionList, {
        actions: [
          action('repeat-today', 'Повторяемое действие', '2026-09-13'),
          action('repeat-tomorrow', 'Повторяемое действие', '2026-09-14'),
        ],
        goals: [goal],
        today: '2026-09-13',
        onNew: () => {},
        selectedId: null,
        ...operations,
      }),
    );

    expect(html.match(/aria-label="Выполнить: Повторяемое действие"/g)).toHaveLength(1);
    expect(html).toContain('Сегодня');
    expect(html).not.toContain('Завтра <span>1</span>');
  });

  it('renders date groups and action metadata', () => {
    const html = renderToStaticMarkup(
      createElement(PlannerActionList, {
        actions: [action('today', 'Сегодняшнее действие', '2026-09-13')],
        goals: [goal],
        today: '2026-09-13',
        onNew: () => {},
        selectedId: null,
        ...operations,
      }),
    );

    expect(html).toContain('Сегодня');
    expect(html).toContain('Высокий приоритет');
    expect(html).toContain('Повтор');
    expect(html).not.toContain('Открыть и изменить');
  });

  it('keeps completed actions in a separate block from active actions', () => {
    const html = renderToStaticMarkup(
      createElement(PlannerActionList, {
        actions: [
          action('active', 'Активное действие', '2026-09-13', 'draft', null),
          action('completed', 'Готово', '2026-09-13', 'completed', null),
        ],
        goals: [],
        today: '2026-09-13',
        onNew: () => {},
        selectedId: null,
        initialView: 'unassigned',
        ...operations,
      }),
    );

    expect(html).toContain('Выполненные');
    const completedSection = html.indexOf('planner-action-group--completed');
    expect(completedSection).toBeGreaterThan(html.indexOf('Активное действие'));
    expect(completedSection).toBeLessThan(html.indexOf('Готово'));
  });
});
