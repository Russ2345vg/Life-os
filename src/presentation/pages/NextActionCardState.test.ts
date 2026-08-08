import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DayDate } from '../../domain';
import { createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import {
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import { NextActionCard } from './NextActionCard';
import { resolveNextActionCardState } from './NextActionCardState';

const DATE = DayDate.create('2026-08-05');

describe('NextActionCardState', () => {
  it('показывает связанное решение, ожидаемый результат и состояние действия', () => {
    const decision = createPlannedDecision('next-decision', DATE);
    const lifeAction = markLifeActionInProgress(
      createReadyLifeAction('next-action', DATE, { decisionId: decision.id }),
    );

    const state = resolveNextActionCardState({ lifeAction, decisions: [decision] });

    expect(state.decisionTitle).toBe('Решение next-decision');
    expect(state.statusLabel).toBe('В работе');
    expect(state.lifeAction.expectedResult?.toString()).toBe('Результат next-action');
  });

  it('остаётся информационной карточкой без команды запуска', () => {
    const lifeAction = createReadyLifeAction('next-markup', DATE);
    const state = resolveNextActionCardState({ lifeAction, decisions: [] });
    const markup = renderToStaticMarkup(createElement(NextActionCard, { state }));

    expect(markup).toContain('Следующее действие');
    expect(markup).toContain('next-markup');
    expect(markup).toContain('Ожидаемый результат');
    expect(markup).toContain('Это предварительная подсказка');
    expect(markup).not.toContain('<button');
    expect(markup).not.toContain('Начать сессию');
  });

  it('показывает компактное пустое состояние без случайной подстановки действия', () => {
    const markup = renderToStaticMarkup(createElement(NextActionCard, { state: null }));

    expect(markup).toContain('Следующее действие');
    expect(markup).toContain('продолжение пока не запланировано');
    expect(markup).not.toContain('<button');
  });
});
