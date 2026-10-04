import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ActionActualResult,
  DayDate,
  EntityId,
  Goal,
  LifeAction,
  LifeActionTitle,
} from '../../domain';
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

  it('makes each dated action group an initially expanded disclosure', () => {
    const html = renderToStaticMarkup(
      createElement(PlannerActionList, {
        actions: [
          action('today', 'Действие на сегодня', '2026-09-13'),
          LifeAction.createDraft({
            id: EntityId.create('later'),
            title: LifeActionTitle.create('Действие на потом'),
            plannedDate: DayDate.create('2026-10-13'),
            createdAt: now,
            eventId: EntityId.create('later-event'),
          }),
        ],
        goals: [goal],
        today: '2026-09-13',
        onNew: () => {},
        selectedId: null,
        ...operations,
      }),
    );

    expect(html).toMatch(/<details[^>]*open=""[^>]*><summary[^>]*>.*?Сегодня.*?<\/summary>/s);
    expect(html).toMatch(/<details[^>]*open=""[^>]*><summary[^>]*>.*?Позже.*?<\/summary>/s);
    expect(html).toContain('Действие на сегодня');
    expect(html).toContain('Действие на потом');
  });

  it('hides completed actions in the unassigned list', () => {
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

    expect(html).toContain('Активное действие');
    expect(html).not.toContain('Готово');
    expect(html).not.toContain('planner-action-group--completed');
  });

  it('exposes completed actions without opening filters and shows their saved result', () => {
    const completed = action('completed-with-result', 'Проверить настройки', '2026-09-13');
    completed.complete(
      ActionActualResult.create('Настройки проверены и сохранены.'),
      now,
      EntityId.create('completed-with-result-complete'),
    );
    const props = {
      actions: [completed],
      goals: [goal],
      today: '2026-09-13',
      onNew: () => {},
      selectedId: null,
      ...operations,
    };
    const openHtml = renderToStaticMarkup(createElement(PlannerActionList, props));
    expect(openHtml).toContain('Выполненные · 1');
    expect(openHtml).not.toContain('Настройки проверены и сохранены.');

    const completedHtml = renderToStaticMarkup(
      createElement(PlannerActionList, { ...props, initialView: 'completed' }),
    );
    expect(completedHtml).toContain('aria-pressed="true">Выполненные · 1');
    expect(completedHtml).toContain('Итог: Настройки проверены и сохранены.');
  });

  it('explains an empty completed history without calling it a filter', () => {
    const html = renderToStaticMarkup(
      createElement(PlannerActionList, {
        actions: [],
        goals: [],
        today: '2026-09-13',
        onNew: () => {},
        selectedId: null,
        initialView: 'completed',
        ...operations,
      }),
    );
    expect(html).toContain('Пока нет выполненных задач. После завершения они появятся здесь.');
    expect(html).not.toContain('Убрать фильтр: Выполненные');
    expect(html).not.toContain('Сбросить фильтры');
  });

  it('renders the selected action editor as an accessible disclosure card', () => {
    const html = renderToStaticMarkup(
      createElement(PlannerActionList, {
        actions: [action('detail', 'Разобрать заметки', '2026-09-13')],
        goals: [goal],
        today: '2026-09-13',
        onNew: () => {},
        selectedId: 'detail',
        ...operations,
        onEdit: async () => {},
      }),
    );

    expect(html).toContain('class="planner-action-edit planner-disclosure-card"');
    expect(html).toContain('class="planner-disclosure-card__summary"');
    expect(html).toContain('name="planner-action-panels"');
    expect(html).toContain('Название, потребность и описание');
    expect(html).not.toContain('<summary>Редактировать действие</summary>');
  });
});
