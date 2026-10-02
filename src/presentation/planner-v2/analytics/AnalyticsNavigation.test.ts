import { describe, expect, it } from 'vitest';
import { buildPlannerRoute, parsePlannerRoute } from '../PlannerNavigation';

describe('analytics navigation', () => {
  it('roundtrips an overview, topic and selected day without confusing walks analytics', () => {
    const route = {
      view: 'analytics',
      period: 'month',
      date: '2026-09-01',
      topic: 'time',
      day: '2026-09-24',
    } as const;
    expect(parsePlannerRoute(buildPlannerRoute(route))).toEqual(route);
    expect(parsePlannerRoute('#/v2/analytics')).toEqual({ view: 'analytics' });
    expect(parsePlannerRoute('#/v2/analytics?topic=unknown')).toEqual({ view: 'analytics' });
    expect(parsePlannerRoute('#/v2/walks/analytics')).toEqual({ view: 'walks', page: 'analytics' });
  });
});
