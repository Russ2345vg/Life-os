import { useCallback, useEffect, useRef, useState } from 'react';
import type { BalanceState } from '../../../application/ports/BalanceRepository';
import type { BalanceServices } from '../../../application/balance/BalanceServices';
import { useSyncContentChanged } from '../../sync/SyncStatusContext';
import { useQuickAccess } from '../QuickAccessContext';
export function useBalanceState(services: BalanceServices, today: string) {
  const revision = useQuickAccess()?.revision ?? 0;
  const [state, setState] = useState<BalanceState | null>(null),
    [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const n = ++generation.current;
    try {
      const value = await services.read.execute();
      if (n === generation.current) {
        setState(value);
        setError(null);
      }
    } catch (e: unknown) {
      if (n === generation.current) {
        setError(e instanceof Error ? e.message : 'Не удалось загрузить состояние.');
        throw e;
      }
    }
  }, [services]);
  const refresh = useCallback(() => {
    void load().catch(() => undefined);
  }, [load]);
  useEffect(() => {
    let active = true;
    const requests = generation;
    queueMicrotask(() => {
      if (active) refresh();
    });
    return () => {
      active = false;
      requests.current++;
    };
  }, [refresh, today, revision]);
  useSyncContentChanged(
    'spheres|directions|goals|lifeActions|directionIndicators|balanceMonthlySnapshots|progressContributions|periodMemberships|periodDecisions|planningPeriods',
    refresh,
  );
  return { state, error, load, refresh };
}
