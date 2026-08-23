import { MANAGEMENT_SECTION, type ManagementSection } from './ManagementSection';

export interface ManagementRoute {
  readonly section: ManagementSection;
  readonly directionId: string | null;
  readonly projectId: string | null;
  readonly decisionId: string | null;
}

export interface ManagementNavigationState {
  readonly route: ManagementRoute;
  readonly history: readonly ManagementRoute[];
}

export const INITIAL_MANAGEMENT_NAVIGATION: ManagementNavigationState = {
  route: {
    section: MANAGEMENT_SECTION.overview,
    directionId: null,
    projectId: null,
    decisionId: null,
  },
  history: [],
};

export function openManagementSection(section: ManagementSection): ManagementNavigationState {
  return { route: { section, directionId: null, projectId: null, decisionId: null }, history: [] };
}

export function pushManagementRoute(
  state: ManagementNavigationState,
  route: ManagementRoute,
  origin: ManagementRoute = state.route,
): ManagementNavigationState {
  return { route, history: [...state.history, origin] };
}

export function popManagementRoute(state: ManagementNavigationState): ManagementNavigationState {
  const previous = state.history.at(-1);
  if (previous === undefined) {
    return {
      route: { ...state.route, directionId: null, projectId: null, decisionId: null },
      history: [],
    };
  }
  return { route: previous, history: state.history.slice(0, -1) };
}
