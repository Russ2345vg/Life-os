import type { LifeAction } from '../../domain';
import { automaticPeriod } from '../../domain/planner/PlanningPeriod';
import type { PlanningState } from '../ports/PlanningRepository';

export interface GuidanceChoice {
  readonly id: string;
  readonly origin: 'default' | 'user';
}

export interface TodayGoalGuidanceSelection {
  readonly goal?: GuidanceChoice | null;
  readonly action?: GuidanceChoice | null;
}

export interface GuidanceGoalOption {
  readonly id: string;
  readonly title: string;
  readonly focused: boolean;
  readonly nextProgress: string | null;
}

export interface GuidanceActionOption {
  readonly id: string;
  readonly title: string;
  readonly status: LifeAction['status'];
  readonly plannedDate: string | null;
}

interface GuidanceBase {
  readonly goals: readonly GuidanceGoalOption[];
  readonly actions: readonly GuidanceActionOption[];
  readonly goalId: string | null;
  readonly actionId: string | null;
  readonly goalTitle: string | null;
  readonly whyImportant: string | null;
  readonly nextProgress: string | null;
}

export type TodayGoalGuidance = GuidanceBase &
  (
    | { readonly status: 'empty' | 'choose-goal' | 'choose-action' }
    | {
        readonly status: 'selection-unavailable';
        readonly unavailable: 'goal' | 'action';
      }
    | {
        readonly status: 'ready';
        readonly goalId: string;
        readonly actionId: string;
        readonly goalTitle: string;
        readonly actionTitle: string;
        readonly actionVersion: number;
        /** Fingerprint of the canonical weekly-focus and next-step sources. */
        readonly sourceKey: string;
        readonly goalReason: 'weekly-primary' | 'user-choice' | 'source-changed';
        readonly actionReason: 'goal-next-action' | 'user-choice' | 'source-changed';
        readonly plannedDate: string | null;
        readonly estimateMinutes: number | null;
        readonly mainOnPreviousDate: boolean;
        readonly cta: 'add-today' | 'move-today' | 'open-action';
      }
  );

const openStatus = new Set<LifeAction['status']>(['draft', 'ready', 'in_progress']);
const compareTitle = (a: { title: string; id: string }, b: { title: string; id: string }) =>
  a.title.localeCompare(b.title, 'ru') || a.id.localeCompare(b.id);

/** A read-only explanation of existing planning decisions, never a new priority decision. */
export function buildTodayGoalGuidance(
  state: PlanningState,
  today: string,
  selection: TodayGoalGuidanceSelection = {},
): TodayGoalGuidance {
  const weekId = automaticPeriod('week', today).id;
  const week = state.periods.find((period) => period.id === weekId && period.kind === 'week');
  const focused = new Set(
    state.memberships
      .filter(
        (member) =>
          member.periodId === weekId &&
          member.entityType === 'goal' &&
          member.focused &&
          !member.removed,
      )
      .map((member) => member.entityId),
  );
  const activeGoals = state.goals.filter((goal) => goal.status === 'active' && !goal.isDeleted());
  const goals = activeGoals
    .map((goal) => ({
      id: goal.id.toString(),
      title: goal.title,
      focused: focused.has(goal.id.toString()),
      nextProgress: goal.nextProgress,
    }))
    .sort((a, b) => Number(b.focused) - Number(a.focused) || compareTitle(a, b));
  const primaryId = week?.primaryGoalId;
  const defaultGoalId =
    primaryId && focused.has(primaryId) && goals.some((g) => g.id === primaryId) ? primaryId : null;
  const selectedGoalId =
    selection.goal === undefined ? defaultGoalId : (selection.goal?.id ?? null);
  const chosenGoal = activeGoals.find((goal) => goal.id.toString() === selectedGoalId);
  const base: GuidanceBase = {
    goals,
    actions: [],
    goalId: selectedGoalId,
    actionId: selection.action?.id ?? null,
    goalTitle: chosenGoal?.title ?? null,
    whyImportant: chosenGoal?.whyImportant ?? null,
    nextProgress: chosenGoal?.nextProgress ?? null,
  };
  if (goals.length === 0 && !selectedGoalId) return { ...base, status: 'empty' };
  if (selectedGoalId && !chosenGoal)
    return { ...base, status: 'selection-unavailable', unavailable: 'goal' };
  if (!chosenGoal) return { ...base, status: 'choose-goal' };

  const openActions = state.actions
    .filter(
      (action) =>
        action.goalId?.equals(chosenGoal.id) &&
        openStatus.has(action.status) &&
        !action.isArchived() &&
        !action.isDeleted(),
    )
    .sort((a, b) =>
      compareTitle(
        { id: a.id.toString(), title: a.title.toString() },
        { id: b.id.toString(), title: b.title.toString() },
      ),
    );
  const actions = openActions.map((action) => ({
    id: action.id.toString(),
    title: action.title.toString(),
    status: action.status,
    plannedDate: action.plannedDate?.toString() ?? null,
  }));
  const nextId = chosenGoal.nextActionId?.toString() ?? null;
  const defaultActionId = openActions.some((action) => action.id.toString() === nextId)
    ? nextId
    : null;
  const selectedActionId =
    selection.action === undefined ? defaultActionId : (selection.action?.id ?? null);
  const chosenAction = openActions.find((action) => action.id.toString() === selectedActionId);
  const withActions = { ...base, actions, actionId: selectedActionId };
  if (selectedActionId && !chosenAction)
    return { ...withActions, status: 'selection-unavailable', unavailable: 'action' };
  if (!chosenAction) return { ...withActions, status: 'choose-action' };

  const plannedDate = chosenAction.plannedDate?.toString() ?? null;
  const cta =
    chosenAction.status === 'in_progress' || plannedDate === today
      ? 'open-action'
      : plannedDate === null
        ? 'add-today'
        : 'move-today';
  return {
    ...withActions,
    status: 'ready',
    goalId: chosenGoal.id.toString(),
    actionId: chosenAction.id.toString(),
    goalTitle: chosenGoal.title,
    actionTitle: chosenAction.title.toString(),
    actionVersion: chosenAction.version,
    sourceKey: JSON.stringify([
      week?.id ?? null,
      week?.version ?? null,
      week?.primaryGoalId ?? null,
      focused.has(chosenGoal.id.toString()),
      chosenGoal.version,
      chosenGoal.nextActionId?.toString() ?? null,
    ]),
    goalReason:
      selection.goal?.origin === 'user'
        ? 'user-choice'
        : defaultGoalId === chosenGoal.id.toString()
          ? 'weekly-primary'
          : 'source-changed',
    actionReason:
      selection.action?.origin === 'user'
        ? 'user-choice'
        : defaultActionId === chosenAction.id.toString()
          ? 'goal-next-action'
          : 'source-changed',
    plannedDate,
    estimateMinutes: chosenAction.estimateMinutes,
    mainOnPreviousDate: cta === 'move-today' && chosenAction.isNext,
    cta,
  };
}
