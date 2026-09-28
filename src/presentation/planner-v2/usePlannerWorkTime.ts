import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActionSession } from '../../domain';
import type { WorkSessions } from '../../application/time/WorkSessions';
import { useSyncContentChanged } from '../sync/SyncStatusContext';

type Service = Pick<WorkSessions, 'list' | 'start' | 'pause' | 'resume' | 'finish'>;
export interface PlannerWorkTimeController {
  readonly sessions: readonly ActionSession[] | null;
  readonly error: string | null;
  readonly notice: string | null;
  readonly busy: boolean;
  readonly revision: number;
  readonly refresh: () => Promise<void>;
  readonly start: (actionId: string) => Promise<void>;
  readonly pause: (id: string, version: number) => Promise<void>;
  readonly resume: (id: string, version: number) => Promise<void>;
  readonly finish: (id: string, version: number) => Promise<void>;
}

/** One presentation snapshot above route changes; every refresh reads the application port. */
export function usePlannerWorkTime(service: Service | undefined): PlannerWorkTimeController {
  const [sessions, setSessions] = useState<readonly ActionSession[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const request = useRef(0);
  const signature = useRef<string | null>(null);
  const working = useRef(false);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  const reload = useCallback(async () => {
    const sequence = ++request.current;
    if (!service) return;
    try {
      const fresh = await service.list();
      if (sequence !== request.current) return;
      setSessions(fresh);
      setLoadError(null);
      const next = fresh
        .map((session) => `${session.id.toString()}:${session.version}`)
        .sort()
        .join('|');
      if (next !== signature.current) {
        signature.current = next;
        setRevision((value) => value + 1);
      }
    } catch (reason: unknown) {
      if (sequence === request.current) setLoadError(message(reason));
      throw reason;
    }
  }, [service]);
  const refresh = useCallback(async () => {
    setCommandError(null);
    await reload();
  }, [reload]);
  useEffect(() => {
    if (!service) return;
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') void reload().catch(() => {});
    };
    refreshVisible();
    window.addEventListener('focus', refreshVisible);
    window.addEventListener('pageshow', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    const timer = window.setInterval(refreshVisible, 5000);
    return () => {
      request.current += 1;
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshVisible);
      window.removeEventListener('pageshow', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [service, reload]);
  useSyncContentChanged(
    'actionSessions',
    useCallback(() => {
      void reload().catch(() => {});
    }, [reload]),
  );
  const run = async (work: () => Promise<unknown>, success: string) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setCommandError(null);
    setNotice(null);
    try {
      await work();
      await reload();
      setNotice(success);
    } catch (reason: unknown) {
      setCommandError(message(reason));
      await reload().catch(() => {});
      throw reason;
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  return {
    sessions,
    error: service ? (commandError ?? loadError) : 'Рабочие сессии недоступны в этой сборке.',
    notice,
    busy,
    revision,
    refresh,
    start: (actionId) => run(() => service!.start(actionId), 'Работа начата'),
    pause: (id, version) => run(() => service!.pause(id, version), 'Работа на паузе'),
    resume: (id, version) => run(() => service!.resume(id, version), 'Работа продолжена'),
    finish: (id, version) =>
      run(() => service!.finish(id, version), 'Работа сохранена. Действие можно продолжить позже.'),
  };
}
function message(reason: unknown): string {
  return reason instanceof Error
    ? reason.message
    : 'Не удалось обновить рабочие сессии. Повторите попытку.';
}
