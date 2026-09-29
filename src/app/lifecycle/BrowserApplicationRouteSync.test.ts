import { describe, expect, it, vi } from 'vitest';
import { startBrowserApplicationRouteSync } from './BrowserApplicationRouteSync';

describe('startBrowserApplicationRouteSync', () => {
  it('restores only current application routes through browser navigation', async () => {
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

    await vi.waitFor(() => expect(restore).toHaveBeenCalledTimes(2));
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

  it('restores Today when browser history reaches the hashless application entry', async () => {
    const windowTarget = new EventTarget() as unknown as Window;
    const restore = vi.fn();
    const stop = startBrowserApplicationRouteSync({
      windowTarget,
      readHash: () => '',
      restore,
    });

    windowTarget.dispatchEvent(new Event('popstate'));

    await vi.waitFor(() => expect(restore).toHaveBeenCalledOnce());

    expect(restore).toHaveBeenCalledWith({ view: 'today' });
    stop();
  });

  it('flushes once for duplicate browser events and restores the accepted hash after failure', async () => {
    const windowTarget = new EventTarget() as unknown as Window;
    let hash = '#/v2/diary?period=day&date=2026-09-29';
    const restore = vi.fn();
    const replaceHash = vi.fn((value: string) => {
      hash = value;
    });
    const flush = vi.fn(async () => false);
    const stop = startBrowserApplicationRouteSync({
      windowTarget,
      readHash: () => hash,
      readAcceptedHash: () => '#/v2/diary?period=day&date=2026-09-28',
      replaceHash,
      beforeRestore: flush,
      restore,
    });

    windowTarget.dispatchEvent(new Event('popstate'));
    windowTarget.dispatchEvent(new Event('hashchange'));
    await vi.waitFor(() => expect(replaceHash).toHaveBeenCalledOnce());
    expect(flush).toHaveBeenCalledOnce();
    expect(restore).not.toHaveBeenCalled();
    expect(hash).toBe('#/v2/diary?period=day&date=2026-09-28');
    stop();
  });
});
