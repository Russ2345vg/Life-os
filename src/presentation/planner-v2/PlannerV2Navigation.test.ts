import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DayDate } from '../../domain';
import { buildPlannerV2Route, parsePlannerV2Route } from './PlannerV2Navigation';
import { clearApplicationRouteFromBrowser } from '../../app/lifecycle/ApplicationBrowserHistory';
import { APP_SECTION } from '../navigation/AppSection';
import { PlannerV2Workspace, type PlannerV2Services } from './PlannerV2Workspace';
import { PlannerViewSwitcher } from './PlannerViewSwitcher';

describe('V2 preview routes', () => {
  it('roundtrips the four entries, focus and a converted action id', () => {
    for (const route of [
      { view: 'goals', period: 'week' },
      { view: 'goal', id: 'goal / русский' },
      { view: 'goals' },
      { view: 'focus' },
      { view: 'kanban', section: 'goals' },
      { view: 'kanban', section: 'actions' },
      { view: 'calendar', section: 'goals' },
      { view: 'calendar', section: 'actions' },
      { view: 'tree', section: 'goals' },
      { view: 'tree', section: 'actions' },
      { view: 'actions' },
      { view: 'spheres' },
      { view: 'directions' },
      { view: 'today', day: 'tomorrow' },
      { view: 'sphere', id: 'здоровье / дом' },
      { view: 'direction', id: 'сон' },
      { view: 'goals', sphereId: 'здоровье / дом' },
      { view: 'goals', sphereId: 'здоровье / дом', period: 'week' },
      { view: 'inbox' },
      { view: 'action', id: 'inbox-result:русский / id' },
      { view: 'new-action', goalId: null, title: null, date: '2026-09-14' },
    ] as const)
      expect(parsePlannerV2Route(buildPlannerV2Route(route))).toEqual(route);
    expect(parsePlannerV2Route('#/v2/actions/%broken')).toBeNull();
    expect(parsePlannerV2Route('#/v2/goals/plans')).toEqual({ view: 'goals', period: 'week' });
    expect(parsePlannerV2Route('#/v2/planning')).toEqual({ view: 'goals', period: 'week' });
  });
  it('keeps old planning links on the Goals list without a second Plans view', () => {
    const switcher = renderToStaticMarkup(
      createElement(PlannerViewSwitcher, {
        route: { view: 'goals' },
        onNavigate: vi.fn(),
      }),
    );
    expect(switcher).not.toContain('Планы');
    expect(
      renderToStaticMarkup(
        createElement(PlannerViewSwitcher, {
          route: { view: 'actions' },
          onNavigate: vi.fn(),
        }),
      ),
    ).not.toContain('Планы');
    const markup = renderToStaticMarkup(
      createElement(PlannerV2Workspace, {
        services: { planning: {} } as PlannerV2Services,
        route: { view: 'goals', period: 'week' },
        currentDate: DayDate.create('2026-09-13'),
        onNavigate: vi.fn(),
        onExit: vi.fn(),
      }),
    );
    const mainNav = markup.match(/<nav aria-label="Рабочий интерфейс">([\s\S]*?)<\/nav>/)?.[1];
    expect(mainNav).toBeDefined();
    expect(mainNav?.match(/<a /g)).toHaveLength(6);
    expect(mainNav).toContain('Сферы');
    expect(mainNav).toContain('Направления');
    expect(mainNav).not.toContain('Планирование');
    expect(mainNav).toMatch(/href="#\/v2\/goals" aria-current="page"/);
    expect(markup).not.toContain('Планы');
  });
  it('roundtrips a Goal and its optional first step without losing the original id', () => {
    const route = { view: 'new-action', goalId: 'цель / 1', title: 'Первый шаг & ещё' } as const;
    expect(parsePlannerV2Route(buildPlannerV2Route(route))).toEqual(route);
    const fromGoal = { view: 'new-action', goalId: 'g', title: null, returnToGoal: true } as const;
    expect(parsePlannerV2Route(buildPlannerV2Route(fromGoal))).toEqual(fromGoal);
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
