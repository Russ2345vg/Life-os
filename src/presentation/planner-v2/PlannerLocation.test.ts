import { describe, expect, it } from 'vitest';
import { buildPlannerLocation, parsePlannerLocation } from './PlannerLocation';
import type { PlannerRoute } from './PlannerNavigation';

describe('planner location', () => {
  it.each<readonly [PlannerRoute, string]>([
    [{ view: 'today' }, '#/v2/today?action=a%2Fb'],
    [{ view: 'today', day: 'tomorrow' }, '#/v2/today?day=tomorrow&action=a%2Fb'],
    [{ view: 'actions' }, '#/v2/actions?action=a%2Fb'],
    [{ view: 'calendar', section: 'actions' }, '#/v2/actions?view=calendar&action=a%2Fb'],
    [{ view: 'kanban', section: 'actions' }, '#/v2/actions?view=kanban&action=a%2Fb'],
    [{ view: 'tree', section: 'actions' }, '#/v2/actions?view=tree&action=a%2Fb'],
    [{ view: 'time', actionId: 'time-a' }, '#/v2/actions?view=time&actionId=time-a&action=a%2Fb'],
  ])('roundtrips the page while keeping actionId independent (%s)', (page, hash) => {
    const location = { page, actionPanel: { actionId: 'a/b' } } as const;
    expect(buildPlannerLocation(location)).toBe(hash);
    expect(parsePlannerLocation(hash)).toEqual(location);
  });

  it('keeps standalone detail as a full page', () => {
    expect(parsePlannerLocation('#/v2/actions/a%2Fb')).toEqual({
      page: { view: 'action', id: 'a/b' },
      actionPanel: null,
    });
  });

  it('ignores empty panel ids and unrelated query parameters', () => {
    expect(parsePlannerLocation('#/v2/today?action=%20&unused=1')).toEqual({
      page: { view: 'today' },
      actionPanel: null,
    });
    expect(parsePlannerLocation('#/legacy/today?action=a')).toBeNull();
  });
});
