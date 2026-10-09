import { DayDate } from '../../domain';
import type { AnalyticsTopic } from '../../application/analytics/GetAnalyticsOverview';
import { MEMORY_KINDS, type MemoryKind } from '../../domain/memory';
import { addDays, automaticPeriod } from '../../domain/planner/PlanningPeriod';

export type PlannerRoute =
  | {
      readonly view: 'analytics';
      readonly period?: 'week' | 'month';
      readonly date?: string;
      readonly topic?: AnalyticsTopic;
      readonly day?: string;
    }
  | {
      readonly view: 'walks';
      readonly page?:
        'overview' | 'active' | 'history' | 'captures' | 'plan' | 'analytics' | 'followups';
      readonly id?: string;
      readonly search?: string;
      readonly status?: string;
      readonly from?: string;
      readonly to?: string;
      readonly intent?: string;
      readonly sphereId?: string;
      readonly origin?: 'today';
      readonly sourceGoalId?: string;
    }
  | { readonly view: 'spheres' }
  | { readonly view: 'directions' }
  | { readonly view: 'needs'; readonly need?: string }
  | { readonly view: 'sphere'; readonly id: string }
  | { readonly view: 'direction'; readonly id: string }
  | { readonly view: 'goal'; readonly id: string; readonly edit?: boolean }
  | { readonly view: 'planning'; readonly sphereId?: string }
  | { readonly view: 'today'; readonly day?: 'tomorrow' }
  | { readonly view: 'routine' }
  | { readonly view: 'morning' }
  | { readonly view: 'autopilot' }
  | { readonly view: 'sleep'; readonly from?: 'routine' }
  | { readonly view: 'account' }
  | {
      readonly view: 'memory';
      readonly id?: string | undefined;
      readonly year?: number | undefined;
      readonly mode?: 'timeline' | 'year' | undefined;
      readonly kind?: MemoryKind | undefined;
      readonly sphereId?: string | undefined;
      readonly search?: string | undefined;
      readonly highlight?: boolean | undefined;
      readonly deleted?: boolean | undefined;
    }
  | {
      readonly view: 'diary';
      readonly period?: 'day' | 'week' | 'month';
      readonly date?: string;
    }
  | {
      readonly view: 'goals';
      readonly sphereId?: string;
      readonly period?: 'year' | 'quarter' | 'thirty_days' | 'week' | 'none';
    }
  | { readonly view: 'focus' }
  | { readonly view: 'review'; readonly week?: string }
  | { readonly view: 'actions' }
  | { readonly view: 'time'; readonly actionId?: string }
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
      readonly returnToGoals?: boolean;
    };

