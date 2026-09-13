import type { GetDirections, GetGoalById, GetSpheres, SpheresSnapshot } from '../../application';
import { EntityId, GOAL_STATUS, type Direction, type Goal } from '../../domain';
import {
  buildGoalDirectionOptionGroups,
  createGoalFormDraft,
  type GoalDirectionOptionGroup,
  type GoalFormDraft,
} from './GoalFormModel';

export interface GoalEditQueries {
  readonly getGoalById: Pick<GetGoalById, 'execute'>;
  readonly getDirections: Pick<GetDirections, 'execute'>;
  readonly getSpheres: Pick<GetSpheres, 'execute'>;
}

export interface GoalEditSource {
  readonly goal: Goal | null;
  readonly directions: readonly Direction[];
  readonly spheres: SpheresSnapshot;
}

export type GoalEditLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'not-found' }
  | { readonly status: 'archived'; readonly goal: Goal }
  | { readonly status: 'error' }
  | {
      readonly status: 'ready';
      readonly spheres?: SpheresSnapshot;
      readonly goal: Goal;
      readonly draft: GoalFormDraft;
      readonly groups: readonly GoalDirectionOptionGroup[];
    };

export interface GoalEditLoadController {
  activate(): void;
  retry(): void;
  cancel(): void;
}

export async function loadGoalEdit(
  goalId: string,
  queries: GoalEditQueries,
): Promise<GoalEditSource> {
  const [goal, directions, spheres] = await Promise.all([
    queries.getGoalById.execute(EntityId.create(goalId)),
    queries.getDirections.execute(),
    queries.getSpheres.execute(),
  ]);
  return { goal, directions, spheres };
}

export async function settleGoalEditLoad(
  request: Promise<GoalEditSource>,
  isCurrent: () => boolean,
): Promise<GoalEditLoadState | null> {
  try {
    const source = await request;
    if (!isCurrent()) return null;
    if (source.goal === null) return { status: 'not-found' };
    if (source.goal.status === GOAL_STATUS.archived) {
      return { status: 'archived', goal: source.goal };
    }
    return {
      status: 'ready',
      spheres: source.spheres,
      goal: source.goal,
      draft: createGoalFormDraft(source.goal),
      groups: buildGoalDirectionOptionGroups(
        source.directions,
        source.spheres,
        source.goal.directionId?.toString() ?? null,
      ),
    };
  } catch {
    return isCurrent() ? { status: 'error' } : null;
  }
}

export function createGoalEditLoadController(input: {
  readonly load: () => Promise<GoalEditSource>;
  readonly publish: (state: GoalEditLoadState) => void;
}): GoalEditLoadController {
  let sequence = 0;

  const start = (): void => {
    const attempt = ++sequence;
    input.publish({ status: 'loading' });
    void settleGoalEditLoad(input.load(), () => sequence === attempt).then((state) => {
      if (state !== null) input.publish(state);
    });
  };

  return {
    activate: start,
    retry: start,
    cancel() {
      sequence += 1;
    },
  };
}
