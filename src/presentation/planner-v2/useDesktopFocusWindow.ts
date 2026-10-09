import { useEffect, useRef, useState } from 'react';
import type { DesktopFocusWindow } from '../../application/ports/DesktopFocusWindow';

export function useDesktopFocusWindow(port: DesktopFocusWindow | undefined, active: boolean) {
  const [compact, setCompact] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    if (!port?.available) return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void port
      .subscribe((mode, nativeError) => {
        if (disposed) return;
        setCompact(mode);
        setError(nativeError ?? null);
      })
      .then((stop) => {
        if (disposed) stop();
        else unsubscribe = stop;
      })
      .catch((reason: unknown) => {
        if (!disposed)
          setError(reason instanceof Error ? reason.message : 'Мини-таймер недоступен.');
      });
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [port]);
  useEffect(() => {
    if (!port?.available) return;
    queue.current = queue.current
      .then(() => port.setActive(active))
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : 'Не удалось переключить окно фокуса.'),
      );
  }, [port, active]);
  useEffect(() => {
    const root = document.getElementById('root');
    document.documentElement.classList.toggle('lifeos-focus-compact', compact);
    if (root) root.inert = compact;
    return () => {
      document.documentElement.classList.remove('lifeos-focus-compact');
      if (root) root.inert = false;
    };
  }, [compact]);
  const restore = async () => {
    try {
      await port?.restore();
      setError(null);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Не удалось открыть LifeOS.');
    }
  };
  return { compact, error, restore };
}
