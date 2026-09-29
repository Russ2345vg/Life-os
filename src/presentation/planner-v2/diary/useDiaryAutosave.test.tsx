import { describe, expect, it, vi } from 'vitest';
import { createRouteLeaveGuard } from '../../navigation/RouteLeaveGuard';
import { createDiaryAutosaveController, createDiaryAutosaveQueue } from './useDiaryAutosave';

describe('diary autosave queue', () => {
  it('writes sequentially and coalesces rapid edits into the latest payload', async () => {
    const releases: (() => void)[] = [];
    const saved: string[] = [];
    const save = vi.fn(
      (value: string) =>
        new Promise<void>((resolve) => {
          saved.push(value);
          releases.push(resolve);
        }),
    );
    const queue = createDiaryAutosaveQueue(save);
    queue.enqueue('п');
    queue.enqueue('при');
    queue.enqueue('привет');
    expect(saved).toEqual(['п']);
    expect(queue.inspect()).toEqual({ pending: true, failed: false });
    releases.shift()?.();
    await Promise.resolve();
    expect(saved).toEqual(['п', 'привет']);
    releases.shift()?.();
    await queue.flush();
    expect(queue.inspect()).toEqual({ pending: false, failed: false });
  });

  it('keeps the latest value after failure and retries it explicitly', async () => {
    let offline = true;
    const save = vi.fn(async (value: string) => {
      if (offline) throw new Error(`offline:${value}`);
    });
    const queue = createDiaryAutosaveQueue(save);
    queue.enqueue('локальный текст');
    await expect(queue.flush()).rejects.toThrow('offline');
    expect(queue.inspect()).toEqual({ pending: false, failed: true });
    offline = false;
    await expect(queue.retry()).resolves.toBeUndefined();
    expect(save).toHaveBeenLastCalledWith('локальный текст');
    expect(queue.inspect()).toEqual({ pending: false, failed: false });
  });

  it('keeps completion pending and failed inside the route leave guard until a retry succeeds', async () => {
    let release: () => void = () => {
      throw new Error('Completion was not started.');
    };
    const controller = createDiaryAutosaveController<string>(null, async () => ({ version: 1 }));
    const guard = createRouteLeaveGuard();
    guard.register(controller);
    const completion = controller.runOperation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    expect(controller.inspect()).toEqual({ pending: true, failed: false });
    expect(guard.shouldBlockUnload()).toBe(true);
    let leaveFinished = false;
    const leave = guard.flushBeforeLeave().then((allowed) => {
      leaveFinished = true;
      return allowed;
    });
    await Promise.resolve();
    expect(leaveFinished).toBe(false);
    release();
    await completion;
    await expect(leave).resolves.toBe(true);

    await expect(
      controller.runOperation(async () => {
        throw new Error('completion failed');
      }),
    ).rejects.toThrow('completion failed');
    expect(controller.inspect()).toEqual({ pending: false, failed: true });
    expect(guard.shouldBlockUnload()).toBe(true);
    await expect(guard.flushBeforeLeave()).resolves.toBe(false);
    await expect(controller.runOperation(async () => undefined)).resolves.toBeUndefined();
    expect(controller.inspect()).toEqual({ pending: false, failed: false });
    expect(guard.shouldBlockUnload()).toBe(false);
  });
});
