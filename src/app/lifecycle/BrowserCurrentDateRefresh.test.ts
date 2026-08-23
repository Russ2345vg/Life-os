import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Clock } from '../../application';
import { startBrowserCurrentDateRefresh } from './BrowserCurrentDateRefresh';

describe('startBrowserCurrentDateRefresh', () => {
  afterEach(() => vi.useRealTimers());

  it('обновляет дату при visibilitychange, focus, pageshow и пересечении полуночи', async () => {
    vi.useFakeTimers();
    const documentTarget = new EventTarget() as unknown as Document;
    const windowTarget = new EventTarget() as unknown as Window;
    let visibilityState: DocumentVisibilityState = 'hidden';
    Object.defineProperty(documentTarget, 'visibilityState', {
      configurable: true,
      get: () => visibilityState,
    });
    const clock = new MutableClock(new Date(2026, 7, 14, 23, 59, 59, 900));
    const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const stop = startBrowserCurrentDateRefresh({
      clock,
      documentTarget,
      windowTarget,
      refresh,
    });

    documentTarget.dispatchEvent(new Event('visibilitychange'));
    await flushPromises();
    expect(refresh).toHaveBeenCalledTimes(0);

    visibilityState = 'visible';
    documentTarget.dispatchEvent(new Event('visibilitychange'));
    await flushPromises();
    windowTarget.dispatchEvent(new Event('focus'));
    await flushPromises();
    windowTarget.dispatchEvent(new Event('pageshow'));
    await flushPromises();
    expect(refresh).toHaveBeenCalledTimes(3);

    clock.setTime(new Date(2026, 7, 15, 0, 0, 0, 50));
    await vi.advanceTimersByTimeAsync(150);
    await flushPromises();
    expect(refresh).toHaveBeenCalledTimes(4);

    stop();
    windowTarget.dispatchEvent(new Event('focus'));
    await flushPromises();
    expect(refresh).toHaveBeenCalledTimes(4);
  });
});

class MutableClock implements Clock {
  #time: Date;

  public constructor(time: Date) {
    this.#time = time;
  }

  public now(): Date {
    return new Date(this.#time.getTime());
  }

  public setTime(time: Date): void {
    this.#time = new Date(time.getTime());
  }
}

async function flushPromises(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}
