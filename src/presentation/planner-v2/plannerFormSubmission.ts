import { DayDate, EntityId, LifeActionTitle, type GoalHorizon } from '../../domain';
import type { CreateGoal, CreateLifeActionDraft } from '../../application';

export const emptyActionDraft = (goalId: string | null = null, title: string | null = null) => ({
  title: title ?? '',
  goalId: goalId ?? '',
  date: '',
  description: '',
  isNext: false,
});
export type PlannerActionDraft = ReturnType<typeof emptyActionDraft>;
export const emptyGoalDraft = () => ({
  title: '',
  outcome: '',
  directionId: '',
  horizon: '' as GoalHorizon | '',
  firstStep: '',
  description: '',
  whyImportant: '',
  whyNow: '',
});
export type PlannerGoalDraft = ReturnType<typeof emptyGoalDraft>;

export async function submitPlannerAction(
  command: Pick<CreateLifeActionDraft, 'execute'>,
  draft: PlannerActionDraft,
) {
  const result = await command.execute({
    title: LifeActionTitle.create(draft.title),
    description: draft.description,
    goalId: draft.goalId ? EntityId.create(draft.goalId) : null,
    plannedDate: draft.date ? DayDate.create(draft.date) : null,
    isNext: draft.isNext,
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
  });
  if (!result.ok) throw result.error;
  return result.value;
}
