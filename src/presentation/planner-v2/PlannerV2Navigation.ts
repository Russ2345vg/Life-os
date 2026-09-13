export type PlannerV2Route =
  | { readonly view: 'today' }
  | { readonly view: 'goals' }
  | { readonly view: 'focus' }
  | { readonly view: 'actions' }
  | { readonly view: 'inbox' }
  | { readonly view: 'action'; readonly id: string }
  | { readonly view: 'new-goal' }
  | { readonly view: 'new-action'; readonly goalId: string | null; readonly title: string | null };

export function parsePlannerV2Route(hash: string): PlannerV2Route | null {
  const [path, query = ''] = hash.split('?');
  if (path === '#/v2/today') return { view: 'today' };
  if (path === '#/v2/goals') return { view: 'goals' };
  if (path === '#/v2/goals/focus') return { view: 'focus' };
  if (path === '#/v2/actions') return { view: 'actions' };
  if (path === '#/v2/inbox') return { view: 'inbox' };
  if (path?.startsWith('#/v2/actions/') && path !== '#/v2/actions/new') {
    try {
      const id = decodeURIComponent(path.slice('#/v2/actions/'.length));
      return id ? { view: 'action', id } : null;
    } catch {
      return null;
    }
  }
  if (path === '#/v2/goals/new') return { view: 'new-goal' };
  if (path !== '#/v2/actions/new') return null;
  const params = new URLSearchParams(query);
  return {
    view: 'new-action',
    goalId: params.get('goalId')?.trim() || null,
    title: params.get('title')?.trim() || null,
  };
}

export function buildPlannerV2Route(route: PlannerV2Route): string {
  if (route.view === 'today') return '#/v2/today';
  if (route.view === 'new-goal') return '#/v2/goals/new';
  if (route.view === 'goals') return '#/v2/goals';
  if (route.view === 'focus') return '#/v2/goals/focus';
  if (route.view === 'inbox') return '#/v2/inbox';
  if (route.view === 'actions') return '#/v2/actions';
  if (route.view === 'action') return `#/v2/actions/${encodeURIComponent(route.id)}`;
  const params = new URLSearchParams();
  if (route.goalId) params.set('goalId', route.goalId);
  if (route.title) params.set('title', route.title);
  return `#/v2/actions/new${params.size > 0 ? `?${params}` : ''}`;
}
