import { describe, expect, it, vi } from 'vitest';
import { APP_SECTION } from '../presentation/navigation/AppSection';
import {
  clearApplicationRouteFromBrowser,
  pushApplicationRouteToBrowser,
} from './lifecycle/ApplicationBrowserHistory';

describe('ApplicationShell route ownership', () => {
  it('removes a routine execution deep-link when leaving Routine directly', () => {
    const pushState = vi.fn();

    clearApplicationRouteFromBrowser(
      {
        location: {
          hash: '#/routine/morning?date=2026-08-28&view=physical-execution',
          pathname: '/lifeos',
          search: '?mode=test',
        },
        history: { pushState },
      },
      APP_SECTION.today,
    );

    expect(pushState).toHaveBeenCalledWith(
      { lifeosApplicationSection: APP_SECTION.today },
      '',
      '/lifeos?mode=test',
    );
  });

  it('removes a Goal deep-link when leaving Goal Album directly', () => {
    const pushState = vi.fn();

    clearApplicationRouteFromBrowser(
      {
        location: {
          hash: '#/goals/goal-1/edit',
          pathname: '/lifeos',
          search: '?mode=test',
        },
        history: { pushState },
      },
      APP_SECTION.management,
    );

    expect(pushState).toHaveBeenCalledWith(
      { lifeosApplicationSection: APP_SECTION.management },
      '',
      '/lifeos?mode=test',
    );
  });

  it('does not rewrite an unrelated browser route', () => {
    const pushState = vi.fn();

    clearApplicationRouteFromBrowser(
      {
        location: { hash: '#/history', pathname: '/lifeos', search: '' },
        history: { pushState },
      },
      APP_SECTION.today,
    );

    expect(pushState).not.toHaveBeenCalled();
  });

  it('marks the current hashless section before opening an application route', () => {
    const pushState = vi.fn();
    const replaceState = vi.fn();

    pushApplicationRouteToBrowser(
      {
        location: { hash: '', pathname: '/lifeos', search: '?mode=test' },
        history: { pushState, replaceState },
      },
      '#/goals',
      APP_SECTION.management,
    );

    expect(replaceState).toHaveBeenCalledWith(
      { lifeosApplicationSection: APP_SECTION.management },
      '',
      '/lifeos?mode=test',
    );
    expect(pushState).toHaveBeenCalledWith(null, '', '#/goals');
  });
});
