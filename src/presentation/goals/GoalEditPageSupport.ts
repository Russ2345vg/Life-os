import type { UpdateGoal, UpdateGoalInput } from '../../application';
import type { Goal, GoalEditableStatus } from '../../domain';
import type { DomainError } from '../../shared/errors/DomainError';
import type { Result } from '../../shared/result/Result';
import type { GoalAlbumRoute } from './GoalAlbumNavigation';
import type { GoalFormValues } from './GoalFormModel';

export function createGoalUpdateExecutor(input: {
  readonly goal: Goal;
  readonly updateGoal: Pick<UpdateGoal, 'execute'>;
  readonly onMutated: () => void;
  readonly onRouteChange: (route: GoalAlbumRoute) => void;
}): (values: GoalFormValues) => Promise<Result<Goal, DomainError>> {
  return async (values) => {
    const result = await input.updateGoal.execute(updateGoalInput(input.goal, values));
    if (result.ok) {
      input.onMutated();
      input.onRouteChange({ view: 'detail', goalId: result.value.id.toString() });
    }
    return result;
  };
}

export function updateGoalInput(goal: Goal, values: GoalFormValues): UpdateGoalInput {
  return {
    id: goal.id,
    expectedVersion: goal.version,
    title: values.title,
    ...(values.description === undefined ? {} : { description: values.description }),
    ...(values.sphereId === undefined ? {} : { sphereId: values.sphereId }),
    directionId: values.directionId,
    whyImportant: values.whyImportant,
    whyNow: values.whyNow,
    status:
      goal.status === 'paused' && values.stage === goal.stage
        ? 'paused'
        : (values.status as GoalEditableStatus),
    stage: values.stage,
    intentionLevel: values.intentionLevel,
    horizon: values.horizon,
    progress: values.progress,
    achievementCriteria: values.achievementCriteria,
    nextProgress: values.nextProgress,
    coverImage: values.coverImage,
  };
}
