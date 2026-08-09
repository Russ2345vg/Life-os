import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ACTION_LIST_GROUP, type ActionListItem } from '../../application';
import { DayDate, EntityId, Sphere } from '../../domain';
import { createReadyLifeAction } from '../../test/helpers/LifeActionTestFactory';
import {
  ACTION_DURATION_FILTER,
  ACTION_RESULT_FILTER,
  DEFAULT_ACTION_LIST_FILTERS,
} from '../actionListFilters';
import { ActionFiltersPanel } from './ActionsPage';

const CURRENT_DATE = DayDate.create('2026-08-07');
const OTHER_DATE = DayDate.create('2026-08-08');

describe('ActionFiltersPanel', () => {
  it('показывает все шесть измерений фильтра и доступные значения из снимка', () => {
    const action = createReadyLifeAction('filter-action', CURRENT_DATE, {
      decisionId: EntityId.create('decision-filter'),
    });
    const item: ActionListItem = {
      lifeAction: action,
      decisionTitle: 'Развить продукт',
      sphereId: 'sphere-work',
      sessions: [],
      unfinishedSession: null,
      group: ACTION_LIST_GROUP.ready,
      completedSessionCount: 0,
      totalWorkedDurationMs: 0,
    };

    const markup = renderToStaticMarkup(
      createElement(ActionFiltersPanel, {
        currentDate: CURRENT_DATE,
        selectedDate: CURRENT_DATE,
        items: [item],
        spheres: {
          active: [
            Sphere.create({
              id: EntityId.create('sphere-work'),
              name: 'Работа',
              now: new Date('2026-08-07T00:00:00.000Z'),
            }),
          ],
          archived: [],
        },
        filters: DEFAULT_ACTION_LIST_FILTERS,
        onDateChange: vi.fn(),
        onFiltersChange: vi.fn(),
        onReset: vi.fn(),
      }),
    );

    expect(markup).toContain('Фильтры действий');
    expect(markup).toContain('type="date"');
    expect(markup).toContain('Сфера');
    expect(markup).toContain('Работа');
    expect(markup).toContain('Решение');
    expect(markup).toContain('Развить продукт');
    expect(markup).toContain('Состояние');
    expect(markup).toContain('Рабочее время');
    expect(markup).toContain('Фактический результат');
    expect(markup).toContain('Сбросить фильтры');
  });

  it('показывает число активных фильтров вместе с выбранной другой датой', () => {
    const markup = renderToStaticMarkup(
      createElement(ActionFiltersPanel, {
        currentDate: CURRENT_DATE,
        selectedDate: OTHER_DATE,
        items: [],
        filters: {
          ...DEFAULT_ACTION_LIST_FILTERS,
          group: ACTION_LIST_GROUP.completed,
          duration: ACTION_DURATION_FILTER.over120,
          result: ACTION_RESULT_FILTER.withResult,
        },
        onDateChange: vi.fn(),
        onFiltersChange: vi.fn(),
        onReset: vi.fn(),
      }),
    );

    expect(markup).toContain('Активно фильтров: 4');
  });
});
