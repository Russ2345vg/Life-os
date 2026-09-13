import type { GetDirections } from '../../application/queries/GetDirections';
import type { GetGoals } from '../../application/queries/GetGoals';
import type { GetSpheres, SpheresSnapshot } from '../../application/queries/GetSpheres';
import type { Direction, Goal } from '../../domain';

export interface GoalAlbumSource {
  readonly goals: readonly Goal[];
  readonly directions: readonly Direction[];
  readonly spheres: SpheresSnapshot;
}

export interface GoalAlbumQueries {
  readonly getGoals: Pick<GetGoals, 'execute'>;
  readonly getDirections: Pick<GetDirections, 'execute'>;
  readonly getSpheres: Pick<GetSpheres, 'execute'>;
}

export interface GoalAlbumLoader {
  load(): Promise<GoalAlbumSource>;
  refresh(): Promise<GoalAlbumSource>;
}

export function createGoalAlbumLoader(queries: GoalAlbumQueries): GoalAlbumLoader {
  let snapshot: Promise<GoalAlbumSource> | null = null;

  const requestSnapshot = (): Promise<GoalAlbumSource> =>
    Promise.all([
      queries.getGoals.execute(),
      queries.getDirections.execute(),
      queries.getSpheres.execute(),
    ]).then(([goals, directions, spheres]) => ({ goals, directions, spheres }));

  return {
    load() {
      if (snapshot === null) snapshot = requestSnapshot();
      return snapshot;
    },
    refresh() {
      snapshot = requestSnapshot();
      return snapshot;
    },
  };
}
