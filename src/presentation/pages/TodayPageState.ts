import type {
  CreateDecisionForDate,
  CreateLifeActionForDecision,
  GetDecisionsForDate,
  GetLifeActionsForDecision,
} from '../../application';
import {
  DECISION_KIND,
  type ActionSession,
  type DayDate,
  type Decision,
  type DecisionKind,
  type EntityId,
  type LifeAction,
} from '../../domain';

type DecisionsState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly decisions: readonly Decision[] };

export interface DecisionFormState {
  readonly kind: DecisionKind;
  readonly title: string;
  readonly expectedResult: string;
}

export interface LifeActionFormState {
  readonly title: string;
  readonly expectedResult: string;
  readonly description: string;
}

export type DecisionDetailsState =
  | { readonly status: 'closed' }
  | { readonly status: 'loading'; readonly decisionId: EntityId }
  | { readonly status: 'error'; readonly decisionId: EntityId }
  | {
      readonly status: 'ready';
      readonly decisionId: EntityId;
      readonly decision: Decision;
      readonly lifeActions: readonly LifeAction[];
    };

export type LifeActionDetailsState =
  | { readonly status: 'closed' }
  | { readonly status: 'loading'; readonly lifeAction: LifeAction }
  | { readonly status: 'error'; readonly lifeAction: LifeAction }
  | {
      readonly status: 'ready';
      readonly lifeAction: LifeAction;
      readonly sessions: readonly ActionSession[];
      readonly unfinishedSession: ActionSession | null;
    };

type DecisionSubmissionResult =
  | { readonly ok: true; readonly decisions: readonly Decision[] }
  | { readonly ok: false; readonly message: string };

type LifeActionSubmissionResult =
  | { readonly ok: true; readonly lifeActions: readonly LifeAction[] }
  | { readonly ok: false; readonly message: string };

export interface TodayPageState {
  readonly decisions: DecisionsState;
  readonly isFormOpen: boolean;
  readonly isSaving: boolean;
  readonly form: DecisionFormState;
  readonly formError: string | null;
  readonly details: DecisionDetailsState;
  readonly isLifeActionFormOpen: boolean;
  readonly isLifeActionSaving: boolean;
  readonly lifeActionForm: LifeActionFormState;
  readonly lifeActionFormError: string | null;
  readonly actionDetails: LifeActionDetailsState;
  readonly isSessionMutating: boolean;
  readonly sessionError: string | null;
}

export type TodayPageAction =
  | { readonly type: 'load_started' }
  | { readonly type: 'load_succeeded'; readonly decisions: readonly Decision[] }
  | { readonly type: 'load_failed' }
  | { readonly type: 'open_form' }
  | { readonly type: 'close_form' }
  | { readonly type: 'kind_changed'; readonly kind: DecisionKind }
  | { readonly type: 'title_changed'; readonly title: string }
  | { readonly type: 'expected_result_changed'; readonly expectedResult: string }
  | { readonly type: 'save_started' }
  | { readonly type: 'save_failed'; readonly message: string }
  | { readonly type: 'save_succeeded' }
  | { readonly type: 'details_load_started'; readonly decisionId: EntityId }
  | {
      readonly type: 'details_load_succeeded';
      readonly decisionId: EntityId;
      readonly decision: Decision;
      readonly lifeActions: readonly LifeAction[];
    }
  | { readonly type: 'details_load_failed'; readonly decisionId: EntityId }
  | { readonly type: 'details_closed' }
  | { readonly type: 'life_action_form_opened' }
  | { readonly type: 'life_action_form_closed' }
  | { readonly type: 'life_action_title_changed'; readonly title: string }
  | {
      readonly type: 'life_action_expected_result_changed';
      readonly expectedResult: string;
    }
  | { readonly type: 'life_action_description_changed'; readonly description: string }
  | { readonly type: 'life_action_save_started' }
  | { readonly type: 'life_action_save_failed'; readonly message: string }
  | {
      readonly type: 'life_action_save_succeeded';
      readonly decisionId: EntityId;
      readonly lifeActions: readonly LifeAction[];
    }
  | { readonly type: 'action_details_load_started'; readonly lifeAction: LifeAction }
  | {
      readonly type: 'action_details_load_succeeded';
      readonly lifeActionId: EntityId;
      readonly sessions: readonly ActionSession[];
      readonly unfinishedSession: ActionSession | null;
    }
  | { readonly type: 'action_details_load_failed'; readonly lifeActionId: EntityId }
  | { readonly type: 'action_details_closed' }
  | { readonly type: 'session_operation_started' }
  | { readonly type: 'session_operation_failed'; readonly message: string }
  | {
      readonly type: 'session_started';
      readonly lifeAction: LifeAction;
      readonly session: ActionSession;
    }
  | { readonly type: 'session_updated'; readonly session: ActionSession };

