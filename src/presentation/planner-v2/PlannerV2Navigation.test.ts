import { describe, expect, it, vi } from 'vitest';
import { buildPlannerV2Route, parsePlannerV2Route } from './PlannerV2Navigation';
import { clearApplicationRouteFromBrowser } from '../../app/lifecycle/ApplicationBrowserHistory';
import { APP_SECTION } from '../navigation/AppSection';

describe('V2 preview routes', () => {
  it('roundtrips a Goal and its optional first step without losing the original id', () => {
    const route = { view: 'new-action', goalId: 'цель / 1', title: 'Первый шаг & ещё' } as const;
    expect(parsePlannerV2Route(buildPlannerV2Route(route))).toEqual(route);
  });
  it('rolls back to legacy Today by clearing only the browser route', () => {
    const pushState = vi.fn();
    clearApplicationRouteFromBrowser(
      { location: { hash: '#/v2/today', pathname: '/', search: '' }, history: { pushState } },
      APP_SECTION.today,
    );
    expect(pushState).toHaveBeenCalledWith(
      { lifeosApplicationSection: APP_SECTION.today },
      '',
      '/',
    );
  });
});
