import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { PlannerLibraryReadModels } from '../../application/planner/PlannerLibraryReadModels';

export function usePlannerLibraryReadModel(
  factory: Pick<PlannerLibraryReadModels, 'create'>,
  today: string,
  options: { readonly scope: string; readonly enabled: boolean },
) {
  const model = useMemo(() => factory.create(today), [factory, today, options.scope]);
  const subscribe = useCallback(
    (listener: () => void) => (options.enabled ? model.subscribe(listener) : () => undefined),
    [model, options.enabled],
  );
  const snapshot = useSyncExternalStore(subscribe, model.getSnapshot, model.getSnapshot);
  return { model, snapshot, refresh: model.refresh, whenSettled: model.whenSettled };
}
