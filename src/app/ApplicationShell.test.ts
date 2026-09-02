import { describe, expect, it, vi } from 'vitest';
import { clearRoutineRouteFromBrowser } from './ApplicationShell';

describe('ApplicationShell route ownership', () => {
  it('removes a routine execution deep-link when leaving Routine directly', () => {
    const pushState = vi.fn();

    clearRoutineRouteFromBrowser({
      location: {
        hash: '#/routine/morning?date=2026-08-28&view=physical-execution',
        pathname: '/lifeos',
        search: '?mode=test',
      },
      history: { pushState },
    });

    expect(pushState).toHaveBeenCalledWith(null, '', '/lifeos?mode=test');
  });

  it('does not rewrite an unrelated browser route', () => {
    const pushState = vi.fn();

    clearRoutineRouteFromBrowser({
      location: { hash: '#/history', pathname: '/lifeos', search: '' },
      history: { pushState },
    });

    expect(pushState).not.toHaveBeenCalled();
  });
});
