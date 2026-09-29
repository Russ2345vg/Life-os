import { describe, expect, it, vi } from 'vitest';
import { createGuardedNavigator } from './ApplicationShell';

describe('ApplicationShell guarded navigation', () => {
  it('waits for pending writes before changing history and route', async () => {
    const order: string[] = [];
    const guard = {
      register: vi.fn(),
      shouldBlockUnload: vi.fn(() => false),
      flushBeforeLeave: vi.fn(async () => {
        order.push('flush');
        return true;
      }),
    };
    const push = vi.fn(() => order.push('history'));
    const commit = vi.fn(() => order.push('route'));
    const navigate = createGuardedNavigator(guard, push, commit);

    await navigate({ view: 'diary', period: 'day', date: '2026-09-29' });
    expect(order).toEqual(['flush', 'history', 'route']);
    expect(push).toHaveBeenCalledWith('#/v2/diary?period=day&date=2026-09-29');
  });

  it('keeps the current route when a save cannot be flushed', async () => {
    const push = vi.fn();
    const commit = vi.fn();
    const navigate = createGuardedNavigator(
      {
        register: vi.fn(),
        shouldBlockUnload: vi.fn(() => true),
        flushBeforeLeave: vi.fn(async () => false),
      },
      push,
      commit,
    );
    await expect(navigate({ view: 'goals' })).resolves.toBe(false);
    expect(push).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });
});
