import type { AppSection } from '../../presentation/navigation/AppSection';
import { parseApplicationRoute } from '../../presentation/navigation/ApplicationRoute';
import { createApplicationSectionHistoryState } from './BrowserApplicationRouteSync';

interface ApplicationBrowserTarget {
  readonly location: Pick<Location, 'hash' | 'pathname' | 'search'>;
  readonly history: Pick<History, 'pushState'>;
}

interface ApplicationRoutePushBrowserTarget {
  readonly location: Pick<Location, 'hash' | 'pathname' | 'search'>;
  readonly history: Pick<History, 'pushState' | 'replaceState'>;
}

export function clearApplicationRouteFromBrowser(
  target: ApplicationBrowserTarget,
  nextSection: AppSection,
): void {
  if (parseApplicationRoute(target.location.hash) === null) return;
  target.history.pushState(
    createApplicationSectionHistoryState(nextSection),
    '',
    `${target.location.pathname}${target.location.search}`,
  );
}

export function pushApplicationRouteToBrowser(
  target: ApplicationRoutePushBrowserTarget,
  route: string,
  returnSection: AppSection,
): void {
  if (target.location.hash === '') {
    target.history.replaceState(
      createApplicationSectionHistoryState(returnSection),
      '',
      `${target.location.pathname}${target.location.search}`,
    );
  }
  target.history.pushState(null, '', route);
}
