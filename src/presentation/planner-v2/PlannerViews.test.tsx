import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DayDate, EntityId, Goal, LifeAction, LifeActionTitle } from '../../domain';
import { PlannerKanban } from './PlannerKanban';
import { PlannerCalendar } from './PlannerCalendar';
import { PlannerTree } from './PlannerTree';
import { buildPlannerViews } from './plannerViewsModel';
const now = new Date('2026-09-13T10:00:00Z');
const goal = Goal.create({
  id: EntityId.create('g'),
  title: 'Цель с длинным названием для компактного представления',
  now,
});
const action = LifeAction.createDraft({
  id: EntityId.create('a'),
  title: LifeActionTitle.create('Самостоятельное действие'),
  plannedDate: DayDate.create('2026-09-13'),
  createdAt: now,
  eventId: EntityId.create('e'),
});
const operations = {
  busy: false,
  onComplete: () => {},
  onPlan: async () => {},
  onLink: async () => {},
  onGoalStatus: async () => {},
  onGoalDirection: async () => {},
  onGoalNextAction: async () => {},
};
const data = buildPlannerViews({ goals: [goal], actions: [action], directions: [], spheres: [] });
describe('V2 views rendering', () => {
  it('renders both Kanban modes without inventing statuses or artificial progress', () => {
    const html = renderToStaticMarkup(
      createElement(PlannerKanban, { data, kind: 'goals', focusIds: [], ...operations }),
    );
    expect(html).toContain(goal.title);
    expect(html).toContain('data-goal-id="g"');
    expect(html).toContain('data-goal-status="active"');
    expect(html).toContain('draggable="true"');
    expect(html).toContain('Изменить цель');
    expect(html).toContain('#/v2/goals/g');
    expect(html).toContain('На паузе');
    expect(html).not.toContain('<progress');
    expect(html).not.toContain('На проверке');
    const actions = renderToStaticMarkup(
      createElement(PlannerKanban, { data, kind: 'actions', focusIds: [], ...operations }),
    );
    expect(actions).toContain('Выполнить: Самостоятельное действие');
    expect(actions).toContain('Запланировано');
    expect(actions).not.toContain('Начать');
  });
  it('keeps archived Goals visible but not draggable', () => {
    const archived = goal.archive(now);
    const archivedData = buildPlannerViews({
      goals: [archived],
      actions: [],
      directions: [],
      spheres: [],
    });
    const html = renderToStaticMarkup(
      createElement(PlannerKanban, {
        data: archivedData,
        kind: 'goals',
        focusIds: [],
        ...operations,
      }),
    );
    expect(html).toContain('data-goal-status="archived"');
    expect(html).toContain('draggable="false"');
  });
  it('renders a month, selected day, undated goals, and completed controls', () => {
    const html = renderToStaticMarkup(
      createElement(PlannerCalendar, { data, today: '2026-09-13', ...operations }),
    );
    expect(html).toContain('сентябрь 2026');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Без даты');
    expect(html).toContain('Самостоятельное действие');
    action.complete(null, now, EntityId.create('complete'));
    const completed = renderToStaticMarkup(
      createElement(PlannerCalendar, { data, today: '2026-09-13', ...operations }),
    );
    expect(completed).toContain('checked=""');
    expect(completed).toContain('Выполнено');
  });
  it('renders orphan groups as accessible disclosure controls without changing data', () => {
    const version = action.version;
    const html = renderToStaticMarkup(createElement(PlannerTree, { data, ...operations }));
    expect(html).toContain('Без направления');
    expect(html).toContain('Без цели');
    expect(html).toContain('aria-expanded="false"');
    expect(action.version).toBe(version);
  });
  it('provides empty guidance in every view', () => {
    const empty = buildPlannerViews({ goals: [], actions: [], directions: [], spheres: [] });
    for (const component of [
      createElement(PlannerKanban, { data: empty, kind: 'goals', focusIds: [], ...operations }),
      createElement(PlannerCalendar, { data: empty, today: '2026-09-13', ...operations }),
      createElement(PlannerTree, { data: empty, ...operations }),
    ])
      expect(renderToStaticMarkup(component)).toContain('Добавить');
  });
});