export const INITIAL_TODAY_PAGE_STATE: TodayPageState = {
  decisions: { status: 'loading' },
  isFormOpen: false,
  isSaving: false,
  form: createEmptyForm(),
  formError: null,
  details: { status: 'closed' },
  isLifeActionFormOpen: false,
  isLifeActionSaving: false,
  lifeActionForm: createEmptyLifeActionForm(),
  lifeActionFormError: null,
  actionDetails: { status: 'closed' },
  isSessionMutating: false,
  sessionError: null,
};

export function todayPageReducer(state: TodayPageState, action: TodayPageAction): TodayPageState {
  switch (action.type) {
    case 'load_started':
      return { ...state, decisions: { status: 'loading' } };
    case 'load_succeeded':
      return { ...state, decisions: { status: 'ready', decisions: action.decisions } };
    case 'load_failed':
      return { ...state, decisions: { status: 'error' } };
    case 'open_form':
      return { ...state, isFormOpen: true, formError: null };
    case 'close_form':
      return { ...state, isFormOpen: false, formError: null };
    case 'kind_changed':
      return { ...state, form: { ...state.form, kind: action.kind }, formError: null };
    case 'title_changed':
      return { ...state, form: { ...state.form, title: action.title }, formError: null };
    case 'expected_result_changed':
      return {
        ...state,
        form: { ...state.form, expectedResult: action.expectedResult },
        formError: null,
      };
    case 'save_started':
      return { ...state, isSaving: true, formError: null };
    case 'save_failed':
      return { ...state, isSaving: false, formError: action.message };
    case 'save_succeeded':
      return {
        ...state,
        isSaving: false,
        isFormOpen: false,
        form: createEmptyForm(),
        formError: null,
      };
    case 'details_load_started':
      return {
        ...state,
        details: { status: 'loading', decisionId: action.decisionId },
        isLifeActionFormOpen: false,
        isLifeActionSaving: false,
        lifeActionForm: createEmptyLifeActionForm(),
        lifeActionFormError: null,
        actionDetails: { status: 'closed' },
        isSessionMutating: false,
        sessionError: null,
      };
    case 'details_load_succeeded':
      if (!isCurrentDecision(state.details, action.decisionId)) {
        return state;
      }
      return {
        ...state,
        details: {
          status: 'ready',
          decisionId: action.decisionId,
          decision: action.decision,
          lifeActions: action.lifeActions,
        },
      };
    case 'details_load_failed':
      if (!isCurrentDecision(state.details, action.decisionId)) {
        return state;
      }
      return { ...state, details: { status: 'error', decisionId: action.decisionId } };
    case 'details_closed':
      return {
        ...state,
        details: { status: 'closed' },
        isLifeActionFormOpen: false,
        isLifeActionSaving: false,
        lifeActionForm: createEmptyLifeActionForm(),
        lifeActionFormError: null,
        actionDetails: { status: 'closed' },
        isSessionMutating: false,
        sessionError: null,
      };
    case 'life_action_form_opened':
      return { ...state, isLifeActionFormOpen: true, lifeActionFormError: null };
    case 'life_action_form_closed':
      return { ...state, isLifeActionFormOpen: false, lifeActionFormError: null };
    case 'life_action_title_changed':
      return {
        ...state,
        lifeActionForm: { ...state.lifeActionForm, title: action.title },
        lifeActionFormError: null,
      };
    case 'life_action_expected_result_changed':
      return {
        ...state,
        lifeActionForm: { ...state.lifeActionForm, expectedResult: action.expectedResult },
        lifeActionFormError: null,
      };
    case 'life_action_description_changed':
      return {
        ...state,
        lifeActionForm: { ...state.lifeActionForm, description: action.description },
        lifeActionFormError: null,
      };
    case 'life_action_save_started':
      return { ...state, isLifeActionSaving: true, lifeActionFormError: null };
    case 'life_action_save_failed':
      return { ...state, isLifeActionSaving: false, lifeActionFormError: action.message };
    case 'life_action_save_succeeded':
      if (state.details.status !== 'ready' || !state.details.decisionId.equals(action.decisionId)) {
        return state;
      }
      return {
        ...state,
        details: { ...state.details, lifeActions: action.lifeActions },
        isLifeActionFormOpen: false,
        isLifeActionSaving: false,
        lifeActionForm: createEmptyLifeActionForm(),
        lifeActionFormError: null,
      };
    case 'action_details_load_started':
      return {
        ...state,
        actionDetails: { status: 'loading', lifeAction: action.lifeAction },
        isLifeActionFormOpen: false,
        isSessionMutating: false,
        sessionError: null,
      };
    case 'action_details_load_succeeded':
      if (
        state.actionDetails.status === 'closed' ||
        !state.actionDetails.lifeAction.id.equals(action.lifeActionId)
      ) {
        return state;
      }
      return {
        ...state,
        actionDetails: {
          status: 'ready',
          lifeAction: state.actionDetails.lifeAction,
          sessions: action.sessions,
          unfinishedSession: action.unfinishedSession,
        },
        isSessionMutating: false,
        sessionError: null,
      };
    case 'action_details_load_failed':
      if (
        state.actionDetails.status === 'closed' ||
        !state.actionDetails.lifeAction.id.equals(action.lifeActionId)
      ) {
        return state;
      }
      return {
        ...state,
        actionDetails: { status: 'error', lifeAction: state.actionDetails.lifeAction },
        isSessionMutating: false,
        sessionError: null,
      };
    case 'action_details_closed':
      return {
        ...state,
        actionDetails: { status: 'closed' },
        isSessionMutating: false,
        sessionError: null,
      };
    case 'session_operation_started':
      return { ...state, isSessionMutating: true, sessionError: null };
    case 'session_operation_failed':
      return { ...state, isSessionMutating: false, sessionError: action.message };
    case 'session_started':
      if (
        state.actionDetails.status !== 'ready' ||
        !state.actionDetails.lifeAction.id.equals(action.lifeAction.id)
      ) {
        return state;
      }
      return {
        ...state,
        details: replaceLifeActionInDecisionDetails(state.details, action.lifeAction),
        actionDetails: {
          ...state.actionDetails,
          lifeAction: action.lifeAction,
          sessions: replaceSession(state.actionDetails.sessions, action.session),
          unfinishedSession: action.session,
        },
        isSessionMutating: false,
        sessionError: null,
      };
    case 'session_updated':
      if (
        state.actionDetails.status !== 'ready' ||
        !state.actionDetails.lifeAction.id.equals(action.session.lifeActionId)
      ) {
        return state;
      }
      return {
        ...state,
        actionDetails: {
          ...state.actionDetails,
          sessions: replaceSession(state.actionDetails.sessions, action.session),
          unfinishedSession: action.session,
        },
        isSessionMutating: false,
        sessionError: null,
      };
  }
}

