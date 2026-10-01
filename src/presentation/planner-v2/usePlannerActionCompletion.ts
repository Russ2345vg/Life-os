import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { CompleteLifeAction } from '../../application';
import type { LifeAction } from '../../domain';
import {
  PlannerActionCompletion,
  idleCompletion,
  type CompletionRefreshTask,
  type CompletionTarget,
} from './PlannerActionCompletion';

export function usePlannerActionCompletion(
  command: Pick<CompleteLifeAction, 'execute'>,
  scope: string,
  tasks: readonly CompletionRefreshTask[],
  onCommitted: (action: LifeAction) => void,
) {
  const session = useMemo(
    () => ({ scope, ...createCompletionSession(command, tasks) }),
    [command, scope, tasks],
  );
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    () => idleCompletion,
  );
  const prompted = useRef<string | null>(null);
  useEffect(() => {
    if (snapshot.phase === 'saved' && prompted.current !== snapshot.receipt.completionKey) {
      prompted.current = snapshot.receipt.completionKey;
      onCommitted(snapshot.receipt.action);
    }
  }, [snapshot, onCommitted]);
  const busy =
    snapshot.phase === 'saving' || (snapshot.phase === 'saved' && snapshot.refresh === 'pending');
  const error =
    snapshot.phase === 'not_saved'
      ? snapshot.error.message
      : snapshot.phase === 'saved' && snapshot.refresh === 'failed'
        ? 'Действие выполнено. Не удалось обновить данные на экране.'
        : null;
  return {
    snapshot,
    busy,
    error,
    complete: session.complete,
    retry: session.retry,
    dismiss: session.dismiss,
  };
}

// Own subscription lifetime outside React render, including StrictMode re-subscriptions.
function createCompletionSession(
  command: Pick<CompleteLifeAction, 'execute'>,
  tasks: readonly CompletionRefreshTask[],
) {
  let controller: PlannerActionCompletion | null = null;
  return {
    subscribe(listener: () => void) {
      const active = (controller ??= new PlannerActionCompletion(command, tasks));
      const unsubscribe = active.subscribe(listener);
      return () => {
        unsubscribe();
        active.close();
        if (controller === active) controller = null;
      };
    },
    getSnapshot: () => controller?.getSnapshot() ?? idleCompletion,
    complete: (target: CompletionTarget) => controller?.complete(target) ?? Promise.resolve(),
    retry: () => controller?.retryRefresh() ?? Promise.resolve(),
    dismiss: () => controller?.dismissFeedback(),
  };
}
