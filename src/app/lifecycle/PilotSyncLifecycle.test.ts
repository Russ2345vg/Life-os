import { describe, expect, it, vi } from 'vitest';
import { PilotSyncLifecycle } from './PilotSyncLifecycle';

describe('PilotSyncLifecycle', () => {
  it('does not poll a hidden app and catches up once foregrounded', () => {
    vi.useFakeTimers();
    const coordinator = { trigger: vi.fn() };
    const target = new EventTarget();
    const document = Object.assign(new EventTarget(), {
      visibilityState: 'hidden' as DocumentVisibilityState,
    });
    const lifecycle = new PilotSyncLifecycle(coordinator as never, target, document);
    lifecycle.start();
    coordinator.trigger.mockClear();
    vi.advanceTimersByTime(90_000);
    target.dispatchEvent(new Event('online'));
    expect(coordinator.trigger).not.toHaveBeenCalled();
    document.visibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(coordinator.trigger).toHaveBeenCalledOnce();
    lifecycle.close();
    vi.useRealTimers();
  });
  it('uses startup, online and foreground only as coalesced sync hints', () => {
    vi.useFakeTimers();
    const coordinator = { trigger: vi.fn() };
    const target = new EventTarget();
    const document = Object.assign(new EventTarget(), { visibilityState: 'visible' as const });
    const lifecycle = new PilotSyncLifecycle(coordinator as never, target, document);
    lifecycle.start();
    expect(coordinator.trigger).toHaveBeenCalledOnce();
    target.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(30_000);
    expect(coordinator.trigger).toHaveBeenCalledTimes(4);
    lifecycle.close();
    vi.useRealTimers();
  });
});