export function validateDecisionForm(form: DecisionFormState): string | null {
  if (form.title.trim().length === 0) {
    return 'Введите название решения';
  }

  if (form.kind === DECISION_KIND.main && form.expectedResult.trim().length === 0) {
    return 'Укажите ожидаемый результат';
  }

  return null;
}

export async function createDecisionAndReload(input: {
  readonly currentDate: DayDate;
  readonly form: DecisionFormState;
  readonly createDecisionForDate: Pick<CreateDecisionForDate, 'execute'>;
  readonly getDecisionsForDate: Pick<GetDecisionsForDate, 'execute'>;
}): Promise<DecisionSubmissionResult> {
  const result = await input.createDecisionForDate.execute({
    title: input.form.title,
    kind: input.form.kind,
    plannedDate: input.currentDate,
    ...(input.form.expectedResult.trim().length === 0
      ? {}
      : { expectedResult: input.form.expectedResult }),
  });

  if (!result.ok) {
    return { ok: false, message: decisionErrorMessage(result.error.code) };
  }

  return {
    ok: true,
    decisions: await input.getDecisionsForDate.execute(input.currentDate),
  };
}

export function validateLifeActionForm(form: LifeActionFormState): string | null {
  if (form.title.trim().length === 0) {
    return 'Введите название действия';
  }

  if (form.expectedResult.trim().length === 0) {
    return 'Укажите ожидаемый результат';
  }

  return null;
}

