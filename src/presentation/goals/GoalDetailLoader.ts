import type { GetDirections, GetGoalById, GetSpheres, SpheresSnapshot } from '../../application';
import { EntityId, type Direction, type Goal } from '../../domain';

export interface GoalDetailQueries {
  readonly getGoalById: Pick<GetGoalById, 'execute'>;
  readonly getDirections: Pick<GetDirections, 'execute'>;
  readonly getSpheres: Pick<GetSpheres, 'execute'>;
}

export interface GoalDetailSource {
  readonly goal: Goal | null;
  readonly directions: readonly Direction[];
  readonly spheres: SpheresSnapshot;
}

export async function loadGoalDetail(
  goalId: string,
  queries: GoalDetailQueries,
): Promise<GoalDetailSource> {
  const [goal, directions, spheres] = await Promise.all([
    queries.getGoalById.execute(EntityId.create(goalId)),
    queries.getDirections.execute(),
    queries.getSpheres.execute(),
  ]);
  return { goal, directions, spheres };
}
