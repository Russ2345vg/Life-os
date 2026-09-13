import type {
  CreateGoal,
  CreateGoalInput,
  GetDirections,
  GetSpheres,
  SpheresSnapshot,
} from '../../application';
import type { Direction, Goal, GoalCreationStatus } from '../../domain';
import type { DomainError } from '../../shared/errors/DomainError';
import type { Result } from '../../shared/result/Result';
import type { GoalFormValues } from './GoalFormModel';
import type { GoalAlbumRoute } from './GoalAlbumNavigation';

export interface GoalFormOptionsQueries {
  readonly getDirections: Pick<GetDirections, 'execute'>;
  readonly getSpheres: Pick<GetSpheres, 'execute'>;
}

export interface GoalFormOptionsSource {
  readonly directions: readonly Direction[];
  readonly spheres: SpheresSnapshot;
}

export async function loadGoalFormOptions(
  queries: GoalFormOptionsQueries,
): Promise<GoalFormOptionsSource> {
  const [directions, spheres] = await Promise.all([
    queries.getDirections.execute(),
    queries.getSpheres.execute(),
  ]);
  return { directions, spheres };
}

export function createGoalSubmissionExecutor(input: {
  readonly createGoal: Pick<CreateGoal, 'execute'>;
  readonly onMutated: () => void;
  readonly onRouteChange: (route: GoalAlbumRoute) => void;
}): (values: GoalFormValues) => Promise<Result<Goal, DomainError>> {
  return async (values) => {
    const result = await input.createGoal.execute(createGoalInput(values));
    if (result.ok) {
      input.onMutated();
      input.onRouteChange({ view: 'detail', goalId: result.value.id.toString() });
    }
    return result;
  };
}

export function createGoalInput(values: GoalFormValues): CreateGoalInput {
  return {
    title: values.title,
    ...(values.description === undefined ? {} : { description: values.description }),
    ...(values.sphereId === undefined ? {} : { sphereId: values.sphereId }),
    directionId: values.directionId,
    whyImportant: values.whyImportant,
    whyNow: values.whyNow,
    status: values.status as GoalCreationStatus,
    stage: values.stage,
    intentionLevel: values.intentionLevel,
    horizon: values.horizon,
    progress: values.progress,
    achievementCriteria: values.achievementCriteria,
    nextProgress: values.nextProgress,
    coverImage: values.coverImage,
  };
}
