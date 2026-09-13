import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { SyncApplication } from '../../application/sync/SyncApplicationService';
import type { PilotSyncStatus } from '../../application/sync/pilot/PilotSyncCoordinator';
import type { SyncStatusSnapshot } from '../../application/sync/SyncStatus';
import { presentSyncStatus } from './syncStatusPresentation';

interface SyncContextValue {
  readonly sync: SyncApplication | null;
  readonly data: SyncStatusSnapshot | null;
  readonly pilot: PilotSyncStatus;
  readonly online: boolean;
  readonly readState: 'loading' | 'ready' | 'error';
}
const SyncContext = createContext<SyncContextValue>({
  sync: null,
  data: null,
  pilot: { state: 'idle', pendingCount: 0, conflictCount: 0, lastSuccessfulSyncAt: null },
  online: true,
  readState: 'ready',
});

export function SyncStatusProvider({
  sync,
  children,
}: {
  readonly sync: SyncApplication;
  readonly children: ReactNode;
}) {
  const [data, setData] = useState<SyncStatusSnapshot | null>(null);
  const [readState, setReadState] = useState<'loading' | 'ready' | 'error'>(
    sync.statusSource ? 'loading' : 'ready',
  );
  const [pilot, setPilot] = useState(() => sync.pilotStatus());
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => sync.subscribePilotStatus(setPilot), [sync]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    const source = sync.statusSource;
    if (!source) return;
    let active = true;
    let reading = false;
    let dirty = false;
    const read = async () => {
      dirty = true;
      if (reading) return;
      reading = true;
      try {
        while (active && dirty) {
          dirty = false;
          const next = await source.read();
          if (active) {
            setData(next);
            setReadState('ready');
          }
        }
      } catch {
        if (active) setReadState('error');
      } finally {
        reading = false;
      }
    };
    const unsubscribe = source.subscribe(() => {
      void read();
    });
    const stopStatus = sync.subscribePilotStatus(() => {
      void read();
    });
    void read();
    return () => {
      active = false;
      unsubscribe();
      stopStatus();
    };
  }, [sync]);
  return (
    <SyncContext.Provider value={{ sync, data, pilot, online, readState }}>
      {children}
    </SyncContext.Provider>
  );
}

// Shared once per shell: media cards consume metadata, never query or copy image blobs.
// eslint-disable-next-line react-refresh/only-export-components
export function useSyncStatus() {
  const context = useContext(SyncContext);
  const presentation =
    context.readState === 'error'
      ? {
          state: 'error' as const,
          label: 'Статус синхронизации недоступен. Повторите проверку.',
          shortLabel: 'Статус недоступен',
        }
      : context.readState === 'loading'
        ? { state: 'pending' as const, label: 'Проверяем синхронизацию…', shortLabel: 'Проверяем…' }
        : presentSyncStatus(context.pilot, context.data, context.online);
  return { ...context, presentation };
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSyncContentChanged(store: string, refresh: () => void): void {
  const { sync } = useContext(SyncContext);
  const notify = useCallback(
    (stores: readonly string[]) => {
      if (store.split('|').some((name) => stores.includes(name))) refresh();
    },
    [store, refresh],
  );
  useEffect(() => sync?.statusSource?.subscribe(notify), [sync, notify]);
}
