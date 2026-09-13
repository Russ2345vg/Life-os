import type { Goal } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { Result } from '../../shared/result/Result';
import {
  validateGoalForm,
  type GoalFormDraft,
  type GoalFormErrors,
  type GoalFormField,
  type GoalFormMode,
  type GoalFormValidation,
  type GoalFormValues,
} from './GoalFormModel';

export type GoalFormSubmissionState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | {
      readonly status: 'invalid';
      readonly errors: GoalFormErrors;
      readonly firstInvalidField: GoalFormField;
    }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'success'; readonly goal: Goal };

export interface GoalFormSubmissionController {
  submit(draft: GoalFormDraft): Promise<GoalFormSubmissionState>;
  getState(): GoalFormSubmissionState;
}

export interface GoalFormSubmissionControllerInput {
  readonly mode: GoalFormMode;
  readonly execute: (values: GoalFormValues) => Promise<Result<Goal, DomainError>>;
  readonly validate?: (draft: GoalFormDraft, mode: GoalFormMode) => GoalFormValidation;
  readonly publish?: (state: GoalFormSubmissionState) => void;
}

const GOAL_FORM_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  'goal.title_required': 'Введите название цели.',
  'goal.direction_required': 'Активной цели необходимо направление.',
  'goal.direction_not_found': 'Выбранное направление больше недоступно.',
  'goal.archived_direction': 'Выберите действующее направление.',
  'goal.version_conflict': 'Цель уже изменена. Обновите данные и повторите.',
};

export function createGoalFormSubmissionController(
  input: GoalFormSubmissionControllerInput,
): GoalFormSubmissionController {
  let state: GoalFormSubmissionState = { status: 'idle' };
  let pending: Promise<GoalFormSubmissionState> | null = null;

  const publish = (next: GoalFormSubmissionState): GoalFormSubmissionState => {
    state = next;
    input.publish?.(next);
    return next;
  };

  return {
    submit(draft) {
      if (pending !== null) return pending;
      const validation = (input.validate ?? validateGoalForm)(draft, input.mode);
      if (!validation.ok) {
        return Promise.resolve(
          publish({
            status: 'invalid',
            errors: validation.errors,
            firstInvalidField: validation.firstInvalidField,
          }),
        );
      }

      publish({ status: 'submitting' });
      const request = input
        .execute(validation.values)
        .then((result) =>
          result.ok
            ? publish({ status: 'success', goal: result.value })
            : publish({ status: 'error', message: messageForFailure(result.error) }),
        )
        .catch(() =>
          publish({
            status: 'error',
            message: 'Не удалось сохранить цель. Попробуйте ещё раз.',
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
  return GOAL_FORM_ERROR_MESSAGES[error.code] ?? error.message;
}
