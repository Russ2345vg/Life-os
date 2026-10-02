import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createLifeOsApplication } from '../../app/composition/createLifeOsApplication';
import { DayDate } from '../../domain';
import { buildPlannerRoute, parsePlannerRoute, resolveDiaryRoute } from './PlannerNavigation';
import { PlannerWorkspace, type PlannerServices } from './PlannerWorkspace';
import { PlannerViewSwitcher } from './PlannerViewSwitcher';
import { PlannerLibraryReadModels } from '../../application/planner/PlannerLibraryReadModels';

const unexpectedRead = vi.fn(async (): Promise<never> => {
  throw new Error('Static navigation rendering must not read application data.');
});
const libraryReads = new PlannerLibraryReadModels(
  {
    getGoals: unexpectedRead,
    getDirections: unexpectedRead,
    getSpheres: unexpectedRead,
    getActions: unexpectedRead,
    getIdeas: unexpectedRead,
    getFocus: unexpectedRead,
    getTimeCapacity: unexpectedRead,
  },
  {
    subscribe: () => {
      throw new Error('Static rendering must not subscribe.');
    },
  },
);

describe('V2 preview routes', () => {
  it('opens the needs catalog and an encoded need', () => {
    expect(parsePlannerRoute('#/v2/needs')).toEqual({ view: 'needs' });
    const detail = { view: 'needs', need: 'Свобода и выбор / путь' } as const;
    expect(parsePlannerRoute(buildPlannerRoute(detail))).toEqual(detail);
  });
  it('roundtrips walk static routes and encoded IDs without confusing them', () => {
    for (const section of [
      'overview',
      'active',
      'history',
      'captures',
      'plan',
      'analytics',
    ] as const) {
      const route = { view: 'walks', page: section } as const;
      expect(parsePlannerRoute(buildPlannerRoute(route))).toEqual(route);
    }
    expect(parsePlannerRoute('#/v2/walks/walk%20one')).toEqual({ view: 'walks', id: 'walk one' });
    expect(parsePlannerRoute('#/v2/walks/%zz')).toBeNull();
  });
  let application: Awaited<ReturnType<typeof createLifeOsApplication>>;
  let services: PlannerServices;
  beforeAll(async () => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    // These cases cover the base navigation without the optional memory section.
    application = await createLifeOsApplication({ memoryEnabled: false });
    const { memory, ...baseServices } = application;
    void memory;
    services = { ...baseServices, libraryReads };
  });
  afterAll(() => {
    application?.close();
    vi.unstubAllGlobals();
  });

  it('opens work time and preserves an optional selected action', () => {
    expect(parsePlannerRoute('#/v2/actions?view=time&actionId=work')).toEqual({
      view: 'time',
      actionId: 'work',
    });
    expect(parsePlannerRoute('#/v2/actions?view=time')).toEqual({ view: 'time' });
    const html = renderToStaticMarkup(
      createElement(PlannerViewSwitcher, {
        route: { view: 'actions' },
        onNavigate: vi.fn(),
      }),
    );
    expect(html).toContain('Рабочее время');
  });
  it('opens weekly review with its selected week', () => {
    expect(parsePlannerRoute('#/v2/goals?view=review&week=2026-09-14')).toEqual({
      view: 'review',
      week: '2026-09-14',
    });
    const html = renderToStaticMarkup(
      createElement(PlannerViewSwitcher, { route: { view: 'goals' }, onNavigate: vi.fn() }),
    );
    expect(html).toContain('Обзор недели');
  });
  it('roundtrips diary routes and resolves safe calendar defaults without future periods', () => {
    for (const route of [
      { view: 'diary' },
      { view: 'diary', period: 'day', date: '2026-09-29' },
      { view: 'diary', period: 'week', date: '2026-09-16' },
      { view: 'diary', period: 'month', date: '2026-09-18' },
    ] as const)
      expect(parsePlannerRoute(buildPlannerRoute(route))).toEqual(route);
    const today = DayDate.create('2026-09-29');
    expect(resolveDiaryRoute({ view: 'diary' }, today)).toEqual({
      view: 'diary',
      period: 'week',
      date: '2026-09-21',
    });
    expect(
      resolveDiaryRoute({ view: 'diary', period: 'week', date: '2026-09-16' }, today).date,
    ).toBe('2026-09-14');
    expect(resolveDiaryRoute({ view: 'diary', period: 'month', date: 'bad' }, today).date).toBe(
      '2026-09-01',
    );
    expect(
      resolveDiaryRoute({ view: 'diary', period: 'day', date: '2026-10-02' }, today).date,
    ).toBe('2026-09-29');
  });
  it('retains the selected direction when creating a goal', () => {
    expect(parsePlannerRoute('#/v2/goals/new?directionId=home')).toEqual({
      view: 'new-goal',
      directionId: 'home',
    });
  });
  it('roundtrips the four entries, focus and a converted action id', () => {
    for (const route of [
      { view: 'goals', period: 'week' },
      { view: 'goal', id: 'goal / русский' },
      { view: 'goal', id: 'goal / русский', edit: true },
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
      { view: 'sleep' },
      { view: 'account' },
      { view: 'sphere', id: 'здоровье / дом' },
      { view: 'direction', id: 'сон' },
      { view: 'goals', sphereId: 'здоровье / дом' },
      { view: 'goals', sphereId: 'здоровье / дом', period: 'week' },
      { view: 'inbox' },
      { view: 'action', id: 'inbox-result:русский / id' },
      { view: 'new-action', goalId: null, title: null, date: '2026-09-14' },
    ] as const)
      expect(parsePlannerRoute(buildPlannerRoute(route))).toEqual(route);
    expect(parsePlannerRoute('#/v2/actions/%broken')).toBeNull();
    expect(parsePlannerRoute('#/v2/goals/plans')).toEqual({ view: 'goals', period: 'week' });
    expect(parsePlannerRoute('#/v2/planning')).toEqual({ view: 'goals', period: 'week' });
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
      createElement(PlannerWorkspace, {
        services,
        route: { view: 'goals', period: 'week' },
        currentDate: DayDate.create('2026-09-13'),
        onNavigate: vi.fn(),
      }),
    );
    const mainNav = markup.match(/<nav aria-label="Рабочий интерфейс">([\s\S]*?)<\/nav>/)?.[1];
    expect(mainNav).toBeDefined();
    expect(mainNav?.match(/<a /g)).toHaveLength(10);
    expect(mainNav).toContain('Сферы');
    expect(mainNav).toContain('Направления');
    expect(mainNav).toContain('Потребности');
    expect(mainNav).toContain('Дневник');
    expect(mainNav).toContain('Аналитика');
    expect(mainNav).not.toContain('Планирование');
    expect(mainNav).toMatch(/href="#\/v2\/goals" aria-current="page"/);
    expect(markup).not.toContain('Планы');
    expect(unexpectedRead).not.toHaveBeenCalled();
  });
  it('roundtrips a Goal and its optional first step without losing the original id', () => {
    const route = { view: 'new-action', goalId: 'цель / 1', title: 'Первый шаг & ещё' } as const;
    expect(parsePlannerRoute(buildPlannerRoute(route))).toEqual(route);
    const fromGoal = { view: 'new-action', goalId: 'g', title: null, returnToGoal: true } as const;
    expect(parsePlannerRoute(buildPlannerRoute(fromGoal))).toEqual(fromGoal);
    const fromList = { view: 'new-action', goalId: 'g', title: null, returnToGoals: true } as const;
    expect(parsePlannerRoute(buildPlannerRoute(fromList))).toEqual(fromList);
  });
  it('keeps the same navigation and marks More for secondary destinations', () => {
    for (const view of ['sleep', 'inbox', 'spheres', 'directions', 'account'] as const) {
      const markup = renderToStaticMarkup(
        createElement(PlannerWorkspace, {
          services,
          route: { view },
          currentDate: DayDate.create('2026-09-24'),
          onNavigate: vi.fn(),
        }),
      );
      const nav = markup.match(/<nav aria-label="Рабочий интерфейс">([\s\S]*?)<\/nav>/)?.[1];
      expect(nav?.match(/<a /g)).toHaveLength(10);
      expect(nav).toContain('class="planner-nav-more" type="button" aria-current="page"');
      expect(markup).toContain('href="#/v2/sleep"');
      expect(unexpectedRead).not.toHaveBeenCalled();
    }
  });
  it('offers the working entries without an old-version exit', () => {
    const markup = renderToStaticMarkup(
      createElement(PlannerWorkspace, {
        services,
        route: { view: 'today' },
        currentDate: DayDate.create('2026-09-13'),
        onNavigate: vi.fn(),
      }),
    );

    expect(markup).toContain('href="#/v2/today"');
    expect(markup).toContain('href="#/v2/goals"');
    expect(markup).toContain('href="#/v2/actions"');
    expect(markup).toContain('href="#/v2/diary?period=day&amp;date=2026-09-13"');
    expect(markup).toContain('href="#/v2/inbox"');
    expect(markup).toContain('href="#/v2/analytics"');
    const nav = markup.match(/<nav aria-label="Рабочий интерфейс">([\s\S]*?)<\/nav>/)?.[1] ?? '';
    expect(nav.match(/class="planner-nav-secondary"/g)).toHaveLength(6);
    expect(markup).not.toContain('Старая версия');
    expect(markup).not.toContain('<span>V2</span>');
  });
});
