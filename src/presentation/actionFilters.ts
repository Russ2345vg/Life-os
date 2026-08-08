import { LIFE_ACTION_STATUS, type LifeAction } from '../domain';

export const ACTION_FILTER = {
  all: 'all',
  draft: LIFE_ACTION_STATUS.draft,
  ready: LIFE_ACTION_STATUS.ready,
  inProgress: LIFE_ACTION_STATUS.inProgress,
  completed: LIFE_ACTION_STATUS.completed,
  cancelled: LIFE_ACTION_STATUS.cancelled,
} as const;

export type ActionFilter = (typeof ACTION_FILTER)[keyof typeof ACTION_FILTER];

export function filterLifeActions(
  actions: readonly LifeAction[],
  filter: ActionFilter,
): readonly LifeAction[] {
  return filter === ACTION_FILTER.all
    ? actions
    : actions.filter((action) => action.status === filter);
}
