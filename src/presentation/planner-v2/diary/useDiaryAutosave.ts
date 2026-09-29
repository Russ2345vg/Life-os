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
  const [, render] = useState(0);
  useEffect(() => controller.subscribe(() => render((value) => value + 1)), [controller]);
  useEffect(() => input.guard.register(controller), [controller, input.guard]);
  return {
    enqueue: controller.enqueue,
    flush: controller.flushDrafts,
    retry: controller.retryDraft,
    runOperation: controller.runOperation,
    inspect: controller.inspect(),
    draftFailed: controller.inspectDraft().failed,
    error: controller.draftFailure(),
    getVersion: controller.getVersion,
    replaceVersion: controller.replaceVersion,
  };
}

export function createDiaryAutosaveController<T>(
  initialVersion: number | null,
  saveDraft: (value: T, expectedVersion: number | null) => Promise<{ version: number }>,
) {
  let version = initialVersion;
  let activeOperation: Promise<void> | null = null;
  let operationFailure: unknown = null;
  const operationListeners = new Set<() => void>();
  const notifyOperation = () => operationListeners.forEach((listener) => listener());
  const queue = createDiaryAutosaveQueue(async (value: T) => {
    const saved = await saveDraft(value, version);
    version = saved.version;
  });
  return {
    enqueue(value: T) {
      operationFailure = null;
      queue.enqueue(value);
      notifyOperation();
    },
    flushDrafts: queue.flush,
    retryDraft: queue.retry,
    inspectDraft: queue.inspect,
    draftFailure: queue.failure,
    inspect() {
      const draft = queue.inspect();
      return {
        pending: draft.pending || activeOperation !== null,
        failed: draft.failed || operationFailure !== null,
      };
    },
    async flush() {
      await queue.flush();
      if (activeOperation !== null) await activeOperation;
      if (operationFailure !== null) throw operationFailure;
    },
    async runOperation<R>(operation: () => Promise<R>): Promise<R> {
      if (activeOperation !== null)
        throw new Error('Операция сохранения дневника уже выполняется.');
      operationFailure = null;
      const result = Promise.resolve().then(operation);
      activeOperation = result.then(() => undefined);
      void activeOperation.catch(() => undefined);
      notifyOperation();
      try {
        return await result;
      } catch (error: unknown) {
        operationFailure = error;
        throw error;
      } finally {
        activeOperation = null;
        notifyOperation();
      }
    },
    subscribe(listener: () => void) {
      operationListeners.add(listener);
      const unsubscribeQueue = queue.subscribe(listener);
      return () => {
        operationListeners.delete(listener);
        unsubscribeQueue();
      };
    },
    getVersion: () => version,
    replaceVersion: (next: number | null) => {
      version = next;
    },
  };
}
