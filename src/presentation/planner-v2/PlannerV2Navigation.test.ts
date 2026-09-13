import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DayDate } from '../../domain';
import { buildPlannerV2Route, parsePlannerV2Route } from './PlannerV2Navigation';
import { clearApplicationRouteFromBrowser } from '../../app/lifecycle/ApplicationBrowserHistory';
import { APP_SECTION } from '../navigation/AppSection';
import { PlannerV2Workspace, type PlannerV2Services } from './PlannerV2Workspace';

describe('V2 preview routes', () => {
  it('roundtrips the four entries, focus and a converted action id', () => {
    for (const route of [
      { view: 'goals' },
      { view: 'focus' },
      { view: 'actions' },
      { view: 'inbox' },
      { view: 'action', id: 'inbox-result:русский / id' },
    ] as const)
      expect(parsePlannerV2Route(buildPlannerV2Route(route))).toEqual(route);
    expect(parsePlannerV2Route('#/v2/actions/%broken')).toBeNull();
  });
  it('roundtrips a Goal and its optional first step without losing the original id', () => {
    const route = { view: 'new-action', goalId: 'цель / 1', title: 'Первый шаг & ещё' } as const;
    expect(parsePlannerV2Route(buildPlannerV2Route(route))).toEqual(route);
  });
  it('offers four working entries with a visible old-version exit', () => {
    const markup = renderToStaticMarkup(
      createElement(PlannerV2Workspace, {
        services: {} as PlannerV2Services,
        route: { view: 'today' },
        currentDate: DayDate.create('2026-09-13'),
        onNavigate: vi.fn(),
        onExit: vi.fn(),
      }),
    );

    expect(markup).toContain('href="#/v2/today"');
    expect(markup).toContain('href="#/v2/goals"');
    expect(markup).toContain('href="#/v2/actions"');
    expect(markup).toContain('href="#/v2/inbox"');
    expect(markup).toContain('Старая версия');
  });
  it('clears a V2 route when returning to a hashless section', () => {
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
