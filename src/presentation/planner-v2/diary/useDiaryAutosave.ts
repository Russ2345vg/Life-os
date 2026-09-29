import { useEffect, useState } from 'react';
import type { RouteLeaveGuard } from '../../navigation/RouteLeaveGuard';

export interface DiaryAutosaveQueue<T> {
  enqueue(value: T): void;
  flush(): Promise<void>;
  retry(): Promise<void>;
  inspect(): { readonly pending: boolean; readonly failed: boolean };
  failure(): unknown;
  subscribe(listener: () => void): () => void;
}

export function createDiaryAutosaveQueue<T>(
  save: (value: T) => Promise<void>,
): DiaryAutosaveQueue<T> {
  let latest: T | null = null;
  let failed: T | null = null;
  let failure: unknown = null;
  let active: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const start = () => {
    if (active !== null || latest === null) return;
    active = (async () => {
      while (latest !== null) {
        const value = latest;
        latest = null;
        notify();
        try {
          await save(value);
          failed = null;
          failure = null;
        } catch (error: unknown) {
          failed = latest ?? value;
          latest = null;
          failure = error;
          throw error;
        }
      }
    })().finally(() => {
      active = null;
      notify();
      if (latest !== null) start();
    });
    void active.catch(() => undefined);
    notify();
  };
  const flush = async () => {
    start();
    if (active !== null) await active;
    if (failure !== null) throw failure;
  };
  return {
    enqueue(value) {
      latest = value;
      failed = null;
      failure = null;
      notify();
      start();
    },
    flush,
    async retry() {
      if (failed !== null) {
        latest = failed;
        failed = null;
        failure = null;
        notify();
      }
      await flush();
    },
    inspect() {
      return { pending: active !== null || latest !== null, failed: failed !== null };
    },
    failure: () => failure,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useDiaryAutosave<T>(input: {
  readonly initialVersion: number | null;
  readonly saveDraft: (value: T, expectedVersion: number | null) => Promise<{ version: number }>;
  readonly guard: RouteLeaveGuard;
}) {
  const [controller] = useState(() =>
    createDiaryAutosaveController(input.initialVersion, input.saveDraft),
  );
  const autosave = controller.queue;
  const [, render] = useState(0);
  useEffect(() => autosave.subscribe(() => render((value) => value + 1)), [autosave]);
  useEffect(
    () =>
      input.guard.register({
        inspect: () => autosave.inspect(),
        flush: () => autosave.flush(),
      }),
    [autosave, input.guard],
  );
  return {
    enqueue: autosave.enqueue,
    flush: autosave.flush,
    retry: autosave.retry,
    inspect: autosave.inspect(),
    error: autosave.failure(),
    getVersion: controller.getVersion,
    replaceVersion: controller.replaceVersion,
  };
}

function createDiaryAutosaveController<T>(
  initialVersion: number | null,
  saveDraft: (value: T, expectedVersion: number | null) => Promise<{ version: number }>,
) {
  let version = initialVersion;
  const queue = createDiaryAutosaveQueue(async (value: T) => {
    const saved = await saveDraft(value, version);
    version = saved.version;
  });
  return {
    queue,
    getVersion: () => version,
    replaceVersion: (next: number | null) => {
      version = next;
    },
  };
}
