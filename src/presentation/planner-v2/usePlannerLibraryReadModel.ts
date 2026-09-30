import { useMemo, useSyncExternalStore } from 'react';
import type { PlannerLibraryReadModels } from '../../application/planner/PlannerLibraryReadModels';

export function usePlannerLibraryReadModel(
  factory: Pick<PlannerLibraryReadModels, 'create'>,
  today: string,
) {
  const model = useMemo(() => factory.create(today), [factory, today]);
  const snapshot = useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
  return { snapshot, refresh: model.refresh, whenSettled: model.whenSettled };
}
