import type { Direction, Goal, GoalStatus, LifeAction, Sphere } from '../../domain';
import { comparePlannerGoalActions, isOpenAction } from './plannerCatalogModel';

export interface PlannerViewData {
  readonly goals: readonly Goal[];
  readonly actions: readonly LifeAction[];
  readonly directions: readonly Direction[];
  readonly spheres: readonly Sphere[];
}
export const actionColumnLabels = {
  undated: 'Без даты',
  planned: 'Запланировано',
  completed: 'Выполнено',
  cancelled: 'Отменено',
} as const;
export type ActionColumn = keyof typeof actionColumnLabels;

function add<T>(map: Map<string, T[]>, key: string, value: T) {
  const group = map.get(key);
  if (group) group.push(value);
  else map.set(key, [value]);
}

/** Read-only indexes over the existing entities; no view-specific records or per-card queries. */
export function buildPlannerViews(data: PlannerViewData) {
  const goalById = new Map(data.goals.map((g) => [g.id.toString(), g]));
  const directionById = new Map(data.directions.map((d) => [d.id.toString(), d]));
  const sphereById = new Map(data.spheres.map((s) => [s.id.toString(), s]));
  const goalsByStatus = new Map<GoalStatus, Goal[]>();
  const actionsByColumn = new Map<ActionColumn, LifeAction[]>();
  const actionsByDate = new Map<string, LifeAction[]>();
  const actionsByGoal = new Map<string, LifeAction[]>();
  const directionsBySphere = new Map<string, Direction[]>();
  const goalsByDirection = new Map<string, Goal[]>();
  const goalsWithoutDirectionBySphere = new Map<string, Goal[]>();
  const actionsWithoutGoal: LifeAction[] = [];
  const undatedActions: LifeAction[] = [];
  const nextActionByGoal = new Map<string, LifeAction>();
  for (const direction of data.directions) {
    const sphereId = direction.sphereId?.toString() ?? '';
    add(directionsBySphere, sphereById.has(sphereId) ? sphereId : '', direction);
  }
  for (const goal of data.goals) {
    add(goalsByStatus, goal.status, goal);
    const directionId = goal.directionId?.toString() ?? '';
    if (directionById.has(directionId)) add(goalsByDirection, directionId, goal);
    else {
      const sphereId = goal.sphereId?.toString() ?? '';
      add(goalsWithoutDirectionBySphere, sphereById.has(sphereId) ? sphereId : '', goal);
    }
  }
  for (const action of data.actions) {
    if (action.isArchived()) continue;
    const date = action.plannedDate?.toString();
    const column: ActionColumn =
      action.status === 'completed'
        ? 'completed'
        : action.status === 'cancelled'
          ? 'cancelled'
          : date
            ? 'planned'
            : 'undated';
    add(actionsByColumn, column, action);
    if (date) add(actionsByDate, date, action);
    else undatedActions.push(action);
    const goalId = action.goalId?.toString() ?? '';
    if (goalById.has(goalId)) {
      add(actionsByGoal, goalId, action);
      const previous = nextActionByGoal.get(goalId);
      if (isOpenAction(action) && (!previous || comparePlannerGoalActions(action, previous) < 0))
        nextActionByGoal.set(goalId, action);
    } else actionsWithoutGoal.push(action);
  }
  return {
    ...data,
    goalById,
    directionById,
    sphereById,
    goalsByStatus,
    actionsByColumn,
    actionsByDate,
    actionsByGoal,
    directionsBySphere,
    goalsByDirection,
    goalsWithoutDirectionBySphere,
    actionsWithoutGoal,
    undatedActions,
    // The authoritative Goal contract has no exact deadline. Horizon is never a date.
    undatedGoals: data.goals,
    nextActionByGoal,
  };
}
export type PlannerViews = ReturnType<typeof buildPlannerViews>;

export function calendarMonthDays(selected: string): string[] {
  const first = new Date(`${selected.slice(0, 7)}-01T12:00:00Z`);
  const month = first.getUTCMonth();
  const end = new Date(first);
  end.setUTCMonth(month + 1, 0);
  end.setUTCDate(end.getUTCDate() + ((7 - end.getUTCDay()) % 7));
  first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
  const days: string[] = [];
  while (first <= end) {
    days.push(first.toISOString().slice(0, 10));
    first.setUTCDate(first.getUTCDate() + 1);
  }
  return days;
}
export function shiftCalendarMonth(date: string, delta: number): string {
  const result = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
  result.setUTCMonth(result.getUTCMonth() + delta);
  return result.toISOString().slice(0, 10);
}
export function plannerDateLabel(
  date: string,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' },
): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('ru', { ...options, timeZone: 'UTC' });
}
