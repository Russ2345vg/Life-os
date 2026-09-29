import {
  parseApplicationRoute,
  resolveInitialApplicationRoute,
  type ApplicationRoute,
} from '../../presentation/navigation/ApplicationRoute';

interface BrowserApplicationRouteSyncInput {
  readonly windowTarget: Window;
  readonly readHash: () => string;
  readonly restore: (route: ApplicationRoute) => void;
  readonly beforeRestore?: () => Promise<boolean>;
  readonly readAcceptedHash?: () => string;
  readonly replaceHash?: (hash: string) => void;
}

export function startBrowserApplicationRouteSync(
  input: BrowserApplicationRouteSyncInput,
): () => void {
  const scheduledHashes = new Set<string>();
  let queue = Promise.resolve();
  const restoreRoute = (): void => {
    const hash = input.readHash();
    if (scheduledHashes.has(hash)) return;
    scheduledHashes.add(hash);
    queue = queue.then(async () => {
      const targetHash = hash;
      const route =
        targetHash === ''
          ? resolveInitialApplicationRoute(null)
          : parseApplicationRoute(targetHash);
      try {
        if (route === null) return;
        if (input.beforeRestore && !(await input.beforeRestore())) {
          const accepted = input.readAcceptedHash?.();
          if (accepted !== undefined) input.replaceHash?.(accepted);
          return;
        }
        input.restore(route);
      } finally {
        scheduledHashes.delete(targetHash);
      }
    });
  };

  input.windowTarget.addEventListener('popstate', restoreRoute);
  input.windowTarget.addEventListener('hashchange', restoreRoute);
  return () => {
    input.windowTarget.removeEventListener('popstate', restoreRoute);
    input.windowTarget.removeEventListener('hashchange', restoreRoute);
  };
}
