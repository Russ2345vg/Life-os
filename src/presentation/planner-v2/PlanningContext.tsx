import { createGoalProgressReader } from '../../application/planner/GoalContributions';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { PlanningServices } from '../../application/planner/PlanningServices';
import type { PlanningState } from '../../application/ports/PlanningRepository';
import { useSyncContentChanged } from '../sync/SyncStatusContext';
interface PlanningContextValue {
  readonly progress: ReturnType<typeof createGoalProgressReader>;
  readonly today: string;
  readonly services: PlanningServices;
  readonly state: PlanningState | null;
  readonly refresh: () => Promise<void>;
  readonly error: string | null;
}
const Context = createContext<PlanningContextValue | null>(null);
// eslint-disable-next-line react-refresh/only-export-components
export function usePlanning() {
  return useContext(Context);
}
export function PlanningProvider({
  services,
  today,
  children,
  refreshToken,
}: {
  readonly services?: PlanningServices | undefined;
  readonly today: string;
  readonly children: ReactNode;
  readonly refreshToken?: unknown;
}) {
  const [state, setState] = useState<PlanningState | null>(null),
    [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const refresh = useCallback(() => {
    const request = ++sequence.current;
    if (!services) return Promise.resolve();
    return services.recurrence
      .materialize(today)
      .then(() => services.periods.load())
      .then((next) => {
        if (request === sequence.current) {
          setState(next);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (request === sequence.current)
          setError(reason instanceof Error ? reason.message : 'Не удалось загрузить планирование.');
      });
  }, [services, today]);
  const invalidate = useCallback(() => {
    sequence.current++;
  }, []);
  useEffect(() => {
    void refresh();
    return invalidate;
  }, [refresh, refreshToken, invalidate]);
  useSyncContentChanged(
    'goals|lifeActions|planningPeriods|periodMemberships|periodDecisions|recurrenceRules|contributionLinks|progressContributions',
    () => {
      void refresh();
    },
  );
  const progress = useMemo(() => (state ? createGoalProgressReader(state) : () => null), [state]);
  return (
    <Context.Provider
      value={services ? { today, services, state, refresh, error, progress } : null}
    >
      {children}
    </Context.Provider>
  );
}
