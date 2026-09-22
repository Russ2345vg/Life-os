export type PlannerV2Route =
  | { readonly view: 'spheres' }
  | { readonly view: 'directions' }
  | { readonly view: 'sphere'; readonly id: string }
  | { readonly view: 'direction'; readonly id: string }
  | { readonly view: 'goal'; readonly id: string; readonly edit?: boolean }
  | { readonly view: 'planning'; readonly sphereId?: string }
  | { readonly view: 'today'; readonly day?: 'tomorrow' }
  | { readonly view: 'sleep' }
  | {
      readonly view: 'goals';
      readonly sphereId?: string;
      readonly period?: 'year' | 'quarter' | 'thirty_days' | 'week' | 'none';
    }
  | { readonly view: 'focus' }
  | { readonly view: 'actions' }
  | { readonly view: 'inbox' }
  | { readonly view: 'kanban' | 'calendar' | 'tree'; readonly section: 'goals' | 'actions' }
  | { readonly view: 'action'; readonly id: string }
  | { readonly view: 'new-goal'; readonly directionId?: string }
  | {
      readonly view: 'new-action';
      readonly directionId?: string;
      readonly goalId: string | null;
      readonly title: string | null;
      readonly date?: string;
      readonly parentActionId?: string;
      readonly returnToGoal?: boolean;
    };

export function parsePlannerV2Route(hash: string): PlannerV2Route | null {
  const [path, query = ''] = hash.split('?');
  const view = new URLSearchParams(query).get('view');
  const sphereId = new URLSearchParams(query).get('sphereId')?.trim();
  const filter = sphereId ? { sphereId } : {};
  if (path === '#/v2/spheres') return { view: 'spheres' };
  if (path === '#/v2/directions') return { view: 'directions' };
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
    return { view: 'goals', ...filter, period: 'week' };
  if (path === '#/v2/today')
    return {
      view: 'today',
      ...(new URLSearchParams(query).get('day') === 'tomorrow' ? { day: 'tomorrow' as const } : {}),
    };
  if (path === '#/v2/sleep') return { view: 'sleep' };
  if (path === '#/v2/goals') {
    const period = new URLSearchParams(query).get('period');
    return {
      view: 'goals',
      ...filter,
      ...(period && ['year', 'quarter', 'thirty_days', 'week', 'none'].includes(period)
        ? { period: period as 'year' | 'quarter' | 'thirty_days' | 'week' | 'none' }
        : {}),
    };
  }
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
      return id
        ? {
            view: 'goal',
            id,
            ...(new URLSearchParams(query).get('edit') === '1' ? { edit: true } : {}),
          }
        : null;
    } catch {
      return null;
    }
  }
  if (path === '#/v2/goals/new') {
    const directionId = new URLSearchParams(query).get('directionId')?.trim();
    return { view: 'new-goal', ...(directionId ? { directionId } : {}) };
  }
  if (path !== '#/v2/actions/new') return null;
  const params = new URLSearchParams(query);
  return {
    view: 'new-action',
    ...(params.get('directionId') ? { directionId: params.get('directionId')! } : {}),
    goalId: params.get('goalId')?.trim() || null,
    title: params.get('title')?.trim() || null,
    ...(params.get('date') ? { date: params.get('date')! } : {}),
    ...(params.get('parentActionId') ? { parentActionId: params.get('parentActionId')! } : {}),
    ...(params.get('returnToGoal') === '1' ? { returnToGoal: true } : {}),
  };
}

export function buildPlannerV2Route(route: PlannerV2Route): string {
  if (route.view === 'spheres') return '#/v2/spheres';
  if (route.view === 'directions') return '#/v2/directions';
  if (route.view === 'sphere') return `#/v2/spheres/${encodeURIComponent(route.id)}`;
  if (route.view === 'direction') return `#/v2/directions/${encodeURIComponent(route.id)}`;
  const filter =
    'sphereId' in route && route.sphereId
      ? `?${new URLSearchParams({ sphereId: route.sphereId })}`
      : '';
  if ('section' in route) return `#/v2/${route.section}?view=${route.view}`;
  if (route.view === 'planning')
    return `#/v2/goals${filter ? `${filter}&period=week` : '?period=week'}`;
  if (route.view === 'today')
    return route.day === 'tomorrow' ? '#/v2/today?day=tomorrow' : '#/v2/today';
  if (route.view === 'sleep') return '#/v2/sleep';
  if (route.view === 'new-goal')
    return `#/v2/goals/new${route.directionId ? `?${new URLSearchParams({ directionId: route.directionId })}` : ''}`;
  if (route.view === 'goals') {
    const params = new URLSearchParams();
    if (route.sphereId) params.set('sphereId', route.sphereId);
    if (route.period) params.set('period', route.period);
    return `#/v2/goals${params.size ? `?${params}` : ''}`;
  }
  if (route.view === 'focus') return '#/v2/goals/focus';
  if (route.view === 'inbox') return '#/v2/inbox';
  if (route.view === 'actions') return '#/v2/actions';
  if (route.view === 'goal')
    return `#/v2/goals/${encodeURIComponent(route.id)}${route.edit ? '?edit=1' : ''}`;
  if (route.view === 'action') return `#/v2/actions/${encodeURIComponent(route.id)}`;
  const params = new URLSearchParams();
  if (route.directionId) params.set('directionId', route.directionId);
  if (route.goalId) params.set('goalId', route.goalId);
  if (route.title) params.set('title', route.title);
  if (route.date) params.set('date', route.date);
  if (route.parentActionId) params.set('parentActionId', route.parentActionId);
  if (route.returnToGoal) params.set('returnToGoal', '1');
  return `#/v2/actions/new${params.size > 0 ? `?${params}` : ''}`;
}
