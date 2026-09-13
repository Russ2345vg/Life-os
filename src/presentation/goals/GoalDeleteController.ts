import type { DeletePilotGoal } from '../../application';
import type { Goal } from '../../domain';

export type GoalDeleteState =
  | { readonly status: 'idle' }
  | { readonly status: 'deleting' }
  | { readonly status: 'cancelled' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'success' };

export interface GoalDeleteController {
  delete(goal: Goal): Promise<GoalDeleteState>;
  getState(): GoalDeleteState;
}

export const GOAL_DELETE_CONFIRMATION =
  'Удалить цель? Она исчезнет с доверенных устройств. Техническая запись удаления хранится 30 дней.';

export function createGoalDeleteController(input: {
  readonly deleteGoal: Pick<DeletePilotGoal, 'execute'>;
  readonly confirm: (message: string) => boolean;
  readonly onDeleted: () => void;
  readonly onMutated: () => void;
  readonly publish?: (state: GoalDeleteState) => void;
}): GoalDeleteController {
  let state: GoalDeleteState = { status: 'idle' };
  let pending: Promise<GoalDeleteState> | null = null;

  const publish = (next: GoalDeleteState): GoalDeleteState => {
    state = next;
    input.publish?.(next);
    return next;
  };

  return {
    delete(goal) {
      if (pending !== null) return pending;
      if (!input.confirm(GOAL_DELETE_CONFIRMATION)) {
        return Promise.resolve(publish({ status: 'cancelled' }));
      }

      publish({ status: 'deleting' });
      const request = input.deleteGoal
        .execute(goal.id.toString())
        .then((deleted) => {
          if (!deleted) {
            return publish({
              status: 'error',
              message:
                'Цель не найдена или имеет связанные записи. Цель со связями можно архивировать.',
            });
          }
          input.onMutated();
          const next = publish({ status: 'success' });
          input.onDeleted();
          return next;
        })
        .catch(() =>
          publish({
            status: 'error',
            message: 'Не удалось удалить цель. Попробуйте ещё раз.',
          }),
        );
      pending = request;
      void request.then(() => {
        if (pending === request) pending = null;
      });
      return request;
    },
    getState() {
      return state;
    },
  };
}