export function parsePlannerRoute(hash: string): PlannerRoute | null {
  const [path, query = ''] = hash.split('?');
  const view = new URLSearchParams(query).get('view');
  const sphereId = new URLSearchParams(query).get('sphereId')?.trim();
  const filter = sphereId ? { sphereId } : {};
  if (path === '#/v2/analytics') {
    const params = new URLSearchParams(query);
    const period = params.get('period');
    const topic = params.get('topic');
    const date = params.get('date');
    const day = params.get('day');
    const validTopics: readonly string[] = [
      'overview',
      'results',
      'time',
      'goals',
      'balance',
      'state',
      'rest',
      'memory',
    ];
    return {
      view: 'analytics',
      ...(period === 'week' || period === 'month' ? { period } : {}),
      ...(date ? { date } : {}),
      ...(topic && validTopics.includes(topic) ? { topic: topic as AnalyticsTopic } : {}),
      ...(day ? { day } : {}),
    };
  }
  if (path === '#/v2/spheres') return { view: 'spheres' };
  if (path === '#/v2/directions') return { view: 'directions' };
  if (path === '#/v2/needs') return { view: 'needs' };
  if (path?.startsWith('#/v2/needs/')) {
    try {
      const need = decodeURIComponent(path.slice('#/v2/needs/'.length)).trim();
      return need ? { view: 'needs', need } : null;
    } catch {
      return null;
    }
  }
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
  if (path === '#/v2/routine') return { view: 'routine' };
  if (path === '#/v2/routine/morning') return { view: 'morning' };
  if (path === '#/v2/routine/day') return { view: 'autopilot' };
  if (path === '#/v2/sleep')
    return new URLSearchParams(query).get('from') === 'routine'
      ? { view: 'sleep', from: 'routine' }
      : { view: 'sleep' };
  if (path === '#/v2/walks' || path?.startsWith('#/v2/walks/')) {
    try {
      const part =
        path === '#/v2/walks' ? 'overview' : decodeURIComponent(path.slice('#/v2/walks/'.length));
      if (!part) return null;
      const params = new URLSearchParams(query);
      const filters = {
        ...Object.fromEntries(
          ['search', 'status', 'from', 'to', 'intent', 'sphereId', 'sourceGoalId'].flatMap((key) =>
            params.get(key) ? [[key, params.get(key)!]] : [],
          ),
        ),
        ...(params.get('origin') === 'today' ? { origin: 'today' as const } : {}),
      };
      for (const page of [
        'overview',
        'active',
        'history',
        'captures',
        'plan',
        'analytics',
        'followups',
      ] as const)
        if (part === page) return { view: 'walks', page, ...filters };
      return { view: 'walks', id: part };
    } catch {
      return null;
    }
  }
  if (path === '#/v2/account') return { view: 'account' };
  if (path === '#/v2/memory' || path?.startsWith('#/v2/memory/')) {
    const params = new URLSearchParams(query);
    const yearText = params.get('year') ?? '';
    const year = /^\d{1,4}$/.test(yearText) ? Number(yearText) : 0;
    const mode = params.get('mode');
    const kind = params.get('kind');
    try {
      const id =
        path === '#/v2/memory'
          ? undefined
          : decodeURIComponent(path.slice('#/v2/memory/'.length)).trim();
      if (id === '') return null;
      return {
        view: 'memory',
        ...(id ? { id } : {}),
        ...(year >= 1 && year <= 9999 ? { year } : {}),
        ...(mode === 'year' || mode === 'timeline' ? { mode } : {}),
        ...(kind && MEMORY_KINDS.includes(kind as MemoryKind) ? { kind: kind as MemoryKind } : {}),
        ...filter,
        ...(params.get('search') ? { search: params.get('search')! } : {}),
        ...(params.get('highlight') === '1' ? { highlight: true } : {}),
        ...(params.get('deleted') === '1' ? { deleted: true } : {}),
      };
    } catch {
      return null;
    }
  }
  if (path === '#/v2/diary') {
    const params = new URLSearchParams(query);
    const period = params.get('period');
    const date = params.get('date')?.trim();
    return {
      view: 'diary',
      ...(period === 'day' || period === 'week' || period === 'month' ? { period } : {}),
      ...(date ? { date } : {}),
    };
  }
  if (path === '#/v2/goals') {
    if (view === 'review') {
      const week = new URLSearchParams(query).get('week');
      return { view: 'review', ...(week ? { week } : {}) };
    }
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
  if (path === '#/v2/actions') {
    if (view === 'time') {
      const actionId = new URLSearchParams(query).get('actionId')?.trim();
      return { view: 'time', ...(actionId ? { actionId } : {}) };
    }
    return { view: 'actions' };
  }
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
    ...(params.get('returnToGoals') === '1' ? { returnToGoals: true } : {}),
  };
}

