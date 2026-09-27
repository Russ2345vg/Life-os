import type { GoalMeasurement } from '../../domain/planner/GoalMeasurement';
import type { RecurrenceInput } from '../../application/planner/RecurringActions';
import type { ActionContributionInput } from '../../application/planner/actionPlanningSetup';
import { DayDate, EntityId, LifeActionTitle, type GoalHorizon } from '../../domain';
import type { CreateGoal, CreateLifeActionDraft } from '../../application';
import type { PeriodKind } from '../../domain/planner/PlanningPeriod';
import type { PeriodPlanning } from '../../application/planner/PeriodPlanning';

export const emptyActionDraft = (goalId: string | null = null, title: string | null = null) => ({
  title: title ?? '',
  goalId: goalId ?? '',
  directionId: '',
  parentActionId: '',
  date: '',
  description: '',
  need: '',
  isNext: false,
  recurrence: null as RecurrenceInput | null,
  contributions: [] as ActionContributionInput[],
});
export type PlannerActionDraft = ReturnType<typeof emptyActionDraft>;
export const emptyGoalDraft = () => ({
  expectedVersion: null as number | null,
  title: '',
  outcome: '',
  directionId: '',
  horizon: '' as GoalHorizon | '',
  period: '' as PeriodKind | '',
  firstStep: '',
  measurement: null as GoalMeasurement | null,
  dueDate: '',
  description: '',
  need: '',
  whyImportant: '',
  whyNow: '',
});
export type PlannerGoalDraft = ReturnType<typeof emptyGoalDraft>;

export async function submitPlannerAction(
  command: Pick<CreateLifeActionDraft, 'execute'>,
  draft: PlannerActionDraft,
) {
  const goalId = draft.goalId.trim();
  const parentActionId = draft.parentActionId.trim();
  const contributions = draft.contributions
    .filter((link) => link.goalId.trim() !== '')
    .map((link) => ({ ...link, goalId: link.goalId.trim() }));
  const result = await command.execute({
    title: LifeActionTitle.create(draft.title),
    description: draft.description,
    need: draft.need,
    goalId: goalId ? EntityId.create(goalId) : null,
    directionId: draft.directionId ? EntityId.create(draft.directionId) : null,
    parentActionId: parentActionId ? EntityId.create(parentActionId) : null,
    plannedDate: draft.date ? DayDate.create(draft.date) : null,
    isNext: draft.isNext,
    ...(draft.recurrence ? { recurrence: draft.recurrence } : {}),
    ...(contributions.length ? { contributions } : {}),
  });
  if (!result.ok) throw result.error;
  return result.value;
}

export async function submitPlannerGoal(
  command: Pick<CreateGoal, 'execute'>,
  draft: PlannerGoalDraft,
) {
  const result = await command.execute({
    title: draft.title,
    achievementCriteria: draft.outcome,
    status: 'active',
    stage: 'active_goal',
    directionId: draft.directionId ? EntityId.create(draft.directionId) : null,
    horizon: draft.horizon || null,
    nextProgress: draft.firstStep,
    description: draft.description,
    need: draft.need,
    whyImportant: draft.whyImportant,
    whyNow: draft.whyNow,
    ...(draft.measurement ? { measurement: draft.measurement } : {}),
    ...(draft.dueDate ? { dueDate: draft.dueDate } : {}),
  });
  if (!result.ok) throw result.error;
  return result.value;
}

export async function submitPlannerGoalWithPeriod(
  command: Pick<CreateGoal, 'execute'>,
  draft: PlannerGoalDraft,
  periods: Pick<PeriodPlanning, 'startCycle' | 'participate'> | undefined,
  today: string,
) {
  const goal = await submitPlannerGoal(command, draft);
  if (!draft.period) return { goal, warning: null };
  try {
    if (!periods) throw new Error('Планирование недоступно.');
    const date =
      draft.period === 'thirty_days' ? (await periods.startCycle(today)).startDate : today;
    await periods.participate(draft.period, date, 'goal', goal.id.toString());
    return { goal, warning: null };
  } catch {
    // Creation already succeeded. Offer recovery from the saved goal, never create a duplicate.
    return {
      goal,
      warning: 'Цель сохранена, но период не добавлен. Откройте цель и выберите период повторно.',
    };
  }
}
