import { describe, expect, it, vi } from 'vitest';
import {
  LatestPlannerRefresh,
  queuePlannerRefresh,
  requireRefreshOutcome,
  settleCompletionLibrary,
} from './plannerCompletionRefresh';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
}
describe('completion refresh results', () => {
  it('cancels a queued refresh before cleanup and allows the next setup to read', async () => {
    const previous = vi.fn(async () => {});
    const current = vi.fn(async () => {});
    const cancel = queuePlannerRefresh(previous);
    cancel();
    queuePlannerRefresh(current);
    await Promise.resolve();
    expect(previous).not.toHaveBeenCalled();
    expect(current).toHaveBeenCalledTimes(1);
  });
  it('joins a newer request in the same scope and reports its failure', async () => {
    const session = new LatestPlannerRefresh();
    const first = deferred<string>(),
      second = deferred<string>();
    const publish = vi.fn();
    const a = session.run(() => first.promise, publish);
    const b = session.run(() => second.promise, publish);
    first.resolve('stale');
    const error = new Error('new read failed');
    second.reject(error);
    expect(await a).toEqual({ status: 'failed', error });
    expect(await b).toEqual({ status: 'failed', error });
    expect(publish).not.toHaveBeenCalled();
  });
  it('does not publish across cleanup and allows a fresh StrictMode setup', async () => {
    const session = new LatestPlannerRefresh();
    const first = deferred<string>();
    const publish = vi.fn();
    const old = session.run(() => first.promise, publish);
    session.reset();
    await session.run(async () => 'new', publish);
    first.resolve('old');
    expect(await old).toEqual({ status: 'superseded' });
    expect(publish.mock.calls).toEqual([['new']]);
  });
  it('reads the current library snapshot after settling and refreshes only on retry', async () => {
    let error: Error | null = null;
    const model = {
      whenSettled: vi.fn(async () => {
        error = new Error('failed read');
      }),
      refresh: vi.fn(async () => {
        error = null;
      }),
      getSnapshot: () => ({ data: null, refreshing: false, error }),
    };
    await expect(settleCompletionLibrary(model, false)).rejects.toThrow('failed read');
    expect(model.refresh).not.toHaveBeenCalled();
    await expect(settleCompletionLibrary(model, true)).resolves.toBeUndefined();
    expect(model.refresh).toHaveBeenCalledTimes(1);
  });
  it('does not interpret a swallowed read failure or superseded scope as ready', () => {
    expect(() => requireRefreshOutcome({ status: 'failed', error: new Error('failed') })).toThrow(
      'failed',
    );
    expect(() => requireRefreshOutcome({ status: 'superseded' })).toThrow();
    expect(() => requireRefreshOutcome({ status: 'ready' })).not.toThrow();
  });
});
