import { describe, expect, it } from 'vitest';
import { parseApplicationRoute, resolveInitialApplicationRoute } from './ApplicationRoute';

describe('application routes', () => {
  it.each([
    ['#/v2/today', { view: 'today' }],
    ['#/v2/goals/plans', { view: 'goals', period: 'week' }],
    ['#/v2/planning', { view: 'goals', period: 'week' }],
    ['#/v2/goals/new', { view: 'new-goal' }],
    ['#/v2/actions/new?goalId=goal%2F1', { view: 'new-action', goalId: 'goal/1', title: null }],
  ])('opens the planner route %s', (hash, route) => {
    expect(parseApplicationRoute(hash)).toEqual(route);
  });

  it.each(['#/legacy/today', '#/goals/goal-1/edit', '#/routine/evening', '#/unknown'])(
    'rejects the removed application route %s',
    (hash) => expect(parseApplicationRoute(hash)).toBeNull(),
  );

  it('uses Today for an empty or removed startup route', () => {
    expect(resolveInitialApplicationRoute(null)).toEqual({ view: 'today' });
    expect(resolveInitialApplicationRoute(parseApplicationRoute('#/legacy/today'))).toEqual({
      view: 'today',
    });
  });
});
