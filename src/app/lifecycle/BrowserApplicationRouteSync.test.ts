import { describe, expect, it, vi } from 'vitest';
import { startBrowserApplicationRouteSync } from './BrowserApplicationRouteSync';

describe('startBrowserApplicationRouteSync', () => {
  it('restores only current application routes through browser navigation', () => {
    const windowTarget = new EventTarget() as unknown as Window;
    const restore = vi.fn();
    let hash = '#/v2/today';
    const stop = startBrowserApplicationRouteSync({
      windowTarget,
      readHash: () => hash,
      restore,
    });

    windowTarget.dispatchEvent(new Event('popstate'));
    hash = '#/v2/goals';
    windowTarget.dispatchEvent(new Event('hashchange'));
    hash = '#/legacy/today';
    windowTarget.dispatchEvent(new Event('popstate'));
    hash = '#/routine/evening?date=2026-08-23';
    windowTarget.dispatchEvent(new Event('hashchange'));

    expect(restore.mock.calls.map(([route]) => route)).toEqual([
      { view: 'today' },
      { view: 'goals' },
    ]);
    stop();
  });

  it('restores Today when browser history reaches the hashless application entry', () => {
    const windowTarget = new EventTarget() as unknown as Window;
    const restore = vi.fn();
    const stop = startBrowserApplicationRouteSync({
      windowTarget,
      readHash: () => '',
      restore,
    });

    windowTarget.dispatchEvent(new Event('popstate'));

    expect(restore).toHaveBeenCalledWith({ view: 'today' });
    stop();
  });
});
