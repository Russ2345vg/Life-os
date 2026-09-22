import { describe, expect, it, vi } from 'vitest';
import { PilotSyncCoordinator } from './PilotSyncCoordinator';

describe('PilotSyncCoordinator', () => {
  it('reports durable convergence metrics and the cursor after pull', async () => {
    const coordinator = new PilotSyncCoordinator({
      bootstrap: { run: vi.fn(async () => undefined) },
      push: { run: vi.fn(async () => ({ failed: 0 })) },
      pull: { run: vi.fn(async () => ({ quarantined: 0 })) },
      metrics: {
        counts: vi.fn(async () => ({ pending: 0, conflicts: 1, quarantined: 0 })),
        installation: vi.fn(async () => ({ spaceId: 'space-1' })),
        cursor: vi.fn(async () => 12),
      },
    });

    await expect(coordinator.runAndReport()).resolves.toEqual({
      pending: 0,
      conflicts: 1,
      quarantined: 0,
      lastSequence: 12,
    });
  });

  it('distinguishes a failed server operation from a confirmed offline connection', async () => {
    let online = true;
    const coordinator = new PilotSyncCoordinator({
      isOnline: () => online,
      bootstrap: {
        run: async () => {
          throw new Error('server unavailable');
        },
      },
      push: { run: async () => ({ failed: 0 }) },
      pull: { run: async () => ({ quarantined: 0 }) },
      metrics: { counts: async () => ({ pending: 2, conflicts: 0, quarantined: 0 }) },
    });
    await coordinator.run();
    expect(coordinator.status()).toMatchObject({
      state: 'error',
      pendingCount: 2,
      lastSuccessfulSyncAt: null,
    });
    online = false;
    await coordinator.run();
    expect(coordinator.status()).toMatchObject({ state: 'offline', pendingCount: 2 });
    await coordinator.close();
  });
  it('runs independent local maintenance when structured sync is offline', async () => {
    const afterStructured = vi.fn();
    const coordinator = new PilotSyncCoordinator({
      bootstrap: { run: async () => undefined },
      push: { run: async () => ({ failed: 0 }) },
      pull: {
        run: async () => {
          throw new Error('offline');
        },
      },
      metrics: { counts: async () => ({ pending: 0, conflicts: 0, quarantined: 0 }) },
      afterStructured,
    });
    await coordinator.run();
    expect(afterStructured).toHaveBeenCalledOnce();
    expect(coordinator.status().state).toBe('offline');
  });
  it('calls host timers with the global receiver required by Android WebView', async () => {
    let scheduled: (() => void) | null = null;
    const setTimer = function (
      this: unknown,
      handler: TimerHandler,
    ): ReturnType<typeof globalThis.setTimeout> {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      scheduled = handler as () => void;
      return 1 as ReturnType<typeof globalThis.setTimeout>;
    } as typeof globalThis.setTimeout;
    const clearTimer = function (this: unknown): void {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
    } as typeof globalThis.clearTimeout;
    const coordinator = new PilotSyncCoordinator({
      bootstrap: { run: vi.fn(async () => undefined) },
      push: { run: vi.fn(async () => ({ failed: 0 })) },
      pull: { run: vi.fn(async () => ({ quarantined: 0 })) },
      metrics: { counts: vi.fn(async () => ({ pending: 0, conflicts: 0, quarantined: 0 })) },
      setTimer,
      clearTimer,
    });

    expect(() => coordinator.trigger()).not.toThrow();
    expect(scheduled).not.toBeNull();
    await coordinator.close();
  });

  it('coalesces concurrent triggers into single-flight cycles and exposes non-sensitive status', async () => {
    let release!: () => void;
    const first = new Promise<void>((resolve) => {
      release = resolve;
    });
    const bootstrap = {
      run: vi
        .fn()
        .mockImplementationOnce(() => first)
        .mockResolvedValue(undefined),
    };
    const dependencies = {
      bootstrap,
      push: { run: vi.fn(async () => ({ failed: 0 })) },
      pull: { run: vi.fn(async () => ({ quarantined: 0 })) },
      metrics: { counts: vi.fn(async () => ({ pending: 0, conflicts: 0, quarantined: 0 })) },
      hints: { ensure: vi.fn(async () => undefined), close: vi.fn(async () => undefined) },
      now: () => new Date('2026-09-04T12:00:00.000Z'),
    };
    const coordinator = new PilotSyncCoordinator(dependencies);
    const one = coordinator.run();
    const two = coordinator.run();
    expect(bootstrap.run).toHaveBeenCalledOnce();
    release();
    await Promise.all([one, two]);
    expect(bootstrap.run).toHaveBeenCalledTimes(2);
    expect(coordinator.status()).toEqual({
      state: 'idle',
      pendingCount: 0,
      conflictCount: 0,
      lastSuccessfulSyncAt: '2026-09-04T12:00:00.000Z',
    });
    await coordinator.close();
    expect(dependencies.hints.close).toHaveBeenCalledOnce();
  });
});
