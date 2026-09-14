export type PlannerV2Route =
  | { readonly view: 'spheres' }
  | { readonly view: 'sphere'; readonly id: string }
  | { readonly view: 'direction'; readonly id: string }
  | { readonly view: 'goal'; readonly id: string }
  | { readonly view: 'planning'; readonly sphereId?: string }
  | { readonly view: 'today' }
  | { readonly view: 'goals'; readonly sphereId?: string }
  | { readonly view: 'focus' }
  | { readonly view: 'actions' }
  | { readonly view: 'inbox' }
  | { readonly view: 'kanban' | 'calendar' | 'tree'; readonly section: 'goals' | 'actions' }
  | { readonly view: 'action'; readonly id: string }
  | { readonly view: 'new-goal' }
  | { readonly view: 'new-action'; readonly goalId: string | null; readonly title: string | null };

export function parsePlannerV2Route(hash: string): PlannerV2Route | null {
  const [path, query = ''] = hash.split('?');
  const view = new URLSearchParams(query).get('view');
  const sphereId = new URLSearchParams(query).get('sphereId')?.trim();
  const filter = sphereId ? { sphereId } : {};
  if (path === '#/v2/spheres') return { view: 'spheres' };
  for (const [prefix, detail] of [
    ['#/v2/spheres/', 'sphere'],
    ['#/v2/directions/', 'direction'],
  ] as const) {
    if (path?.startsWith(prefix)) {
      try {
        const id = decodeURIComponent(path.slice(prefix.length));
        return id ? { view: detail, id } : null;
      } catch {
        return null;
      }
    }
  }
  if (
    (path === '#/v2/goals' || path === '#/v2/actions') &&
    (view === 'kanban' || view === 'calendar' || view === 'tree')
  )
    return { view, section: path === '#/v2/goals' ? 'goals' : 'actions' };
  if (path === '#/v2/goals/plans' || path === '#/v2/planning')
    return { view: 'planning', ...filter };
  if (path === '#/v2/today') return { view: 'today' };
  if (path === '#/v2/goals') return { view: 'goals', ...filter };
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
  if (path?.startsWith('#/v2/goals/') && path !== '#/v2/goals/new') {
    try {
      const id = decodeURIComponent(path.slice('#/v2/goals/'.length));
      return id ? { view: 'goal', id } : null;
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
  if (route.view === 'spheres') return '#/v2/spheres';
  if (route.view === 'sphere') return `#/v2/spheres/${encodeURIComponent(route.id)}`;
  if (route.view === 'direction') return `#/v2/directions/${encodeURIComponent(route.id)}`;
  const filter =
    'sphereId' in route && route.sphereId
      ? `?${new URLSearchParams({ sphereId: route.sphereId })}`
      : '';
  if ('section' in route) return `#/v2/${route.section}?view=${route.view}`;
  if (route.view === 'planning') return `#/v2/goals/plans${filter}`;
  if (route.view === 'today') return '#/v2/today';
  if (route.view === 'new-goal') return '#/v2/goals/new';
  if (route.view === 'goals') return `#/v2/goals${filter}`;
  if (route.view === 'focus') return '#/v2/goals/focus';
  if (route.view === 'inbox') return '#/v2/inbox';
  if (route.view === 'actions') return '#/v2/actions';
  if (route.view === 'goal') return `#/v2/goals/${encodeURIComponent(route.id)}`;
  if (route.view === 'action') return `#/v2/actions/${encodeURIComponent(route.id)}`;
  const params = new URLSearchParams();
  if (route.goalId) params.set('goalId', route.goalId);
  if (route.title) params.set('title', route.title);
  return `#/v2/actions/new${params.size > 0 ? `?${params}` : ''}`;
}
