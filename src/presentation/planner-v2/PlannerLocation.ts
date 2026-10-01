import { buildPlannerRoute, parsePlannerRoute, type PlannerRoute } from './PlannerNavigation';

export interface PlannerLocation {
  readonly page: PlannerRoute;
  readonly actionPanel: { readonly actionId: string } | null;
}

export function parsePlannerLocation(hash: string): PlannerLocation | null {
  const page = parsePlannerRoute(hash);
  if (page === null) return null;
  const query = hash.slice(hash.indexOf('?') + 1);
  const actionId = hash.includes('?') ? new URLSearchParams(query).get('action')?.trim() : null;
  return { page, actionPanel: actionId ? { actionId } : null };
}

export function buildPlannerLocation(location: PlannerLocation): string {
  const hash = buildPlannerRoute(location.page);
  const id = location.actionPanel?.actionId.trim();
  if (!id) return hash;
  const separator = hash.includes('?') ? '&' : '?';
  return `${hash}${separator}${new URLSearchParams({ action: id })}`;
}
