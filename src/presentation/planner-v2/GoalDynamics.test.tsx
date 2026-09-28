import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EntityId, Goal } from '../../domain';
import type { ProgressContribution } from '../../domain/planner/ProgressContribution';
import { buildGoalDynamics } from '../../application/queries/GetGoalDynamics';
import { GoalDynamics } from './GoalDynamics';

describe('goal dynamics rendering', () => {
  it('shows an unknown-only day without a numeric zero or a fabricated chart', () => {
    const goal = Goal.create({
      id: EntityId.create('g'),
      title: 'Книги',
      now: new Date(),
      measurement: {
        mode: 'count',
        target: 12,
        unit: 'книги',
        start: null,
        direction: 'at_least',
        cycle: null,
      },
    });
    const fact: ProgressContribution = {
      id: 'pending',
      goalId: 'g',
      amount: null,
      source: 'manual',
      effectiveDate: '2026-09-25',
      occurredAt: '2026-09-25T12:00:00Z',
      updatedAt: '2026-09-25T12:00:00Z',
      actionId: null,
      completionKey: null,
      linkId: null,
      voided: false,
      reason: 'Запись результата',
      version: 1,
      schemaVersion: 1,
    };
    const model = buildGoalDynamics(
      { goals: [goal], actions: [], contributions: [fact] },
      'g',
      '2026-09-27',
    )!;
    const html = renderToStaticMarkup(createElement(GoalDynamics, { model }));
    expect(html).toContain('Результат дня не указан');
    expect(html).not.toContain('известные изменения: 0');
    expect(html).not.toContain('<svg');
    expect(html).toContain('Неуказанных результатов: 1');
  });
  it('keeps a qualitative empty goal free of graphs and fake percentages', () => {
    const goal = Goal.create({ id: EntityId.create('g'), title: 'Портфолио', now: new Date() });
    const model = buildGoalDynamics(
      { goals: [goal], actions: [], contributions: [] },
      'g',
      '2026-09-27',
    )!;
    const html = renderToStaticMarkup(createElement(GoalDynamics, { model }));
    expect(html).toContain('Выполненные шаги за 30 дней');
    expect(html).toContain('Нет записей и выполнений');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('%');
  });
});
