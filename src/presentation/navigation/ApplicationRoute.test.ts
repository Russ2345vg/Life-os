import { describe, expect, it } from 'vitest';
import { MANAGEMENT_SECTION } from '../management/ManagementSection';
import { ROUTINE_SECTION } from '../routine/RoutineNavigation';
import { APP_SECTION } from './AppSection';
import { parseApplicationRoute, resolveInitialApplicationSection } from './ApplicationRoute';

describe('application routes', () => {
  it.each([
    ['#/v2/today', { view: 'today' }],
    ['#/v2/goals/new', { view: 'new-goal' }],
    ['#/v2/actions/new?goalId=goal%2F1', { view: 'new-action', goalId: 'goal/1', title: null }],
  ])('opens the isolated planner route %s without changing legacy default', (hash, route) => {
    expect(parseApplicationRoute(hash as string)).toEqual({ section: APP_SECTION.today, route });
    expect(resolveInitialApplicationSection(null, APP_SECTION.today)).toBe(APP_SECTION.today);
  });
  it('resolves Goal Album routes through Management', () => {
    expect(parseApplicationRoute('#/goals/goal-1/edit')).toEqual({
      section: APP_SECTION.management,
      managementSection: MANAGEMENT_SECTION.goals,
      route: { view: 'edit', goalId: 'goal-1' },
    });
  });

  it('preserves current Routine route details', () => {
    const route = parseApplicationRoute(
      '#/routine/morning?date=2026-08-28&view=physical-execution',
    );

    expect(route).toMatchObject({
      section: APP_SECTION.routine,
      route: {
        section: ROUTINE_SECTION.morning,
        morningView: 'physical-execution',
      },
    });
    expect(route?.section === APP_SECTION.routine ? route.route.date?.toString() : null).toBe(
      '2026-08-28',
    );
  });

  it('uses Management before the configured default for a Goal route', () => {
    expect(
      resolveInitialApplicationSection(
        {
          section: APP_SECTION.management,
          managementSection: MANAGEMENT_SECTION.goals,
          route: { view: 'album' },
        },
        APP_SECTION.today,
      ),
    ).toBe(APP_SECTION.management);
  });

  it('normalizes an unsupported default section when no route is present', () => {
    expect(resolveInitialApplicationSection(null, APP_SECTION.actions)).toBe(
      APP_SECTION.management,
    );
  });
});
