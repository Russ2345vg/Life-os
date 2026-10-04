import type {
  Direction,
  Goal,
  GoalHorizon,
  GoalIntentionLevel,
  GoalStatus,
  LifeAction,
} from '../../domain';
import type { FocusPeriod } from '../../domain/planner/FocusPeriod';

export const horizonLabels: Record<GoalHorizon, string> = {
  now: 'Сейчас',
  '<1y': 'В течение года',
  '1-3y': '1–3 года',
  '3-5y': '3–5 лет',
  someday: 'Когда-нибудь',
};
export const importanceLabels: Record<GoalIntentionLevel, string> = {
  want: 'Хочу',
  plan: 'Планирую',
  commit: 'Обязуюсь',
};
export const statusLabels: Record<GoalStatus, string> = {
  active: 'Активна',
  paused: 'На паузе',
  future: 'В планах',
  achieved: 'Достигнута',
  archived: 'В архиве',
};
export const emptyGoalFilters = () => ({
  status: '' as GoalStatus | '',
  showCompleted: false,
  unassigned: false,
  undated: false,
  sphereId: '',
  directionId: '',
  importance: '' as GoalIntentionLevel | '',
  horizon: '' as GoalHorizon | '',
  focus: '' as '' | 'yes' | 'no',
});
export type GoalFilters = ReturnType<typeof emptyGoalFilters>;
export type ActionView = 'open' | 'today' | 'upcoming' | 'undated' | 'unassigned' | 'completed';
export const actionViewLabels: Record<ActionView, string> = {
  open: 'Все',
  today: 'Сегодня',
  upcoming: 'Ближайшие',
  undated: 'Без даты',
  unassigned: 'Без цели',
  completed: 'Выполненные',
};
export type ActionGroupKey = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'undated';
export interface PlannerActionGroup {
  readonly key: ActionGroupKey;
  readonly label: string;
  readonly actions: readonly LifeAction[];
}
const actionGroupLabels: Record<ActionGroupKey, string> = {
  overdue: 'Ранее',
  today: 'Сегодня',
  tomorrow: 'Завтра',
  week: 'На этой неделе',
  later: 'Позже',
  undated: 'Без даты',
};
export function activeFocusIds(goals: readonly Goal[], focus: FocusPeriod | null): string[] {
  const active = new Set(goals.filter((g) => g.status === 'active').map((g) => g.id.toString()));
  return (focus?.goals ?? []).filter((g) => active.has(g.goalId)).map((g) => g.goalId);
}
export function filterPlannerGoals(
  goals: readonly Goal[],
  filter: GoalFilters,
  search: string,
  directions: readonly Direction[],
  focusIds: readonly string[],
): Goal[] {
  const needle = search.trim().toLocaleLowerCase('ru');
  return goals.filter((goal) => {
    const direction = directions.find((d) => d.id.toString() === goal.directionId?.toString());
    return (
      (filter.status
        ? goal.status === filter.status
        : goal.status !== 'archived' && (filter.showCompleted || goal.status !== 'achieved')) &&
      (!filter.unassigned || goal.directionId === null) &&
      (!filter.undated || goal.dueDate === null) &&
      (!filter.sphereId ||
        (goal.sphereId ?? direction?.sphereId)?.toString() === filter.sphereId) &&
      (!filter.directionId || goal.directionId?.toString() === filter.directionId) &&
      (!filter.importance || goal.intentionLevel === filter.importance) &&
      (!filter.horizon || goal.horizon === filter.horizon) &&
      (!filter.focus || focusIds.includes(goal.id.toString()) === (filter.focus === 'yes')) &&
      (!needle ||
        [
          goal.title,
          goal.description,
          goal.achievementCriteria,
          goal.whyImportant,
          goal.whyNow,
          goal.nextProgress,
          direction?.name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('ru')
          .includes(needle))
    );
  });
}
export function isOpenAction(action: LifeAction): boolean {
  return !action.isArchived() && action.status !== 'completed' && action.status !== 'cancelled';
}
export function filterPlannerActions(
  actions: readonly LifeAction[],
  view: ActionView,
  search: string,
  today: string,
): LifeAction[] {
  const needle = search.trim().toLocaleLowerCase('ru');
  const end = new Date(`${today}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 7);
  return actions
    .filter(
      (a) =>
        !a.isArchived() &&
        (view === 'completed' ? a.status === 'completed' : isOpenAction(a)) &&
        (view !== 'unassigned' || a.goalId === null) &&
        (view !== 'undated' || a.plannedDate === null) &&
        (view !== 'today' || a.plannedDate?.toString() === today) &&
        (view !== 'upcoming' ||
          (a.plannedDate !== null &&
            a.plannedDate.toString() > today &&
            a.plannedDate.toString() <= end.toISOString().slice(0, 10))) &&
        (!needle || a.title.toString().toLocaleLowerCase('ru').includes(needle)),
    )
    .sort(
      (a, b) =>
        (a.plannedDate?.toString() ?? '9999').localeCompare(b.plannedDate?.toString() ?? '9999') ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );
}
export function groupPlannerActions(
  actions: readonly LifeAction[],
  today: string,
): PlannerActionGroup[] {
  const tomorrow = new Date(`${today}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowKey = tomorrow.toISOString().slice(0, 10);
  const weekEnd = new Date(`${today}T12:00:00Z`);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + ((7 - weekEnd.getUTCDay()) % 7));
  const weekEndKey = weekEnd.toISOString().slice(0, 10);
  const grouped = new Map<ActionGroupKey, LifeAction[]>([
    ['overdue', []],
    ['today', []],
    ['tomorrow', []],
    ['week', []],
    ['later', []],
    ['undated', []],
  ]);
  const seen = new Set<string>();
  for (const action of actions) {
    const occurrence = action.occurrence;
    const identity = occurrence
      ? `occurrence:${occurrence.ruleId}:${occurrence.slot}`
      : `action:${action.id.toString()}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const date = action.plannedDate?.toString() ?? null;
    const key: ActionGroupKey =
      date === null
        ? 'undated'
        : date === today
          ? 'today'
          : date === tomorrowKey
            ? 'tomorrow'
            : date < today
              ? 'overdue'
              : date <= weekEndKey
                ? 'week'
                : 'later';
    grouped.get(key)?.push(action);
  }
  return (Object.keys(actionGroupLabels) as ActionGroupKey[])
    .filter((key) => !['overdue', 'later'].includes(key) || grouped.get(key)!.length > 0)
    .map((key) => ({
      key,
      label: actionGroupLabels[key],
      actions: grouped.get(key) ?? [],
    }));
}
export function goalActions(goal: Goal, actions: readonly LifeAction[]): LifeAction[] {
  return actions
    .filter((a) => a.goalId?.equals(goal.id) && isOpenAction(a))
    .sort(comparePlannerGoalActions);
}
export function selectGoalCardActions(goal: Goal, actions: readonly LifeAction[]) {
  const linked = actions.filter((action) => action.goalId?.equals(goal.id));
  const open = linked.filter(isOpenAction).sort(comparePlannerGoalActions);
  const completed = linked
    .filter((action) => action.status === 'completed')
    .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));
  return {
    open,
    completed,
    next:
      (goal.nextActionId ? open.find((action) => action.id.equals(goal.nextActionId!)) : null) ??
      open.find((action) => action.isNext) ??
      null,
  };
}
export function comparePlannerGoalActions(a: LifeAction, b: LifeAction): number {
  return (
    Number(b.isNext) - Number(a.isNext) ||
    (a.plannedDate?.toString() ?? '9999').localeCompare(b.plannedDate?.toString() ?? '9999') ||
    a.createdAt.getTime() - b.createdAt.getTime()
  );
}
export function measuredGoalProgress(goal: Goal): { label: string; percent: number } | null {
  const p = goal.progress;
  if (!p || p.type === 'qualitative') return null;
  const current = p.type === 'metric' ? p.current : p.completed;
  const target = p.type === 'metric' ? p.target : p.total;
  return {
    label: `${current} / ${target}${p.type === 'metric' ? ` ${p.unit}` : ' этапов'}`,
    percent: Math.max(0, Math.min(100, Math.round((current / target) * 100))),
  };
}