export function isDecisionActivationKey(key: string): boolean {
  return key === 'Enter' || key === ' ';
}

export function isLifeActionActivationKey(key: string): boolean {
  return key === 'Enter' || key === ' ';
}

export function startSessionErrorMessage(code: string): string {
  if (code === 'session.unfinished_exists') {
    return 'Сначала завершите или приостановите текущую работу';
  }

  return 'Не удалось начать выполнение';
}

export function pauseSessionErrorMessage(code: string): string {
  if (code === 'session.not_found') {
    return 'Сессия больше недоступна';
  }

  return 'Не удалось поставить работу на паузу';
}

export function resumeSessionErrorMessage(): string {
  return 'Не удалось продолжить работу';
}

export async function createLifeActionAndReload(input: {
  readonly decisionId: EntityId;
  readonly plannedDate: DayDate;
  readonly form: LifeActionFormState;
  readonly createLifeActionForDecision: Pick<CreateLifeActionForDecision, 'execute'>;
  readonly getLifeActionsForDecision: Pick<GetLifeActionsForDecision, 'execute'>;
}): Promise<LifeActionSubmissionResult> {
  const result = await input.createLifeActionForDecision.execute({
    decisionId: input.decisionId,
    title: input.form.title,
    expectedResult: input.form.expectedResult,
    plannedDate: input.plannedDate,
    ...(input.form.description.trim().length === 0 ? {} : { description: input.form.description }),
  });

  if (!result.ok) {
    return { ok: false, message: lifeActionErrorMessage(result.error.code) };
  }

  return {
    ok: true,
    lifeActions: await input.getLifeActionsForDecision.execute(input.decisionId),
  };
}

function decisionErrorMessage(code: string): string {
  switch (code) {
    case 'decision.main_limit_reached':
      return 'На сегодня уже назначены три главных решения';
    case 'decision_title.invalid':
      return 'Введите название решения';
    case 'decision.main_requires_expected_result':
      return 'Укажите ожидаемый результат';
    default:
      return 'Не удалось создать решение';
  }
}

function lifeActionErrorMessage(code: string): string {
  switch (code) {
    case 'action.decision_unavailable':
      return 'Для этого решения больше нельзя создавать действия';
    case 'life_action_title.invalid':
      return 'Введите название действия';
    case 'action_expected_result.invalid':
      return 'Укажите ожидаемый результат';
    default:
      return 'Не удалось создать действие';
  }
}

function createEmptyForm(): DecisionFormState {
  return { kind: DECISION_KIND.main, title: '', expectedResult: '' };
}

function createEmptyLifeActionForm(): LifeActionFormState {
  return { title: '', expectedResult: '', description: '' };
}

function isCurrentDecision(details: DecisionDetailsState, decisionId: EntityId): boolean {
  return details.status !== 'closed' && details.decisionId.equals(decisionId);
}

function replaceSession(
  sessions: readonly ActionSession[],
  updatedSession: ActionSession,
): readonly ActionSession[] {
  const withoutUpdated = sessions.filter((session) => !session.id.equals(updatedSession.id));
  return [...withoutUpdated, updatedSession].sort(
    (left, right) => left.startedAt.getTime() - right.startedAt.getTime(),
  );
}

function replaceLifeActionInDecisionDetails(
  details: DecisionDetailsState,
  updatedLifeAction: LifeAction,
): DecisionDetailsState {
  if (details.status !== 'ready') {
    return details;
  }

  return {
    ...details,
    lifeActions: details.lifeActions.map((lifeAction) =>
      lifeAction.id.equals(updatedLifeAction.id) ? updatedLifeAction : lifeAction,
    ),
  };
}
