import type { GoalMeasurement } from '../../domain/planner/GoalMeasurement';
import type { RecurrenceInput } from '../../application/planner/RecurringActions';
import type { ActionContributionInput } from '../../application/planner/actionPlanningSetup';
import { DayDate, EntityId, LifeActionTitle, type GoalHorizon } from '../../domain';
import type { CreateGoal, CreateLifeActionDraft } from '../../application';

export const emptyActionDraft = (goalId: string | null = null, title: string | null = null) => ({
  title: title ?? '',
  goalId: goalId ?? '',
  parentActionId: '',
  date: '',
  description: '',
  isNext: false,
  recurrence: null as RecurrenceInput | null,
  contributions: [] as ActionContributionInput[],
});
export type PlannerActionDraft = ReturnType<typeof emptyActionDraft>;
export const emptyGoalDraft = () => ({
  title: '',
  outcome: '',
  directionId: '',
  horizon: '' as GoalHorizon | '',
  firstStep: '',
  measurement: null as GoalMeasurement | null,
  dueDate: '',
  description: '',
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
    goalId: goalId ? EntityId.create(goalId) : null,
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
    directionId: draft.directionId ? EntityId.create(draft.directionId) : null,
    horizon: draft.horizon || null,
    nextProgress: draft.firstStep,
    description: draft.description,
    whyImportant: draft.whyImportant,
    whyNow: draft.whyNow,
    ...(draft.measurement ? { measurement: draft.measurement } : {}),
    ...(draft.dueDate ? { dueDate: draft.dueDate } : {}),
  });
  if (!result.ok) throw result.error;
  return result.value;
}
