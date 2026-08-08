import { describe, expect, it } from 'vitest';
import { ACTION_LIST_GROUP, type ActionListItem } from '../application';
import { DayDate, EntityId } from '../domain';
import { completeLifeAction, createReadyLifeAction } from '../test/helpers/LifeActionTestFactory';
import {
  ACTION_DURATION_FILTER,
  ACTION_FILTER_ANY,
  ACTION_FILTER_NONE,
  ACTION_RESULT_FILTER,
  DEFAULT_ACTION_LIST_FILTERS,
  buildActionFilterOptions,
  countActiveActionFilters,
  filterActionListItems,
} from './actionListFilters';

const DATE = DayDate.create('2026-08-07');

describe('actionListFilters', () => {
  it('совмещает сферу, решение, состояние, длительность и наличие результата через AND', () => {
    const matching = item('match', ACTION_LIST_GROUP.completed, {
      decisionId: 'decision-money',
      decisionTitle: 'Увеличить доход',
      decisionSphere: 'Деньги',
      durationMs: 90 * 60_000,
      completed: true,
    });
    const wrongSphere = item('health', ACTION_LIST_GROUP.completed, {
      decisionId: 'decision-health',
      decisionTitle: 'Тренировка',
      decisionSphere: 'Здоровье',
      durationMs: 90 * 60_000,
      completed: true,
    });
    const noResult = item('ready', ACTION_LIST_GROUP.ready, {
      decisionId: 'decision-money',
      decisionTitle: 'Увеличить доход',
      decisionSphere: 'Деньги',
      durationMs: 90 * 60_000,
    });

    const filtered = filterActionListItems([matching, wrongSphere, noResult], {
      sphere: 'Деньги',
      decisionId: 'decision-money',
      group: ACTION_LIST_GROUP.completed,
      duration: ACTION_DURATION_FILTER.from60To120,
      result: ACTION_RESULT_FILTER.withResult,
    });

    expect(filtered.map((entry) => entry.lifeAction.id.toString())).toEqual(['match']);
  });

  it('поддерживает самостоятельные действия и решения без сферы', () => {
    const independent = item('independent', ACTION_LIST_GROUP.ready);
    const decisionWithoutSphere = item('decision-no-sphere', ACTION_LIST_GROUP.ready, {
      decisionId: 'decision-no-sphere-id',
      decisionTitle: 'Без сферы',
    });
    const withSphere = item('with-sphere', ACTION_LIST_GROUP.ready, {
      decisionId: 'decision-work',
      decisionTitle: 'Рабочее решение',
      decisionSphere: 'Работа',
    });

    expect(
      filterActionListItems([independent, decisionWithoutSphere, withSphere], {
        ...DEFAULT_ACTION_LIST_FILTERS,
        decisionId: ACTION_FILTER_NONE,
      }).map((entry) => entry.lifeAction.id.toString()),
    ).toEqual(['independent']);

    expect(
      filterActionListItems([independent, decisionWithoutSphere, withSphere], {
        ...DEFAULT_ACTION_LIST_FILTERS,
        sphere: ACTION_FILTER_NONE,
      }).map((entry) => entry.lifeAction.id.toString()),
    ).toEqual(['independent', 'decision-no-sphere']);
  });

  it('разделяет диапазоны рабочего времени без пересечений', () => {
    const items = [
      item('zero', ACTION_LIST_GROUP.ready, { durationMs: 0 }),
      item('short', ACTION_LIST_GROUP.ready, { durationMs: 29 * 60_000 }),
      item('medium', ACTION_LIST_GROUP.ready, { durationMs: 30 * 60_000 }),
      item('hour', ACTION_LIST_GROUP.ready, { durationMs: 60 * 60_000 }),
      item('long', ACTION_LIST_GROUP.ready, { durationMs: 120 * 60_000 }),
    ];

    const ids = (duration: (typeof ACTION_DURATION_FILTER)[keyof typeof ACTION_DURATION_FILTER]) =>
      filterActionListItems(items, { ...DEFAULT_ACTION_LIST_FILTERS, duration }).map((entry) =>
        entry.lifeAction.id.toString(),
      );

    expect(ids(ACTION_DURATION_FILTER.none)).toEqual(['zero']);
    expect(ids(ACTION_DURATION_FILTER.under30)).toEqual(['short']);
    expect(ids(ACTION_DURATION_FILTER.from30To60)).toEqual(['medium']);
    expect(ids(ACTION_DURATION_FILTER.from60To120)).toEqual(['hour']);
    expect(ids(ACTION_DURATION_FILTER.over120)).toEqual(['long']);
  });

  it('строит уникальные отсортированные варианты сфер и решений', () => {
    const options = buildActionFilterOptions([
      item('a', ACTION_LIST_GROUP.ready, {
        decisionId: 'd2',
        decisionTitle: 'Бета',
        decisionSphere: 'Работа',
      }),
      item('b', ACTION_LIST_GROUP.ready, {
        decisionId: 'd1',
        decisionTitle: 'Альфа',
        decisionSphere: 'Здоровье',
      }),
      item('c', ACTION_LIST_GROUP.ready),
    ]);

    expect(options.decisions.map((option) => option.label)).toEqual([
      'Альфа',
      'Бета',
      'Самостоятельные действия',
    ]);
    expect(options.spheres.map((option) => option.label)).toEqual([
      'Без сферы',
      'Здоровье',
      'Работа',
    ]);
  });

  it('считает только реально заданные фильтры', () => {
    expect(countActiveActionFilters(DEFAULT_ACTION_LIST_FILTERS)).toBe(0);
    expect(
      countActiveActionFilters({
        sphere: 'Работа',
        decisionId: ACTION_FILTER_ANY,
        group: ACTION_LIST_GROUP.ready,
        duration: ACTION_DURATION_FILTER.all,
        result: ACTION_RESULT_FILTER.withoutResult,
      }),
    ).toBe(3);
  });
});

interface ItemOptions {
  readonly decisionId?: string;
  readonly decisionTitle?: string;
  readonly decisionSphere?: string;
  readonly durationMs?: number;
  readonly completed?: boolean;
}

function item(
  id: string,
  group: ActionListItem['group'],
  options: ItemOptions = {},
): ActionListItem {
  const base = createReadyLifeAction(id, DATE, {
    ...(options.decisionId === undefined
      ? {}
      : { decisionId: EntityId.create(options.decisionId) }),
  });
  const lifeAction = options.completed === true ? completeLifeAction(base) : base;

  return {
    lifeAction,
    decisionTitle: options.decisionTitle ?? null,
    decisionSphere: options.decisionSphere ?? null,
    sessions: [],
    unfinishedSession: null,
    group,
    completedSessionCount: 0,
    totalWorkedDurationMs: options.durationMs ?? 0,
  };
}
