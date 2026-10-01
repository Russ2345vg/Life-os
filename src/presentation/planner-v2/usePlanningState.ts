import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createGoalProgressReader } from '../../application/planner/GoalContributions';
import type { PlanningServices } from '../../application/planner/PlanningServices';
import type { PlanningState } from '../../application/ports/PlanningRepository';
import { useSyncContentChanged } from '../sync/SyncStatusContext';
import {
  LatestPlannerRefresh,
  queuePlannerRefresh,
  type PlanningRefreshOutcome,
} from './plannerCompletionRefresh';

export interface PlanningContextValue {
  readonly progress: ReturnType<typeof createGoalProgressReader>;
  readonly today: string;
  readonly services: PlanningServices;
  readonly state: PlanningState | null;
  readonly refresh: () => Promise<void>;
  readonly refreshWithOutcome: () => Promise<PlanningRefreshOutcome>;
  readonly error: string | null;
  readonly refreshing: boolean;
}

export function usePlanningState(
  services: PlanningServices | undefined,
  today: string,
  refreshToken: unknown,
): PlanningContextValue | null {
  const scope = useMemo(
    () => ({ services, today, session: new LatestPlannerRefresh() }),
    [services, today],
  );
  const session = scope.session;
  const [snapshot, setSnapshot] = useState<{
    session: LatestPlannerRefresh;
    state: PlanningState | null;
    error: string | null;
  }>({ session, state: null, error: null });
  const requestSequence = useRef(0);
  const [pending, setPending] = useState<{
    session: LatestPlannerRefresh;
    sequence: number;
  } | null>(null);
  const refreshWithOutcome = useCallback(async (): Promise<PlanningRefreshOutcome> => {
    if (!services) return { status: 'ready' };
    const sequence = ++requestSequence.current;
    setPending({ session, sequence });
    const outcome = await session.run(
      async () => {
        await services.recurrence.materialize(today);
        return services.periods.load();
      },
      (state) => setSnapshot({ session, state, error: null }),
    );
    if (outcome.status === 'failed')
      setSnapshot((previous) => ({
        session,
        state: previous.session === session ? previous.state : null,
        error: outcome.error.message,
      }));
    setPending((previous) =>
      previous?.session === session && previous.sequence === sequence ? null : previous,
    );
    return outcome;
  }, [session, services, today]);
  const refresh = useCallback(async () => {
    await refreshWithOutcome();
  }, [refreshWithOutcome]);
  useEffect(() => () => session.reset(), [session]);
  useEffect(() => queuePlannerRefresh(refresh), [refresh, refreshToken]);
  const refreshFromSync = useCallback(() => {
    void refresh();
  }, [refresh]);
  useSyncContentChanged(
    'goals|lifeActions|planningPeriods|periodMemberships|periodDecisions|recurrenceRules|contributionLinks|progressContributions',
    refreshFromSync,
  );
  const state = snapshot.session === session ? snapshot.state : null;
  const error = snapshot.session === session ? snapshot.error : null;
  const refreshing = pending?.session === session;
  const progress = useMemo(() => (state ? createGoalProgressReader(state) : () => null), [state]);
  return services
    ? { services, today, state, error, refreshing, progress, refresh, refreshWithOutcome }
    : null;
}
