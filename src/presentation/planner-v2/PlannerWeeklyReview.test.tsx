import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EntityId, Goal } from '../../domain';
import { buildWeeklyGoalReview } from '../../application/queries/GetWeeklyGoalReview';
import { PlannerWeeklyReview } from './PlannerWeeklyReview';
import type { PlanningState } from '../../application/ports/PlanningRepository';

describe('weekly review rendering', () => {
  it('distinguishes missing measurements and an empty result week, showing current goals', () => {
    const state: PlanningState = {
      goals: [
        Goal.create({
          id: EntityId.create('g'),
          title: 'Портфолио',
          status: 'active',
          now: new Date(),
        }),
      ],
      actions: [],
      periods: [],
      memberships: [],
      decisions: [],
      links: [],
      contributions: [],
      rules: [],
      legacyFocus: [],
      journal: [],
    };
    const html = renderToStaticMarkup(
      createElement(PlannerWeeklyReview, {
        review: buildWeeklyGoalReview(state, '2026-09-27'),
        today: '2026-09-27',
        busy: false,
        onWeek: vi.fn(),
        onOpenGoal: vi.fn(),
        onOpenAction: vi.fn(),
        onPlan: vi.fn(),
        onSelectStep: vi.fn(),
        onCreateStep: vi.fn(),
      }),
    );
    expect(html).toContain('Активные цели сейчас');
    expect(html).toContain('Без измерения');
    expect(html).toContain('За неделю нет записей результата');
    expect(html).not.toContain('0%');
    expect(html).toContain('Портфолио');
    expect(html).toContain('Итоги недели');
    expect(html).toContain('Следующий шаг не выбран');
    expect(html).toContain('Создать связанное действие');
    expect(html).toContain('Следующий шаг');
  });
});
