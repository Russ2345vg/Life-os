import {
  parseApplicationRoute,
  type RoutedApplicationSection,
} from '../../presentation/navigation/ApplicationRoute';
import {
  APP_SECTION,
  resolveMenuEntrySection,
  type AppSection,
} from '../../presentation/navigation/AppSection';

export const APPLICATION_SECTION_HISTORY_STATE_KEY = 'lifeosApplicationSection';

export function createApplicationSectionHistoryState(
  section: AppSection,
): Readonly<Record<typeof APPLICATION_SECTION_HISTORY_STATE_KEY, AppSection>> {
  return { [APPLICATION_SECTION_HISTORY_STATE_KEY]: resolveMenuEntrySection(section) };
}

function readApplicationSectionFromHistoryState(state: unknown): AppSection | null {
  if (typeof state !== 'object' || state === null) return null;
  const section = Reflect.get(state, APPLICATION_SECTION_HISTORY_STATE_KEY);
  if (typeof section !== 'string') return null;
  return Object.values(APP_SECTION).some((candidate) => candidate === section)
    ? resolveMenuEntrySection(section as AppSection)
    : null;
}

export interface BrowserApplicationRouteSyncInput {
  readonly windowTarget: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  readonly readHash: () => string;
  readonly readHistoryState: () => unknown;
  readonly restore: (route: RoutedApplicationSection) => void;
  readonly restoreSection: (section: AppSection) => void;
}

export function startBrowserApplicationRouteSync(
  input: BrowserApplicationRouteSyncInput,
): () => void {
  const restoreRoute = (): void => {
    const hash = input.readHash();
    const route = parseApplicationRoute(hash);
    if (route !== null) {
      input.restore(route);
      return;
    }
    if (hash !== '') return;
    const section = readApplicationSectionFromHistoryState(input.readHistoryState());
    if (section === APP_SECTION.today) {
      input.restore({ section: APP_SECTION.today, route: { view: 'today' } });
    } else if (section !== null) {
      input.restoreSection(section);
    }
  };

  input.windowTarget.addEventListener('popstate', restoreRoute);
  input.windowTarget.addEventListener('hashchange', restoreRoute);

  return () => {
    input.windowTarget.removeEventListener('popstate', restoreRoute);
    input.windowTarget.removeEventListener('hashchange', restoreRoute);
  };
}
