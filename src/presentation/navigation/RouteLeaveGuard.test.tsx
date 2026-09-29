import { describe, expect, it, vi } from 'vitest';
import { createRouteLeaveGuard } from './RouteLeaveGuard';

describe('RouteLeaveGuard', () => {
  it('flushes active registrations sequentially and clears unload blocking', async () => {
    const guard = createRouteLeaveGuard();
    const order: string[] = [];
    let firstPending = true;
    let secondPending = true;
    guard.register({
      inspect: () => ({ pending: firstPending, failed: false }),
      flush: async () => {
        order.push('first');
        firstPending = false;
      },
    });
    guard.register({
      inspect: () => ({ pending: secondPending, failed: false }),
      flush: async () => {
        expect(firstPending).toBe(false);
        order.push('second');
        secondPending = false;
      },
    });

    expect(guard.shouldBlockUnload()).toBe(true);
    await expect(guard.flushBeforeLeave()).resolves.toBe(true);
    expect(order).toEqual(['first', 'second']);
    expect(guard.shouldBlockUnload()).toBe(false);
  });

  it('returns false on rejection, keeps failed work blocking unload and supports unregister', async () => {
    const guard = createRouteLeaveGuard();
    const registration = {
      inspect: vi.fn(() => ({ pending: false, failed: true })),
      flush: vi.fn(async () => {
        throw new Error('offline');
      }),
    };
    const unregister = guard.register(registration);
    await expect(guard.flushBeforeLeave()).resolves.toBe(false);
    expect(guard.shouldBlockUnload()).toBe(true);
    unregister();
    expect(guard.shouldBlockUnload()).toBe(false);
  });
});
