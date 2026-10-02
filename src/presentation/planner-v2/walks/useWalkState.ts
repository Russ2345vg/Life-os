import { useCallback, useEffect, useRef, useState } from 'react';
import type { WalkServices } from '../../../application/walk/WalkServices';
import type { Walk } from '../../../domain/walk/Walk';
import type { WalkCapture } from '../../../domain/walk-capture/WalkCapture';
import type { WalkHistoryPage } from '../../../application/ports/WalkRepository';

export function useWalkState(services: WalkServices, id?: string) {
  const [data, setData] = useState<{
    active: readonly Walk[];
    history: WalkHistoryPage;
    captures: readonly WalkCapture[];
    selected: Walk | null;
  } | null>(null);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const [active, history, captures, selected] = await Promise.all([
        services.queries.getActive(),
        services.queries.list(),
        services.queries.listCaptures(),
        id ? services.queries.get(id) : Promise.resolve(null),
      ]);
      if (current === sequence.current) {
        setData({ active, history, captures, selected });
        setError('');
      }
    } catch (failure: unknown) {
      if (current === sequence.current) setError(walkError(failure));
    }
  }, [services, id]);
  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (alive) void refresh();
    });
    const unsubscribe = services.changes.subscribe(() => void refresh());
    const visible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', visible);
    document.addEventListener('visibilitychange', visible);
    const invalidate = () => {
      sequence.current++;
    };
    return () => {
      alive = false;
      invalidate();
      unsubscribe();
      window.removeEventListener('focus', visible);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh, services]);
  return { data, error, refresh };
}
export function walkError(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось сохранить. Повторите действие.';
}
export function useWalkMutation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const receipt = useRef<{ key: string; id: string } | null>(null);
  async function perform<T>(
    key: string,
    action: (requestId: string) => Promise<T>,
    success?: (result: T) => void,
  ): Promise<boolean> {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    setError('');
    if (receipt.current?.key !== key) receipt.current = { key, id: globalThis.crypto.randomUUID() };
    try {
      const result = await action(receipt.current.id);
      receipt.current = null;
      success?.(result);
      return true;
    } catch (failure: unknown) {
      setError(walkError(failure));
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return { busy, error, perform };
}
export function walkDuration(walk: Walk, now = new Date()): string {
  const seconds = Math.floor((walk.elapsedDurationMilliseconds(now) ?? 0) / 1000);
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
export const walkIntentLabel = (walk: Walk) =>
  walk.intent === 'recovery'
    ? 'Восстановиться'
    : walk.intent === 'reflection'
      ? 'Подумать'
      : 'Свободная прогулка';
