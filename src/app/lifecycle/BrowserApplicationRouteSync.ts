import {
  parseApplicationRoute,
  resolveInitialApplicationRoute,
  type ApplicationRoute,
} from '../../presentation/navigation/ApplicationRoute';

interface BrowserApplicationRouteSyncInput {
  readonly windowTarget: Window;
  readonly readHash: () => string;
  readonly restore: (route: ApplicationRoute) => void;
}

export function startBrowserApplicationRouteSync(
  input: BrowserApplicationRouteSyncInput,
): () => void {
  const restoreRoute = (): void => {
    const hash = input.readHash();
    if (hash === '') {
      input.restore(resolveInitialApplicationRoute(null));
      return;
    }
    const route = parseApplicationRoute(hash);
    if (route !== null) input.restore(route);
  };

  input.windowTarget.addEventListener('popstate', restoreRoute);
  input.windowTarget.addEventListener('hashchange', restoreRoute);
  return () => {
    input.windowTarget.removeEventListener('popstate', restoreRoute);
    input.windowTarget.removeEventListener('hashchange', restoreRoute);
  };
}
