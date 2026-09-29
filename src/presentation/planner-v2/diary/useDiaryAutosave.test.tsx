import { describe, expect, it, vi } from 'vitest';
import { createDiaryAutosaveQueue } from './useDiaryAutosave';

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
});
