import { parsePlannerRoute, type PlannerRoute } from '../planner-v2/PlannerNavigation';

export type ApplicationRoute = PlannerRoute;

export function parseApplicationRoute(hash: string): ApplicationRoute | null {
  return parsePlannerRoute(hash);
}

export function resolveInitialApplicationRoute(route: ApplicationRoute | null): ApplicationRoute {
  return route ?? { view: 'today' };
}
