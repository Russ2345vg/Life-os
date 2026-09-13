import { describe, expect, it, vi } from 'vitest';
import { DayDate } from '../../domain';
import { MANAGEMENT_SECTION } from '../../presentation/management/ManagementSection';
import { APP_SECTION } from '../../presentation/navigation/AppSection';
import { ROUTINE_SECTION } from '../../presentation/routine/RoutineNavigation';
import { startBrowserApplicationRouteSync } from './BrowserApplicationRouteSync';

describe('startBrowserApplicationRouteSync', () => {
  it('restores V2 Today and the explicit old-version route through browser navigation', () => {
    const windowTarget = new EventTarget() as unknown as Window;
    const restore = vi.fn();
    let hash = '#/v2/today';
    const stop = startBrowserApplicationRouteSync({
      windowTarget,
      readHash: () => hash,
      readHistoryState: () => null,
      restore,
      restoreSection: vi.fn(),
    });

    windowTarget.dispatchEvent(new Event('popstate'));
    hash = '#/legacy/today';
    windowTarget.dispatchEvent(new Event('popstate'));

    expect(restore).toHaveBeenNthCalledWith(1, {
      section: APP_SECTION.today,
      route: { view: 'today' },
    });
    expect(restore).toHaveBeenNthCalledWith(2, {
      section: APP_SECTION.today,
      route: null,
    });
    stop();
  });

  it('restores Goal and Routine routes from browser navigation', () => {
    const windowTarget = new EventTarget() as unknown as Window;
    const restore = vi.fn();
    let hash = '#/goals';
    const stop = startBrowserApplicationRouteSync({
      windowTarget,
      readHash: () => hash,
      readHistoryState: () => null,
      restore,
      restoreSection: vi.fn(),
    });

    windowTarget.dispatchEvent(new Event('popstate'));
    hash = '#/goals/goal%20one/edit';
    windowTarget.dispatchEvent(new Event('hashchange'));
    hash = '#/routine/evening?date=2026-08-23';
    windowTarget.dispatchEvent(new Event('hashchange'));

    expect(restore).toHaveBeenNthCalledWith(1, {
      section: APP_SECTION.management,
      managementSection: MANAGEMENT_SECTION.goals,
      route: { view: 'album' },
    });
    expect(restore).toHaveBeenNthCalledWith(2, {
      section: APP_SECTION.management,
      managementSection: MANAGEMENT_SECTION.goals,
      route: { view: 'edit', goalId: 'goal one' },
    });
    expect(restore).toHaveBeenNthCalledWith(3, {
      section: APP_SECTION.routine,
      route: {
        section: ROUTINE_SECTION.evening,
        date: DayDate.create('2026-08-23'),
        morningView: null,
      },
    });

    stop();
    hash = '#/goals';
    windowTarget.dispatchEvent(new Event('popstate'));
    expect(restore).toHaveBeenCalledTimes(3);
  });

  it('ignores hashes outside application-owned routes', () => {
    const windowTarget = new EventTarget() as unknown as Window;
    const restore = vi.fn();
    const stop = startBrowserApplicationRouteSync({
      windowTarget,
      readHash: () => '#/unknown',
      readHistoryState: () => null,
      restore,
      restoreSection: vi.fn(),
    });

    windowTarget.dispatchEvent(new Event('popstate'));
    windowTarget.dispatchEvent(new Event('hashchange'));

    expect(restore).not.toHaveBeenCalled();
    stop();
  });

  it('restores a marked hashless section when browser history leaves an application route', () => {
    const windowTarget = new EventTarget() as unknown as Window;
    const restore = vi.fn();
    const restoreSection = vi.fn();
    const stop = startBrowserApplicationRouteSync({
      windowTarget,
      readHash: () => '',
      readHistoryState: () => ({ lifeosApplicationSection: APP_SECTION.management }),
      restore,
      restoreSection,
    });

    windowTarget.dispatchEvent(new Event('popstate'));

    expect(restore).not.toHaveBeenCalled();
    expect(restoreSection).toHaveBeenCalledWith(APP_SECTION.management);
    stop();
  });

  it('restores the hashless Today history entry as the primary V2 planner', () => {
    const windowTarget = new EventTarget() as unknown as Window;
    const restore = vi.fn();
    const restoreSection = vi.fn();
    const stop = startBrowserApplicationRouteSync({
      windowTarget,
      readHash: () => '',
      readHistoryState: () => ({ lifeosApplicationSection: APP_SECTION.today }),
      restore,
      restoreSection,
    });

    windowTarget.dispatchEvent(new Event('popstate'));

    expect(restore).toHaveBeenCalledWith({
      section: APP_SECTION.today,
      route: { view: 'today' },
    });
    expect(restoreSection).not.toHaveBeenCalled();
    stop();
  });
});
