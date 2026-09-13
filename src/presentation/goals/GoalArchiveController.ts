import type { ArchiveGoal } from '../../application';
import { GOAL_STATUS, type Goal } from '../../domain';
import type { DomainError } from '../../shared/errors/DomainError';

export type GoalArchiveState =
  | { readonly status: 'idle' }
  | { readonly status: 'archiving' }
  | { readonly status: 'cancelled' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'success'; readonly goal: Goal };

export interface GoalArchiveController {
  archive(goal: Goal): Promise<GoalArchiveState>;
  getState(): GoalArchiveState;
}

export const GOAL_ARCHIVE_CONFIRMATION =
  'Архивировать цель? Она останется в истории и будет доступна в фильтре «Архив».';

export function createGoalArchiveController(input: {
  readonly archiveGoal: Pick<ArchiveGoal, 'execute'>;
  readonly confirm: (message: string) => boolean;
  readonly onMutated: () => void;
  readonly publish?: (state: GoalArchiveState) => void;
}): GoalArchiveController {
  let state: GoalArchiveState = { status: 'idle' };
  let pending: Promise<GoalArchiveState> | null = null;

  const publish = (next: GoalArchiveState): GoalArchiveState => {
    state = next;
    input.publish?.(next);
    return next;
  };

  return {
    archive(goal) {
      if (pending !== null) return pending;
      if (goal.status === GOAL_STATUS.archived) {
        return Promise.resolve(publish({ status: 'success', goal }));
      }
      if (!input.confirm(GOAL_ARCHIVE_CONFIRMATION)) {
        return Promise.resolve(publish({ status: 'cancelled' }));
      }

      publish({ status: 'archiving' });
      const request = input.archiveGoal
        .execute({ id: goal.id, expectedVersion: goal.version })
        .then((result) => {
          if (!result.ok) {
            return publish({ status: 'error', message: messageForFailure(result.error) });
          }
          input.onMutated();
          return publish({ status: 'success', goal: result.value });
        })
        .catch(() =>
          publish({
            status: 'error',
            message: 'Не удалось архивировать цель. Попробуйте ещё раз.',
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

function messageForFailure(error: DomainError): string {
  switch (error.code) {
    case 'goal.version_conflict':
      return 'Цель уже изменена. Обновите страницу и повторите.';
    case 'goal.not_found':
      return 'Цель не найдена.';
    default:
      return error.message;
  }
}
