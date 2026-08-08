import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DayDate } from '../../domain';
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
  it('показывает стрелки, счётчик, список и явное текущее действие', () => {
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
    expect(markup).toContain('navigator-first');
    expect(markup).toContain('navigator-second');
    expect(markup).toContain('navigator-third');
    expect(markup.match(/aria-current="true"/g)).toHaveLength(1);
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
});
