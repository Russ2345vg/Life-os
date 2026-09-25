import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DayDate, EntityId, Goal, LifeAction, LifeActionTitle } from '../../domain';
import type { AccountSync } from '../../application';
import { PlannerInbox } from './PlannerInbox';
import { PlannerGoalList } from './PlannerGoalList';
import { PlannerFocus } from './PlannerFocus';
import { PlannerActionList } from './PlannerActionList';
import { focusPeriod, focusWeek } from '../../domain/planner/FocusPeriod';
import { PlannerWorkspace, type PlannerServices } from './PlannerWorkspace';
const now = new Date('2026-09-13T10:00:00Z');
const goal = Goal.create({
  id: EntityId.create('g'),
  title: 'Учиться',
  status: 'active',
  achievementCriteria: 'Читать свободно',
  now,
}).selectNextAction(EntityId.create('a'), now);
const action = LifeAction.createDraft({
  id: EntityId.create('a'),
  title: LifeActionTitle.create('Прочитать главу'),
  goalId: goal.id,
  createdAt: now,
  eventId: EntityId.create('e'),
});
describe('current library rendering', () => {
  it('renders the account route before planner data is available', () => {
    const accountSync = {
      load: async () => ({
        state: 'local_anonymous' as const,
        email: null,
        connection: 'local' as const,
        recoveryMaterial: null,
        pendingMutations: 0,
        syncState: 'idle',
        lastSuccessfulSyncAt: null,
        conflicts: 0,
        devices: [],
      }),
    } as unknown as AccountSync;
    const html = renderToStaticMarkup(
      createElement(PlannerWorkspace, {
        services: { accountSync } as PlannerServices,
        route: { view: 'account' },
        currentDate: DayDate.create('2026-09-22'),
        onNavigate: () => undefined,
      }),
    );

    expect(html).toContain('Аккаунт и синхронизация');
    expect(html).toContain('Загружаем состояние аккаунта');
    expect(html).not.toContain('Повторить загрузку');
  });

  it('shows the explicitly selected next action consistently in the goal list', () => {
    const next = LifeAction.createDraft({
      id: EntityId.create('next'),
      title: LifeActionTitle.create('Выбранный шаг'),
      goalId: goal.id,
      createdAt: now,
      eventId: EntityId.create('next-event'),
    });
    const selectedGoal = goal.selectNextAction(next.id, now);
    const html = renderToStaticMarkup(
      createElement(PlannerGoalList, {
        today: '2026-09-14',
        goals: [selectedGoal],
        actions: [action, next],
        directions: [],
        spheres: [],
        focusIds: ['g'],
      }),
    );
    expect(html).toContain('Выбранный шаг');
    expect(html).toContain('В фокусе');
  });
  it('offers title-only capture with voice and an empty state', () => {
    const html = renderToStaticMarkup(
      createElement(PlannerInbox, {
        ideas: [],
        busy: false,
        onCapture: async () => {},
        onConvert: () => {},
        onArchive: () => {},
      }),
    );
    expect(html).toContain('Новая мысль');
    expect(html).toContain('aria-controls="inbox-title"');
    expect(html).toContain('Всё разобрано');
    expect(html).not.toContain('<select');
  });
  it('shows an unassigned Goal, one filter button, no fabricated progress', () => {
    const html = renderToStaticMarkup(
      createElement(PlannerGoalList, {
        today: '2026-09-14',
        goals: [goal],
        actions: [action],
        directions: [],
        spheres: [],
        focusIds: [],
      }),
    );
    expect(html).toContain('Учиться');
    expect(html).toContain('Фильтр');
    expect(html).toContain('Прочитать главу');
    expect(html).not.toContain('<progress');
  });
  it('shows a horizontal focus selector, outcome, checkbox and collapsed outside block', () => {
    const period = focusPeriod({
      ...focusWeek('2026-09-13'),
      goals: [{ goalId: 'g', role: 'primary' }],
      updatedAt: now.toISOString(),
      version: 1,
      schemaVersion: 1,
    });
    const html = renderToStaticMarkup(
      createElement(PlannerFocus, {
        goals: [goal],
        actions: [action],
        directions: [],
        spheres: [],
        period,
        today: '2026-09-13',
        busy: true,
        onRole: () => {},
        onComplete: () => {},
        onNewAction: () => {},
      }),
    );
    expect(html).toContain('planner-focus-strip');
    expect(html).toContain('Читать свободно');
    expect(html).toContain('Следующий шаг');
    expect(html).toContain('Не в фокусе сейчас');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('Начать');
  });
  it('renders an action without dates or parent and no session controls', () => {
    const html = renderToStaticMarkup(
      createElement(PlannerActionList, {
        actions: [action],
        goals: [goal],
        today: '2026-09-13',
        selectedId: null,
        busy: false,
        onNew: () => {},
        onComplete: () => {},
        onPlan: async () => {},
        onLink: async () => {},
      }),
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('aria-label="Показать действия"');
    expect(html).toContain('Без даты');
    expect(html).toContain('Выполнить: Прочитать главу');
    expect(html).not.toContain('Начать');
  });
});
