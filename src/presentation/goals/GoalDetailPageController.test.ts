import { describe, expect, it, vi } from 'vitest';
import type { GoalDetailSource } from './GoalDetailLoader';
import {
  createGoalDetailLoadController,
  settleGoalDetailLoad,
  type GoalDetailLoadState,
} from './GoalDetailPageController';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('Goal detail load controller', () => {
  it('publishes not-found distinctly from technical error', async () => {
    const source: GoalDetailSource = {
      goal: null,
      directions: [],
      spheres: { active: [], archived: [] },
    };

    await expect(settleGoalDetailLoad(Promise.resolve(source), () => true)).resolves.toEqual({
      status: 'not-found',
    });
    await expect(
      settleGoalDetailLoad(Promise.reject(new Error('storage')), () => true),
    ).resolves.toEqual({ status: 'error' });
  });

  it('ignores stale completion after a retry starts', async () => {
    const first = deferred<GoalDetailSource>();
    const second = deferred<GoalDetailSource>();
    const publish = vi.fn<(state: GoalDetailLoadState) => void>();
    const load = vi
      .fn<() => Promise<GoalDetailSource>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const controller = createGoalDetailLoadController({ load, publish });

    controller.activate();
    controller.retry();
    first.resolve({ goal: null, directions: [], spheres: { active: [], archived: [] } });
    await first.promise;
    await Promise.resolve();

    expect(publish).toHaveBeenLastCalledWith({ status: 'loading' });

    second.resolve({ goal: null, directions: [], spheres: { active: [], archived: [] } });
    await second.promise;
    await Promise.resolve();

    expect(publish).toHaveBeenLastCalledWith({ status: 'not-found' });
  });
});
