import { describe, expect, it } from 'vitest';
import { buildPlannerRoute, parsePlannerRoute } from '../PlannerNavigation';

describe('Memory navigation', () => {
  it('opens a year overview with combined filters', () => {
    expect(
      parsePlannerRoute(
        '#/v2/memory?year=2024&mode=year&kind=insight&sphereId=personal&highlight=1&search=hello',
      ),
    ).toEqual({
      view: 'memory',
      year: 2024,
      mode: 'year',
      kind: 'insight',
      sphereId: 'personal',
      highlight: true,
      search: 'hello',
    });
  });
  it('keeps the selected list when opening and closing a memory', () => {
    const hash = '#/v2/memory/event%201?year=2025&mode=timeline&deleted=1';
    const route = parsePlannerRoute(hash);
    expect(route).toEqual({
      view: 'memory',
      id: 'event 1',
      year: 2025,
      mode: 'timeline',
      deleted: true,
    });
    expect(route && buildPlannerRoute(route)).toBe(hash);
  });
  it('ignores invalid year, mode and kind instead of throwing', () => {
    expect(parsePlannerRoute('#/v2/memory?year=10000&mode=unknown&kind=other')).toEqual({
      view: 'memory',
    });
    expect(parsePlannerRoute('#/v2/memory/%ZZ')).toBeNull();
  });
});
