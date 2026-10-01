import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TodayGoalGuidance } from '../../application/queries/GetTodayGoalGuidance';
import { PlannerGoalGuidance } from './PlannerGoalGuidance';

const callbacks = {
  onSelectGoal: vi.fn(),
  onSelectAction: vi.fn(),
  onPlan: vi.fn(),
  onOpenAction: vi.fn(),
  onOpenGoal: vi.fn(),
  onCreateAction: vi.fn(),
  onCreateGoal: vi.fn(),
  onRetry: vi.fn(),
  onClose: vi.fn(),
  onConfirm: vi.fn(),
};
const ready: TodayGoalGuidance = {
  status: 'ready',
  goals: [{ id: 'g', title: 'Цель', focused: true, nextProgress: null }],
  actions: [{ id: 'a', title: 'Шаг', status: 'draft', plannedDate: null }],
  goalId: 'g',
  actionId: 'a',
  goalTitle: 'Цель',
  actionTitle: 'Шаг',
  whyImportant: 'Для здоровья',
  nextProgress: null,
  goalReason: 'weekly-primary',
  actionReason: 'goal-next-action',
  actionVersion: 1,
  sourceKey: 'weekly-goal-next-step',
  plannedDate: null,
  estimateMinutes: 30,
  mainOnPreviousDate: false,
  cta: 'add-today',
};
const render = (guidance: TodayGoalGuidance | null, loading = false, error: string | null = null) =>
  renderToStaticMarkup(
    createElement(PlannerGoalGuidance, {
      guidance,
      loading,
      error,
      busy: false,
      needsConfirmation: false,
      ...callbacks,
    }),
  );

describe('PlannerGoalGuidance', () => {
  it('explains both explicit defaults and the add action', () => {
    const html = render(ready);
    expect(html).toContain('Главная цель этой недели');
    expect(html).toContain('Вы выбрали это действие следующим шагом цели');
    expect(html).toContain('Добавить на сегодня');
    expect(html).toContain('Для здоровья');
  });

  it('shows transfer implications before moving a previous main action', () => {
    const html = render({
      ...ready,
      plannedDate: '2026-10-03',
      mainOnPreviousDate: true,
      cta: 'move-today',
    });
    expect(html).toContain('Перенести на сегодня');
    expect(html).toContain('Сейчас запланировано');
    expect(html).toContain('главным делом');
  });

  it('blocks advice while stale and provides only a read retry', () => {
    const html = render(ready, false, 'Не удалось обновить данные');
    expect(html).toContain('Повторить загрузку');
    expect(html).not.toContain('Добавить на сегодня');
  });

  it('offers creation when no goals exist', () => {
    const html = render({
      status: 'empty',
      goals: [],
      actions: [],
      goalId: null,
      actionId: null,
      goalTitle: null,
      whyImportant: null,
      nextProgress: null,
    });
    expect(html).toContain('Создайте цель, чтобы выбрать шаг на сегодня');
    expect(html).toContain('Создать цель');
  });
});
