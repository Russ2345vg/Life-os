import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DayDate, DECISION_KIND, EntityId, Project } from '../../domain';
import { createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import { createReadyLifeAction } from '../../test/helpers/LifeActionTestFactory';
import { TodayActionNavigator } from './TodayActionNavigator';

const DATE = DayDate.create('2026-08-05');

function actions() {
  return [
    createReadyLifeAction('navigator-first', DATE),
    createReadyLifeAction('navigator-second', DATE),
    createReadyLifeAction('navigator-third', DATE),
  ];
}

describe('TodayActionNavigator', () => {
  it('показывает стрелки, позицию и только следующие действия', () => {
    const markup = renderToStaticMarkup(
      createElement(TodayActionNavigator, {
        lifeActions: actions(),
        currentLifeActionIndex: 1,
        isLockedBySession: false,
        isMutating: false,
        onSelect: vi.fn(),
      }),
    );

    expect(markup).toContain('2 из 3');
    expect(markup).toContain('Показать предыдущее действие');
    expect(markup).toContain('Показать следующее действие');
    expect(markup).toContain('Следующие Действия');
    expect(markup).not.toContain('navigator-first');
    expect(markup).not.toContain('navigator-second');
    expect(markup).toContain('navigator-third');
  });

  it('блокирует переходы к другим действиям при активной или приостановленной сессии', () => {
    const markup = renderToStaticMarkup(
      createElement(TodayActionNavigator, {
        lifeActions: actions(),
        currentLifeActionIndex: 0,
        isLockedBySession: true,
        isMutating: false,
        onSelect: vi.fn(),
      }),
    );

    expect(markup).toContain('Выбор другого действия доступен после завершения');
    expect(markup.match(/disabled=""/g)).toHaveLength(4);
  });

  it('отключает стрелки на границах списка', () => {
    const firstMarkup = renderToStaticMarkup(
      createElement(TodayActionNavigator, {
        lifeActions: actions(),
        currentLifeActionIndex: 0,
        isLockedBySession: false,
        isMutating: false,
        onSelect: vi.fn(),
      }),
    );
    const lastMarkup = renderToStaticMarkup(
      createElement(TodayActionNavigator, {
        lifeActions: actions(),
        currentLifeActionIndex: 2,
        isLockedBySession: false,
        isMutating: false,
        onSelect: vi.fn(),
      }),
    );

    expect(firstMarkup).toContain('aria-label="Показать предыдущее действие" disabled=""');
    expect(lastMarkup).toContain('aria-label="Показать следующее действие" disabled=""');
  });

  it('показывает Project-контекст связанного следующего действия', () => {
    const project = Project.create({
      id: EntityId.create('navigator-project'),
      title: 'Контекст проекта',
      now: new Date('2026-08-05T08:00:00.000+09:00'),
    });
    const decision = createPlannedDecision(
      'navigator-project-decision',
      DATE,
      DECISION_KIND.main,
      1,
      project.id,
    );
    const lifeActions = [
      createReadyLifeAction('navigator-current', DATE),
      createReadyLifeAction('navigator-project-action', DATE, { decisionId: decision.id }),
    ];

    const markup = renderToStaticMarkup(
      createElement(TodayActionNavigator, {
        lifeActions,
        currentLifeActionIndex: 0,
        isLockedBySession: false,
        isMutating: false,
        decisions: [decision],
        projects: [project],
        onOpenProject: vi.fn(),
        onSelect: vi.fn(),
      }),
    );

    expect(markup).toContain('Контекст проекта');
    expect(markup).toContain('today-action-project-link');
    expect(markup).toContain('aria-label="Выбрать действие');
  });
});
