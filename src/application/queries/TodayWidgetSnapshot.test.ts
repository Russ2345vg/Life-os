import { describe, expect, it } from 'vitest';
import type { LifeAction } from '../../domain';
import { buildTodayWidgetSnapshot } from './TodayWidgetSnapshot';

const action = (title: string) => ({ title: { toString: () => title } }) as LifeAction;

describe('buildTodayWidgetSnapshot', () => {
  it('keeps the main action and at most three following actions', () => {
    expect(
      buildTodayWidgetSnapshot(
        '2026-10-05',
        { main: action('Главное'), actions: ['Раз', 'Два', 'Три', 'Четыре'].map(action) },
        123,
      ),
    ).toEqual({
      date: '2026-10-05',
      main: 'Главное',
      actions: ['Раз', 'Два', 'Три'],
      remainingCount: 1,
      updatedAtEpochMillis: 123,
    });
  });

  it('shows the first planned action when no main action is selected', () => {
    expect(
      buildTodayWidgetSnapshot('2026-10-05', { main: null, actions: [action('Первое')] }, 123),
    ).toMatchObject({ main: 'Первое', actions: [], remainingCount: 0 });
  });

  it('represents a day without planned actions', () => {
    expect(buildTodayWidgetSnapshot('2026-10-05', { main: null, actions: [] }, 123)).toMatchObject({
      main: null,
      actions: [],
      remainingCount: 0,
    });
  });
});