export function buildPlannerRoute(route: PlannerRoute): string {
  if (route.view === 'analytics') {
    const params = new URLSearchParams();
    if (route.period) params.set('period', route.period);
    if (route.date) params.set('date', route.date);
    if (route.topic && route.topic !== 'overview') params.set('topic', route.topic);
    if (route.day) params.set('day', route.day);
    return `#/v2/analytics${params.size ? `?${params}` : ''}`;
  }
  if (route.view === 'walks') {
    const params = new URLSearchParams();
    if (route.search) params.set('search', route.search);
    if (route.status) params.set('status', route.status);
    if (route.from) params.set('from', route.from);
    if (route.to) params.set('to', route.to);
    if (route.intent) params.set('intent', route.intent);
    if (route.sphereId) params.set('sphereId', route.sphereId);
    if (route.origin) params.set('origin', route.origin);
    if (route.sourceGoalId) params.set('sourceGoalId', route.sourceGoalId);
    return `#/v2/walks${route.id ? `/${encodeURIComponent(route.id)}` : route.page && route.page !== 'overview' ? `/${route.page}` : ''}${params.size ? `?${params}` : ''}`;
  }
  if (route.view === 'spheres') return '#/v2/spheres';
  if (route.view === 'directions') return '#/v2/directions';
  if (route.view === 'needs')
    return `#/v2/needs${route.need ? `/${encodeURIComponent(route.need)}` : ''}`;
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
  if (route.view === 'routine') return '#/v2/routine';
  if (route.view === 'morning') return '#/v2/routine/morning';
  if (route.view === 'autopilot') return '#/v2/routine/day';
  if (route.view === 'sleep')
    return route.from === 'routine' ? '#/v2/sleep?from=routine' : '#/v2/sleep';
  if (route.view === 'account') return '#/v2/account';
  if (route.view === 'memory') {
    const params = new URLSearchParams();
    if (route.year) params.set('year', String(route.year));
    if (route.mode) params.set('mode', route.mode);
    if (route.kind) params.set('kind', route.kind);
    if (route.sphereId) params.set('sphereId', route.sphereId);
    if (route.highlight) params.set('highlight', '1');
    if (route.deleted) params.set('deleted', '1');
    if (route.search) params.set('search', route.search);
    return `#/v2/memory${route.id ? `/${encodeURIComponent(route.id)}` : ''}${params.size ? `?${params}` : ''}`;
  }
  if (route.view === 'diary') {
    const params = new URLSearchParams();
    if (route.period) params.set('period', route.period);
    if (route.date) params.set('date', route.date);
    return `#/v2/diary${params.size ? `?${params}` : ''}`;
  }
  if (route.view === 'new-goal')
    return `#/v2/goals/new${route.directionId ? `?${new URLSearchParams({ directionId: route.directionId })}` : ''}`;
  if (route.view === 'goals') {
    const params = new URLSearchParams();
    if (route.sphereId) params.set('sphereId', route.sphereId);
    if (route.period) params.set('period', route.period);
    return `#/v2/goals${params.size ? `?${params}` : ''}`;
  }
  if (route.view === 'focus') return '#/v2/goals/focus';
  if (route.view === 'review')
    return `#/v2/goals?view=review${route.week ? `&${new URLSearchParams({ week: route.week })}` : ''}`;
  if (route.view === 'inbox') return '#/v2/inbox';
  if (route.view === 'actions') return '#/v2/actions';
  if (route.view === 'time')
    return `#/v2/actions?view=time${route.actionId ? `&${new URLSearchParams({ actionId: route.actionId })}` : ''}`;
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
  if (route.returnToGoals) params.set('returnToGoals', '1');
  return `#/v2/actions/new${params.size > 0 ? `?${params}` : ''}`;
}

export type ResolvedDiaryRoute = Readonly<{
  view: 'diary';
  period: 'day' | 'week' | 'month';
  date: string;
}>;

export function resolveDiaryRoute(
  route: Extract<PlannerRoute, { view: 'diary' }>,
  currentDate: DayDate,
): ResolvedDiaryRoute {
  const today = currentDate.toString();
  const period = route.period ?? 'week';
  const fallback =
    period === 'day'
      ? today
      : period === 'month'
        ? `${today.slice(0, 7)}-01`
        : addDays(automaticPeriod('week', today).startDate, -7);
  let requested = fallback;
  if (route.date) {
    try {
      requested = DayDate.create(route.date).toString();
    } catch {
      requested = fallback;
    }
  }
  const normalized =
    period === 'day'
      ? requested
      : period === 'month'
        ? `${requested.slice(0, 7)}-01`
        : automaticPeriod('week', requested).startDate;
  const maximum =
    period === 'day'
      ? today
      : period === 'month'
        ? `${today.slice(0, 7)}-01`
        : automaticPeriod('week', today).startDate;
  return { view: 'diary', period, date: normalized > maximum ? maximum : normalized };
}
