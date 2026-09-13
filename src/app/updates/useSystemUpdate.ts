import { useCallback, useEffect, useMemo, useState } from 'react';
import packageMetadata from '../../../package.json';
import {
  SystemUpdateCoordinator,
  isBackgroundUpdateCheckDue,
  type SystemUpdateRuntime,
  type SystemUpdateState,
} from '../../application/updates/SystemUpdate';
import { TauriSystemUpdateService } from '../../infrastructure/updates/TauriSystemUpdateService';

const LAST_BACKGROUND_CHECK_KEY = 'lifeos.system-update.last-check';
const BACKGROUND_CHECK_DELAY_MS = 8_000;

export function useSystemUpdate(): SystemUpdateRuntime {
  const coordinator = useMemo(
    () =>
      new SystemUpdateCoordinator(
        packageMetadata.version,
        new TauriSystemUpdateService(import.meta.env.VITE_LIFEOS_ANDROID_UPDATE_ENDPOINT),
      ),
    [],
  );
  const [state, setState] = useState<SystemUpdateState>(coordinator.currentState);

  useEffect(() => coordinator.subscribe(setState), [coordinator]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const now = Date.now();
      const lastCheck = safeReadLastCheck();
      if (!isBackgroundUpdateCheckDue(lastCheck, now)) return;
      safeWriteLastCheck(new Date(now).toISOString());
      void coordinator.check({ quiet: true });
    }, BACKGROUND_CHECK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [coordinator]);

  const check = useCallback(() => void coordinator.check(), [coordinator]);
  const install = useCallback(() => void coordinator.install(), [coordinator]);
  return { state, check, install };
}

function safeReadLastCheck(): string | null {
  try {
    return window.localStorage.getItem(LAST_BACKGROUND_CHECK_KEY);
  } catch {
    return null;
  }
}

function safeWriteLastCheck(value: string): void {
  try {
    window.localStorage.setItem(LAST_BACKGROUND_CHECK_KEY, value);
  } catch {
    // A blocked localStorage must not prevent a manual update check.
  }
}
