import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DayDate } from '../../domain';
import { createPlannedDecision, decisionId } from '../../test/helpers/DecisionTestFactory';
import { DecisionDeleteConfirmation, DecisionTrashPanel } from './DecisionTrashPanel';

const DATE = DayDate.create('2026-08-06');

function deletedDecision() {
  const decision = createPlannedDecision('trash-ui', DATE);
  decision.softDelete(
    new Date('2026-08-06T20:00:00.000+09:00'),
    decisionId('trash-ui-delete-event'),
  );
  return decision;
}

describe('DecisionTrashPanel', () => {
  it('показывает удалённое решение, дату удаления и восстановление', () => {
    const html = renderToStaticMarkup(
      createElement(DecisionTrashPanel, {
        decisions: [deletedDecision()],
        restoringDecisionId: null,
        error: null,
        onOpenDecision: vi.fn(),
        onRestoreDecision: vi.fn(),
        onRetry: vi.fn(),
      }),
    );

    expect(html).toContain('Корзина решений');
    expect(html).toContain('Решение trash-ui');
    expect(html).toContain('Удалено');
    expect(html).toContain('Восстановить');
    expect(html).toContain('рабочими сессиями');
  });

  it('показывает безопасное пустое состояние', () => {
    const html = renderToStaticMarkup(
      createElement(DecisionTrashPanel, {
        decisions: [],
        restoringDecisionId: null,
        error: null,
        onOpenDecision: vi.fn(),
        onRestoreDecision: vi.fn(),
        onRetry: vi.fn(),
      }),
    );

    expect(html).toContain('Корзина пуста');
  });

  it('подтверждение объясняет мягкое удаление и сохранность данных', () => {
    const html = renderToStaticMarkup(
      createElement(DecisionDeleteConfirmation, {
        decision: createPlannedDecision('confirm-delete', DATE),
        deleting: false,
        error: null,
        onCancel: vi.fn(),
        onConfirm: vi.fn(),
      }),
    );

    expect(html).toContain('Переместить решение в корзину?');
    expect(html).toContain('сессии и результаты останутся без изменений');
    expect(html).toContain('Переместить в корзину');
  });
});
