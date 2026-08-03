import type {
  CancelDecisionSafely,
  CancelLifeActionSafely,
  CompleteActionSession,
  CompleteLifeAction,
  ConfirmDecisionFromActions,
  CreateDecisionForDate,
  CreateLifeActionForDecision,
  GetDecisionsForDate,
  GetLifeActionsForDecision,
  RescheduleDecisionSafely,
  RescheduleLifeActionSafely,
  UpdateDecisionDetails,
  UpdateLifeActionDetails,
} from '../../application';
import {
  ActionActualResult,
  DECISION_KIND,
  SESSION_COMPLETION_KIND,
  type ActionSession,
  type DayDate,
  type Decision,
  type DecisionKind,
  type EntityId,
  type LifeAction,
  type SessionCompletionKind,
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

export interface DecisionConfirmationFormState {
  readonly actualResult: string;
}

export interface DecisionEditFormState {
  readonly title: string;
  readonly expectedResult: string;
}

export interface DecisionRescheduleFormState {
  readonly newPlannedDate: string;
}

export interface LifeActionEditFormState {
  readonly title: string;
  readonly description: string;
  readonly expectedResult: string;
}

export interface LifeActionRescheduleFormState {
  readonly newPlannedDate: string;
}

export const ACTION_COMPLETION_CHOICE = {
  continueLater: 'continue_later',
  completeAction: 'complete_action',
} as const;

export type ActionCompletionChoice =
  (typeof ACTION_COMPLETION_CHOICE)[keyof typeof ACTION_COMPLETION_CHOICE];

export interface SessionCompletionFormState {
  readonly resultNote: string;
  readonly completionKind: SessionCompletionKind;
  readonly actionChoice: ActionCompletionChoice;
  readonly actualResult: string;
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
  readonly isDecisionConfirmationFormOpen: boolean;
  readonly isDecisionConfirming: boolean;
  readonly decisionConfirmationForm: DecisionConfirmationFormState;
  readonly decisionConfirmationError: string | null;
  readonly isDecisionEditFormOpen: boolean;
  readonly isDecisionEditing: boolean;
  readonly decisionEditForm: DecisionEditFormState;
  readonly decisionEditError: string | null;
  readonly isDecisionCancellationOpen: boolean;
  readonly isDecisionCancelling: boolean;
  readonly decisionCancellationError: string | null;
  readonly isDecisionRescheduleFormOpen: boolean;
  readonly isDecisionRescheduling: boolean;
  readonly decisionRescheduleForm: DecisionRescheduleFormState;
  readonly decisionRescheduleError: string | null;
  readonly decisionRescheduleNotice: string | null;
  readonly actionDetails: LifeActionDetailsState;
  readonly isLifeActionEditFormOpen: boolean;
  readonly isLifeActionEditing: boolean;
  readonly lifeActionEditForm: LifeActionEditFormState;
  readonly lifeActionEditError: string | null;
  readonly isLifeActionCancellationOpen: boolean;
  readonly isLifeActionCancelling: boolean;
  readonly lifeActionCancellationError: string | null;
  readonly isLifeActionRescheduleFormOpen: boolean;
  readonly isLifeActionRescheduling: boolean;
  readonly lifeActionRescheduleForm: LifeActionRescheduleFormState;
  readonly lifeActionRescheduleError: string | null;
  readonly isSessionMutating: boolean;
  readonly sessionError: string | null;
  readonly isSessionCompletionFormOpen: boolean;
  readonly sessionCompletionForm: SessionCompletionFormState;
  readonly hasPendingActionCompletion: boolean;
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
  | { readonly type: 'decision_confirmation_form_opened' }
  | { readonly type: 'decision_confirmation_form_closed' }
  | { readonly type: 'decision_actual_result_changed'; readonly actualResult: string }
  | { readonly type: 'decision_confirmation_started' }
  | { readonly type: 'decision_confirmation_failed'; readonly message: string }
  | { readonly type: 'decision_confirmation_succeeded'; readonly decision: Decision }
  | { readonly type: 'decision_edit_form_opened' }
  | { readonly type: 'decision_edit_form_closed' }
  | { readonly type: 'decision_edit_title_changed'; readonly title: string }
  | {
      readonly type: 'decision_edit_expected_result_changed';
      readonly expectedResult: string;
    }
  | { readonly type: 'decision_edit_started' }
  | { readonly type: 'decision_edit_failed'; readonly message: string }
  | { readonly type: 'decision_edit_succeeded'; readonly decision: Decision }
  | { readonly type: 'decision_cancellation_opened' }
  | { readonly type: 'decision_cancellation_closed' }
  | { readonly type: 'decision_cancellation_started' }
  | { readonly type: 'decision_cancellation_failed'; readonly message: string }
  | { readonly type: 'decision_cancellation_succeeded'; readonly decision: Decision }
  | { readonly type: 'decision_reschedule_form_opened' }
  | { readonly type: 'decision_reschedule_form_closed' }
  | { readonly type: 'decision_reschedule_date_changed'; readonly newPlannedDate: string }
  | { readonly type: 'decision_reschedule_started' }
  | { readonly type: 'decision_reschedule_failed'; readonly message: string }
  | {
      readonly type: 'decision_reschedule_succeeded';
      readonly decision: Decision;
      readonly movedOffCurrentDay: boolean;
      readonly message: string | null;
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
  | { readonly type: 'life_action_edit_form_opened' }
  | { readonly type: 'life_action_edit_form_closed' }
  | { readonly type: 'life_action_edit_title_changed'; readonly title: string }
  | { readonly type: 'life_action_edit_description_changed'; readonly description: string }
  | {
      readonly type: 'life_action_edit_expected_result_changed';
      readonly expectedResult: string;
    }
  | { readonly type: 'life_action_edit_started' }
  | { readonly type: 'life_action_edit_failed'; readonly message: string }
  | { readonly type: 'life_action_edit_succeeded'; readonly lifeAction: LifeAction }
  | { readonly type: 'life_action_cancellation_opened' }
  | { readonly type: 'life_action_cancellation_closed' }
  | { readonly type: 'life_action_cancellation_started' }
  | { readonly type: 'life_action_cancellation_failed'; readonly message: string }
  | { readonly type: 'life_action_cancellation_succeeded'; readonly lifeAction: LifeAction }
  | { readonly type: 'life_action_reschedule_form_opened' }
  | { readonly type: 'life_action_reschedule_form_closed' }
  | { readonly type: 'life_action_reschedule_date_changed'; readonly newPlannedDate: string }
  | { readonly type: 'life_action_reschedule_started' }
  | { readonly type: 'life_action_reschedule_failed'; readonly message: string }
  | { readonly type: 'life_action_reschedule_succeeded'; readonly lifeAction: LifeAction }
  | { readonly type: 'session_operation_started' }
  | { readonly type: 'session_operation_failed'; readonly message: string }
  | {
      readonly type: 'session_started';
      readonly lifeAction: LifeAction;
      readonly session: ActionSession;
    }
  | { readonly type: 'session_updated'; readonly session: ActionSession }
  | { readonly type: 'session_completion_form_opened' }
  | { readonly type: 'session_completion_form_closed' }
  | { readonly type: 'session_result_note_changed'; readonly resultNote: string }
  | {
      readonly type: 'session_completion_kind_changed';
      readonly completionKind: SessionCompletionKind;
    }
  | {
      readonly type: 'action_completion_choice_changed';
      readonly actionChoice: ActionCompletionChoice;
    }
  | { readonly type: 'action_actual_result_changed'; readonly actualResult: string }
  | { readonly type: 'session_completed'; readonly session: ActionSession }
  | {
      readonly type: 'session_completed_action_failed';
      readonly session: ActionSession;
      readonly message: string;
    }
  | {
      readonly type: 'life_action_completed';
      readonly lifeAction: LifeAction;
      readonly session?: ActionSession;
    };

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
  isDecisionConfirmationFormOpen: false,
  isDecisionConfirming: false,
  decisionConfirmationForm: createEmptyDecisionConfirmationForm(),
  decisionConfirmationError: null,
  isDecisionEditFormOpen: false,
  isDecisionEditing: false,
  decisionEditForm: createEmptyDecisionEditForm(),
  decisionEditError: null,
  isDecisionCancellationOpen: false,
  isDecisionCancelling: false,
  decisionCancellationError: null,
  isDecisionRescheduleFormOpen: false,
  isDecisionRescheduling: false,
  decisionRescheduleForm: createEmptyDecisionRescheduleForm(),
  decisionRescheduleError: null,
  decisionRescheduleNotice: null,
  actionDetails: { status: 'closed' },
  isLifeActionEditFormOpen: false,
  isLifeActionEditing: false,
  lifeActionEditForm: createEmptyLifeActionEditForm(),
  lifeActionEditError: null,
  isLifeActionCancellationOpen: false,
  isLifeActionCancelling: false,
  lifeActionCancellationError: null,
  isLifeActionRescheduleFormOpen: false,
  isLifeActionRescheduling: false,
  lifeActionRescheduleForm: createEmptyLifeActionRescheduleForm(),
  lifeActionRescheduleError: null,
  isSessionMutating: false,
  sessionError: null,
  isSessionCompletionFormOpen: false,
  sessionCompletionForm: createEmptySessionCompletionForm(),
  hasPendingActionCompletion: false,
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
        isDecisionConfirmationFormOpen: false,
        isDecisionConfirming: false,
        decisionConfirmationForm: createEmptyDecisionConfirmationForm(),
        decisionConfirmationError: null,
        isDecisionEditFormOpen: false,
        isDecisionEditing: false,
        decisionEditForm: createEmptyDecisionEditForm(),
        decisionEditError: null,
        isDecisionCancellationOpen: false,
        isDecisionCancelling: false,
        decisionCancellationError: null,
        ...closedDecisionRescheduleState(),
        decisionRescheduleNotice: null,
        actionDetails: { status: 'closed' },
        ...closedLifeActionManagementState(),
        isSessionMutating: false,
        sessionError: null,
        isSessionCompletionFormOpen: false,
        sessionCompletionForm: createEmptySessionCompletionForm(),
        hasPendingActionCompletion: false,
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
        isDecisionConfirmationFormOpen: false,
        isDecisionConfirming: false,
        decisionConfirmationForm: createEmptyDecisionConfirmationForm(),
        decisionConfirmationError: null,
        isDecisionEditFormOpen: false,
        isDecisionEditing: false,
        decisionEditForm: createEmptyDecisionEditForm(),
        decisionEditError: null,
        isDecisionCancellationOpen: false,
        isDecisionCancelling: false,
        decisionCancellationError: null,
        ...closedDecisionRescheduleState(),
        actionDetails: { status: 'closed' },
        ...closedLifeActionManagementState(),
        isSessionMutating: false,
        sessionError: null,
        isSessionCompletionFormOpen: false,
        sessionCompletionForm: createEmptySessionCompletionForm(),
        hasPendingActionCompletion: false,
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
    case 'decision_confirmation_form_opened':
      return {
        ...state,
        isDecisionConfirmationFormOpen: true,
        decisionConfirmationError: null,
      };
    case 'decision_confirmation_form_closed':
      return {
        ...state,
        isDecisionConfirmationFormOpen: false,
        decisionConfirmationError: null,
      };
    case 'decision_actual_result_changed':
      return {
        ...state,
        decisionConfirmationForm: {
          ...state.decisionConfirmationForm,
          actualResult: action.actualResult,
        },
        decisionConfirmationError: null,
      };
    case 'decision_confirmation_started':
      return { ...state, isDecisionConfirming: true, decisionConfirmationError: null };
    case 'decision_confirmation_failed':
      return {
        ...state,
        isDecisionConfirming: false,
        decisionConfirmationError: action.message,
      };
    case 'decision_confirmation_succeeded':
      if (
        state.details.status !== 'ready' ||
        !state.details.decisionId.equals(action.decision.id)
      ) {
        return state;
      }
      return {
        ...state,
        decisions: replaceDecisionInDecisionsState(state.decisions, action.decision),
        details: { ...state.details, decision: action.decision },
        isDecisionConfirmationFormOpen: false,
        isDecisionConfirming: false,
        decisionConfirmationForm: createEmptyDecisionConfirmationForm(),
        decisionConfirmationError: null,
        isLifeActionFormOpen: false,
      };
    case 'decision_edit_form_opened':
      if (state.details.status !== 'ready') {
        return state;
      }
      return {
        ...state,
        isDecisionEditFormOpen: true,
        decisionEditForm: {
          title: state.details.decision.title.toString(),
          expectedResult: state.details.decision.expectedResult?.toString() ?? '',
        },
        decisionEditError: null,
        isDecisionRescheduleFormOpen: false,
        decisionRescheduleError: null,
        isDecisionCancellationOpen: false,
        decisionCancellationError: null,
      };
    case 'decision_edit_form_closed':
      return {
        ...state,
        isDecisionEditFormOpen: false,
        decisionEditError: null,
        isDecisionRescheduleFormOpen: false,
        decisionRescheduleError: null,
      };
    case 'decision_edit_title_changed':
      return {
        ...state,
        decisionEditForm: { ...state.decisionEditForm, title: action.title },
        decisionEditError: null,
      };
    case 'decision_edit_expected_result_changed':
      return {
        ...state,
        decisionEditForm: {
          ...state.decisionEditForm,
          expectedResult: action.expectedResult,
        },
        decisionEditError: null,
      };
    case 'decision_edit_started':
      return { ...state, isDecisionEditing: true, decisionEditError: null };
    case 'decision_edit_failed':
      return { ...state, isDecisionEditing: false, decisionEditError: action.message };
    case 'decision_edit_succeeded':
      if (
        state.details.status !== 'ready' ||
        !state.details.decisionId.equals(action.decision.id)
      ) {
        return state;
      }
      return {
        ...state,
        decisions: replaceDecisionInDecisionsState(state.decisions, action.decision),
        details: { ...state.details, decision: action.decision },
        isDecisionEditFormOpen: false,
        isDecisionEditing: false,
        decisionEditForm: createEmptyDecisionEditForm(),
        decisionEditError: null,
      };
    case 'decision_cancellation_opened':
      return {
        ...state,
        isDecisionCancellationOpen: true,
        decisionCancellationError: null,
        isDecisionEditFormOpen: false,
        decisionEditError: null,
        isDecisionRescheduleFormOpen: false,
        decisionRescheduleError: null,
      };
    case 'decision_cancellation_closed':
      return {
        ...state,
        isDecisionCancellationOpen: false,
        decisionCancellationError: null,
      };
    case 'decision_cancellation_started':
      return { ...state, isDecisionCancelling: true, decisionCancellationError: null };
    case 'decision_cancellation_failed':
      return {
        ...state,
        isDecisionCancelling: false,
        decisionCancellationError: action.message,
      };
    case 'decision_cancellation_succeeded':
      if (
        state.details.status !== 'ready' ||
        !state.details.decisionId.equals(action.decision.id)
      ) {
        return state;
      }
      return {
        ...state,
        decisions: replaceDecisionInDecisionsState(state.decisions, action.decision),
        details: { ...state.details, decision: action.decision },
        isDecisionCancellationOpen: false,
        isDecisionCancelling: false,
        decisionCancellationError: null,
        isDecisionEditFormOpen: false,
        isLifeActionFormOpen: false,
        isDecisionConfirmationFormOpen: false,
      };
    case 'decision_reschedule_form_opened':
      return {
        ...state,
        isDecisionRescheduleFormOpen: true,
        decisionRescheduleForm: createEmptyDecisionRescheduleForm(),
        decisionRescheduleError: null,
        isDecisionEditFormOpen: false,
        decisionEditError: null,
        isDecisionCancellationOpen: false,
        decisionCancellationError: null,
      };
    case 'decision_reschedule_form_closed':
      return {
        ...state,
        isDecisionRescheduleFormOpen: false,
        decisionRescheduleError: null,
      };
    case 'decision_reschedule_date_changed':
      return {
        ...state,
        decisionRescheduleForm: {
          ...state.decisionRescheduleForm,
          newPlannedDate: action.newPlannedDate,
        },
        decisionRescheduleError: null,
      };
    case 'decision_reschedule_started':
      return { ...state, isDecisionRescheduling: true, decisionRescheduleError: null };
    case 'decision_reschedule_failed':
      return {
        ...state,
        isDecisionRescheduling: false,
        decisionRescheduleError: action.message,
      };
    case 'decision_reschedule_succeeded':
      if (
        state.details.status !== 'ready' ||
        !state.details.decisionId.equals(action.decision.id)
      ) {
        return state;
      }
      return {
        ...state,
        decisions: action.movedOffCurrentDay
          ? removeDecisionFromDecisionsState(state.decisions, action.decision.id)
          : replaceDecisionInDecisionsState(state.decisions, action.decision),
        details: action.movedOffCurrentDay
          ? { status: 'closed' }
          : { ...state.details, decision: action.decision },
        isDecisionRescheduleFormOpen: false,
        isDecisionRescheduling: false,
        decisionRescheduleForm: createEmptyDecisionRescheduleForm(),
        decisionRescheduleError: null,
        decisionRescheduleNotice: action.message,
      };
    case 'action_details_load_started':
      return {
        ...state,
        actionDetails: { status: 'loading', lifeAction: action.lifeAction },
        ...closedLifeActionManagementState(),
        isLifeActionFormOpen: false,
        isSessionMutating: false,
        sessionError: null,
        isSessionCompletionFormOpen: false,
        sessionCompletionForm: createEmptySessionCompletionForm(),
        hasPendingActionCompletion: false,
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
        ...closedLifeActionManagementState(),
        isSessionMutating: false,
        sessionError: null,
        isSessionCompletionFormOpen: false,
        sessionCompletionForm: createEmptySessionCompletionForm(),
        hasPendingActionCompletion: false,
      };
    case 'life_action_edit_form_opened':
      if (state.actionDetails.status !== 'ready') {
        return state;
      }
      return {
        ...state,
        isLifeActionEditFormOpen: true,
        lifeActionEditForm: {
          title: state.actionDetails.lifeAction.title.toString(),
          description: state.actionDetails.lifeAction.description ?? '',
          expectedResult: state.actionDetails.lifeAction.expectedResult?.toString() ?? '',
        },
        lifeActionEditError: null,
        isLifeActionCancellationOpen: false,
        lifeActionCancellationError: null,
        isLifeActionRescheduleFormOpen: false,
        lifeActionRescheduleError: null,
      };
    case 'life_action_edit_form_closed':
      return {
        ...state,
        isLifeActionEditFormOpen: false,
        lifeActionEditError: null,
      };
    case 'life_action_edit_title_changed':
      return {
        ...state,
        lifeActionEditForm: { ...state.lifeActionEditForm, title: action.title },
        lifeActionEditError: null,
      };
    case 'life_action_edit_description_changed':
      return {
        ...state,
        lifeActionEditForm: { ...state.lifeActionEditForm, description: action.description },
        lifeActionEditError: null,
      };
    case 'life_action_edit_expected_result_changed':
      return {
        ...state,
        lifeActionEditForm: {
          ...state.lifeActionEditForm,
          expectedResult: action.expectedResult,
        },
        lifeActionEditError: null,
      };
    case 'life_action_edit_started':
      return { ...state, isLifeActionEditing: true, lifeActionEditError: null };
    case 'life_action_edit_failed':
      return { ...state, isLifeActionEditing: false, lifeActionEditError: action.message };
    case 'life_action_edit_succeeded':
      if (
        state.actionDetails.status !== 'ready' ||
        !state.actionDetails.lifeAction.id.equals(action.lifeAction.id)
      ) {
        return state;
      }
      return {
        ...state,
        details: replaceLifeActionInDecisionDetails(state.details, action.lifeAction),
        actionDetails: { ...state.actionDetails, lifeAction: action.lifeAction },
        isLifeActionEditFormOpen: false,
        isLifeActionEditing: false,
        lifeActionEditForm: createEmptyLifeActionEditForm(),
        lifeActionEditError: null,
      };
    case 'life_action_cancellation_opened':
      return {
        ...state,
        isLifeActionCancellationOpen: true,
        lifeActionCancellationError: null,
        isLifeActionEditFormOpen: false,
        lifeActionEditError: null,
        isLifeActionRescheduleFormOpen: false,
        lifeActionRescheduleError: null,
      };
    case 'life_action_cancellation_closed':
      return {
        ...state,
        isLifeActionCancellationOpen: false,
        lifeActionCancellationError: null,
      };
    case 'life_action_cancellation_started':
      return { ...state, isLifeActionCancelling: true, lifeActionCancellationError: null };
    case 'life_action_cancellation_failed':
      return {
        ...state,
        isLifeActionCancelling: false,
        lifeActionCancellationError: action.message,
      };
    case 'life_action_cancellation_succeeded':
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
          unfinishedSession: null,
        },
        isLifeActionCancellationOpen: false,
        isLifeActionCancelling: false,
        lifeActionCancellationError: null,
        isLifeActionEditFormOpen: false,
        isSessionCompletionFormOpen: false,
        hasPendingActionCompletion: false,
      };
    case 'life_action_reschedule_form_opened':
      if (state.actionDetails.status !== 'ready') {
        return state;
      }
      return {
        ...state,
        isLifeActionRescheduleFormOpen: true,
        lifeActionRescheduleForm: {
          newPlannedDate: state.actionDetails.lifeAction.plannedDate?.toString() ?? '',
        },
        lifeActionRescheduleError: null,
        isLifeActionEditFormOpen: false,
        lifeActionEditError: null,
        isLifeActionCancellationOpen: false,
        lifeActionCancellationError: null,
      };
    case 'life_action_reschedule_form_closed':
      return {
        ...state,
        isLifeActionRescheduleFormOpen: false,
        lifeActionRescheduleError: null,
      };
    case 'life_action_reschedule_date_changed':
      return {
        ...state,
        lifeActionRescheduleForm: { newPlannedDate: action.newPlannedDate },
        lifeActionRescheduleError: null,
      };
    case 'life_action_reschedule_started':
      return {
        ...state,
        isLifeActionRescheduling: true,
        lifeActionRescheduleError: null,
      };
    case 'life_action_reschedule_failed':
      return {
        ...state,
        isLifeActionRescheduling: false,
        lifeActionRescheduleError: action.message,
      };
    case 'life_action_reschedule_succeeded':
      if (
        state.actionDetails.status !== 'ready' ||
        !state.actionDetails.lifeAction.id.equals(action.lifeAction.id)
      ) {
        return state;
      }
      return {
        ...state,
        details: replaceLifeActionInDecisionDetails(state.details, action.lifeAction),
        actionDetails: { ...state.actionDetails, lifeAction: action.lifeAction },
        isLifeActionRescheduleFormOpen: false,
        isLifeActionRescheduling: false,
        lifeActionRescheduleForm: createEmptyLifeActionRescheduleForm(),
        lifeActionRescheduleError: null,
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
    case 'session_completion_form_opened':
      return { ...state, isSessionCompletionFormOpen: true, sessionError: null };
    case 'session_completion_form_closed':
      return {
        ...state,
        isSessionCompletionFormOpen: false,
        sessionCompletionForm: createEmptySessionCompletionForm(),
        sessionError: null,
      };
    case 'session_result_note_changed':
      return {
        ...state,
        sessionCompletionForm: {
          ...state.sessionCompletionForm,
          resultNote: action.resultNote,
        },
        sessionError: null,
      };
    case 'session_completion_kind_changed':
      return {
        ...state,
        sessionCompletionForm: {
          ...state.sessionCompletionForm,
          completionKind: action.completionKind,
        },
        sessionError: null,
      };
    case 'action_completion_choice_changed':
      return {
        ...state,
        sessionCompletionForm: {
          ...state.sessionCompletionForm,
          actionChoice: action.actionChoice,
        },
        sessionError: null,
      };
    case 'action_actual_result_changed':
      return {
        ...state,
        sessionCompletionForm: {
          ...state.sessionCompletionForm,
          actualResult: action.actualResult,
        },
        sessionError: null,
      };
    case 'session_completed':
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
          unfinishedSession: null,
        },
        isSessionMutating: false,
        sessionError: null,
        isSessionCompletionFormOpen: false,
        sessionCompletionForm: createEmptySessionCompletionForm(),
        hasPendingActionCompletion: false,
      };
    case 'session_completed_action_failed':
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
          unfinishedSession: null,
        },
        isSessionMutating: false,
        sessionError: action.message,
        isSessionCompletionFormOpen: false,
        hasPendingActionCompletion: true,
      };
    case 'life_action_completed':
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
          sessions:
            action.session === undefined
              ? state.actionDetails.sessions
              : replaceSession(state.actionDetails.sessions, action.session),
          unfinishedSession: null,
        },
        isSessionMutating: false,
        sessionError: null,
        isSessionCompletionFormOpen: false,
        sessionCompletionForm: createEmptySessionCompletionForm(),
        hasPendingActionCompletion: false,
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

export function validateDecisionRescheduleForm(form: DecisionRescheduleFormState): string | null {
  return form.newPlannedDate.trim().length === 0 ? 'Выберите новую дату' : null;
}

export async function rescheduleDecisionResult(input: {
  readonly decisionId: EntityId;
  readonly form: DecisionRescheduleFormState;
  readonly rescheduleDecisionSafely: Pick<RescheduleDecisionSafely, 'execute'>;
}): Promise<
  | { readonly ok: true; readonly decision: Decision }
  | { readonly ok: false; readonly message: string }
> {
  const result = await input.rescheduleDecisionSafely.execute({
    decisionId: input.decisionId,
    newPlannedDate: input.form.newPlannedDate,
  });

  return result.ok
    ? { ok: true, decision: result.value }
    : { ok: false, message: decisionRescheduleErrorMessage(result.error.code) };
}

export function decisionRescheduleErrorMessage(code: string): string {
  switch (code) {
    case 'decision.planned_date_required':
      return 'Выберите новую дату';
    case 'decision.planned_date_in_past':
      return 'Нельзя перенести решение на прошедшую дату';
    case 'decision.main_limit_reached':
      return 'На выбранную дату уже назначены три главных решения';
    case 'decision.actions_block_reschedule':
      return 'Сначала завершите настройку или выполнение связанных действий';
    case 'decision.cannot_reschedule':
      return 'Это решение уже нельзя переносить';
    default:
      return 'Не удалось перенести решение';
  }
}

export function validateLifeActionEditForm(form: LifeActionEditFormState): string | null {
  if (form.title.trim().length === 0) {
    return 'Введите название действия';
  }

  if (form.expectedResult.trim().length === 0) {
    return 'Укажите ожидаемый результат';
  }

  return null;
}

export function validateLifeActionRescheduleForm(
  form: LifeActionRescheduleFormState,
): string | null {
  return form.newPlannedDate.trim().length === 0 ? 'Выберите новую дату' : null;
}

export async function rescheduleLifeActionResult(input: {
  readonly lifeActionId: EntityId;
  readonly form: LifeActionRescheduleFormState;
  readonly rescheduleLifeActionSafely: Pick<RescheduleLifeActionSafely, 'execute'>;
}): Promise<
  | { readonly ok: true; readonly lifeAction: LifeAction }
  | { readonly ok: false; readonly message: string }
> {
  const result = await input.rescheduleLifeActionSafely.execute({
    lifeActionId: input.lifeActionId,
    newPlannedDate: input.form.newPlannedDate,
  });

  return result.ok
    ? { ok: true, lifeAction: result.value }
    : { ok: false, message: lifeActionRescheduleErrorMessage(result.error.code) };
}

export function lifeActionRescheduleErrorMessage(code: string): string {
  switch (code) {
    case 'action.planned_date_required':
      return 'Выберите новую дату';
    case 'action.planned_date_in_past':
      return 'Нельзя перенести действие на прошедшую дату';
    case 'action.session_unfinished':
      return 'Сначала завершите текущую сессию';
    case 'action.cannot_reschedule':
      return 'Это действие уже нельзя переносить';
    default:
      return 'Не удалось перенести действие';
  }
}

export async function updateLifeActionDetailsResult(input: {
  readonly lifeActionId: EntityId;
  readonly form: LifeActionEditFormState;
  readonly updateLifeActionDetails: Pick<UpdateLifeActionDetails, 'execute'>;
}): Promise<
  | { readonly ok: true; readonly lifeAction: LifeAction }
  | { readonly ok: false; readonly message: string }
> {
  const result = await input.updateLifeActionDetails.execute({
    lifeActionId: input.lifeActionId,
    title: input.form.title,
    description: input.form.description,
    expectedResult: input.form.expectedResult,
  });

  return result.ok
    ? { ok: true, lifeAction: result.value }
    : { ok: false, message: lifeActionEditErrorMessage(result.error.code) };
}

export function lifeActionEditErrorMessage(code: string): string {
  switch (code) {
    case 'action.title_required':
    case 'life_action_title.invalid':
      return 'Введите название действия';
    case 'action.expected_result_required':
    case 'action_expected_result.invalid':
      return 'Укажите ожидаемый результат';
    case 'action.cannot_edit':
      return 'Это действие уже нельзя редактировать';
    default:
      return 'Не удалось сохранить изменения';
  }
}

export async function cancelLifeActionResult(input: {
  readonly lifeActionId: EntityId;
  readonly cancelLifeActionSafely: Pick<CancelLifeActionSafely, 'execute'>;
}): Promise<
  | { readonly ok: true; readonly lifeAction: LifeAction }
  | { readonly ok: false; readonly message: string }
> {
  const result = await input.cancelLifeActionSafely.execute({
    lifeActionId: input.lifeActionId,
  });

  return result.ok
    ? { ok: true, lifeAction: result.value }
    : { ok: false, message: lifeActionCancellationErrorMessage(result.error.code) };
}

export function lifeActionCancellationErrorMessage(code: string): string {
  if (code === 'action.session_unfinished') {
    return 'Сначала завершите текущую сессию';
  }

  if (code === 'action.cannot_cancel') {
    return 'Это действие уже нельзя отменить';
  }

  return 'Не удалось отменить действие';
}

export function validateDecisionConfirmationForm(
  form: DecisionConfirmationFormState,
): string | null {
  return form.actualResult.trim().length === 0 ? 'Укажите фактический результат решения' : null;
}

export async function confirmDecisionResult(input: {
  readonly decisionId: EntityId;
  readonly form: DecisionConfirmationFormState;
  readonly confirmDecisionFromActions: Pick<ConfirmDecisionFromActions, 'execute'>;
}): Promise<
  | { readonly ok: true; readonly decision: Decision }
  | { readonly ok: false; readonly message: string }
> {
  const result = await input.confirmDecisionFromActions.execute({
    decisionId: input.decisionId,
    actualResult: input.form.actualResult,
  });

  return result.ok
    ? { ok: true, decision: result.value }
    : { ok: false, message: decisionConfirmationErrorMessage(result.error.code) };
}

export function validateDecisionEditForm(
  form: DecisionEditFormState,
  kind: DecisionKind,
): string | null {
  if (form.title.trim().length === 0) {
    return 'Введите название решения';
  }

  if (kind === DECISION_KIND.main && form.expectedResult.trim().length === 0) {
    return 'Укажите ожидаемый результат';
  }

  return null;
}

export async function updateDecisionDetailsResult(input: {
  readonly decisionId: EntityId;
  readonly form: DecisionEditFormState;
  readonly updateDecisionDetails: Pick<UpdateDecisionDetails, 'execute'>;
}): Promise<
  | { readonly ok: true; readonly decision: Decision }
  | { readonly ok: false; readonly message: string }
> {
  const result = await input.updateDecisionDetails.execute({
    decisionId: input.decisionId,
    title: input.form.title,
    expectedResult: input.form.expectedResult,
  });

  return result.ok
    ? { ok: true, decision: result.value }
    : { ok: false, message: decisionEditErrorMessage(result.error.code) };
}

export function decisionEditErrorMessage(code: string): string {
  switch (code) {
    case 'decision.title_required':
    case 'decision_title.invalid':
      return 'Введите название решения';
    case 'decision.expected_result_required':
    case 'decision.main_requires_expected_result':
    case 'expected_result.invalid':
      return 'Укажите ожидаемый результат';
    case 'decision.cannot_edit':
      return 'Это решение уже нельзя редактировать';
    default:
      return 'Не удалось сохранить изменения';
  }
}

export async function cancelDecisionResult(input: {
  readonly decisionId: EntityId;
  readonly cancelDecisionSafely: Pick<CancelDecisionSafely, 'execute'>;
}): Promise<
  | { readonly ok: true; readonly decision: Decision }
  | { readonly ok: false; readonly message: string }
> {
  const result = await input.cancelDecisionSafely.execute({ decisionId: input.decisionId });

  return result.ok
    ? { ok: true, decision: result.value }
    : { ok: false, message: decisionCancellationErrorMessage(result.error.code) };
}

export function decisionCancellationErrorMessage(code: string): string {
  if (code === 'decision.actions_unfinished') {
    return 'Сначала завершите или отмените незавершённые действия';
  }

  return 'Не удалось отменить решение';
}

export function decisionConfirmationErrorMessage(code: string): string {
  switch (code) {
    case 'decision.actual_result_required':
    case 'actual_result_summary.invalid':
      return 'Укажите фактический результат решения';
    case 'decision.no_completed_actions':
      return 'Сначала завершите хотя бы одно действие';
    case 'decision.actions_unfinished':
      return 'Сначала завершите текущие действия';
    case 'decision.cannot_confirm':
      return 'Это решение больше нельзя подтвердить';
    default:
      return 'Не удалось подтвердить решение';
  }
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

export function validateSessionCompletionForm(form: SessionCompletionFormState): string | null {
  if (
    form.actionChoice === ACTION_COMPLETION_CHOICE.completeAction &&
    form.actualResult.trim().length === 0
  ) {
    return 'Укажите фактический результат';
  }

  return null;
}

export function completeSessionErrorMessage(code: string): string {
  if (code === 'session.not_found') {
    return 'Сессия больше недоступна';
  }

  return 'Не удалось завершить сессию';
}

export const ACTION_COMPLETION_FAILED_MESSAGE =
  'Сессия завершена, но действие не удалось завершить';

export type SessionCompletionWorkflowResult =
  | { readonly status: 'session_failed'; readonly message: string }
  | { readonly status: 'session_completed'; readonly session: ActionSession }
  | {
      readonly status: 'action_completed';
      readonly session: ActionSession;
      readonly lifeAction: LifeAction;
    }
  | {
      readonly status: 'action_failed';
      readonly session: ActionSession;
      readonly message: string;
    };

export async function completeSessionWorkflow(input: {
  readonly session: ActionSession;
  readonly lifeAction: LifeAction;
  readonly form: SessionCompletionFormState;
  readonly completeActionSession: Pick<CompleteActionSession, 'execute'>;
  readonly completeLifeAction: Pick<CompleteLifeAction, 'execute'>;
}): Promise<SessionCompletionWorkflowResult> {
  const actualResult =
    input.form.actionChoice === ACTION_COMPLETION_CHOICE.completeAction
      ? ActionActualResult.create(input.form.actualResult)
      : null;
  let sessionResult: Awaited<ReturnType<CompleteActionSession['execute']>>;
  try {
    sessionResult = await input.completeActionSession.execute({
      sessionId: input.session.id,
      completionKind: input.form.completionKind,
      ...(input.form.resultNote.trim().length === 0 ? {} : { resultNote: input.form.resultNote }),
    });
  } catch {
    return { status: 'session_failed', message: 'Не удалось завершить сессию' };
  }

  if (!sessionResult.ok) {
    return {
      status: 'session_failed',
      message: completeSessionErrorMessage(sessionResult.error.code),
    };
  }

  if (actualResult === null) {
    return { status: 'session_completed', session: sessionResult.value };
  }

  let actionResult: Awaited<ReturnType<CompleteLifeAction['execute']>>;
  try {
    actionResult = await input.completeLifeAction.execute({
      lifeActionId: input.lifeAction.id,
      actualResult,
    });
  } catch {
    return {
      status: 'action_failed',
      session: sessionResult.value,
      message: ACTION_COMPLETION_FAILED_MESSAGE,
    };
  }

  if (!actionResult.ok) {
    return {
      status: 'action_failed',
      session: sessionResult.value,
      message: ACTION_COMPLETION_FAILED_MESSAGE,
    };
  }

  return {
    status: 'action_completed',
    session: sessionResult.value,
    lifeAction: actionResult.value,
  };
}

export async function retryLifeActionCompletion(input: {
  readonly lifeAction: LifeAction;
  readonly actualResult: string;
  readonly completeLifeAction: Pick<CompleteLifeAction, 'execute'>;
}): Promise<
  | { readonly ok: true; readonly lifeAction: LifeAction }
  | { readonly ok: false; readonly message: string }
> {
  const result = await input.completeLifeAction.execute({
    lifeActionId: input.lifeAction.id,
    actualResult: ActionActualResult.create(input.actualResult),
  });

  return result.ok
    ? { ok: true, lifeAction: result.value }
    : { ok: false, message: ACTION_COMPLETION_FAILED_MESSAGE };
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

function createEmptyLifeActionEditForm(): LifeActionEditFormState {
  return { title: '', description: '', expectedResult: '' };
}

function createEmptyDecisionRescheduleForm(): DecisionRescheduleFormState {
  return { newPlannedDate: '' };
}

function closedDecisionRescheduleState(): Pick<
  TodayPageState,
  | 'isDecisionRescheduleFormOpen'
  | 'isDecisionRescheduling'
  | 'decisionRescheduleForm'
  | 'decisionRescheduleError'
> {
  return {
    isDecisionRescheduleFormOpen: false,
    isDecisionRescheduling: false,
    decisionRescheduleForm: createEmptyDecisionRescheduleForm(),
    decisionRescheduleError: null,
  };
}

function createEmptyLifeActionRescheduleForm(): LifeActionRescheduleFormState {
  return { newPlannedDate: '' };
}

function closedLifeActionManagementState(): Pick<
  TodayPageState,
  | 'isLifeActionEditFormOpen'
  | 'isLifeActionEditing'
  | 'lifeActionEditForm'
  | 'lifeActionEditError'
  | 'isLifeActionCancellationOpen'
  | 'isLifeActionCancelling'
  | 'lifeActionCancellationError'
  | 'isLifeActionRescheduleFormOpen'
  | 'isLifeActionRescheduling'
  | 'lifeActionRescheduleForm'
  | 'lifeActionRescheduleError'
> {
  return {
    isLifeActionEditFormOpen: false,
    isLifeActionEditing: false,
    lifeActionEditForm: createEmptyLifeActionEditForm(),
    lifeActionEditError: null,
    isLifeActionCancellationOpen: false,
    isLifeActionCancelling: false,
    lifeActionCancellationError: null,
    isLifeActionRescheduleFormOpen: false,
    isLifeActionRescheduling: false,
    lifeActionRescheduleForm: createEmptyLifeActionRescheduleForm(),
    lifeActionRescheduleError: null,
  };
}

function createEmptyDecisionConfirmationForm(): DecisionConfirmationFormState {
  return { actualResult: '' };
}

function createEmptyDecisionEditForm(): DecisionEditFormState {
  return { title: '', expectedResult: '' };
}

function createEmptySessionCompletionForm(): SessionCompletionFormState {
  return {
    resultNote: '',
    completionKind: SESSION_COMPLETION_KIND.completed,
    actionChoice: ACTION_COMPLETION_CHOICE.continueLater,
    actualResult: '',
  };
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

function replaceDecisionInDecisionsState(
  state: DecisionsState,
  updatedDecision: Decision,
): DecisionsState {
  if (state.status !== 'ready') {
    return state;
  }

  return {
    status: 'ready',
    decisions: state.decisions.map((decision) =>
      decision.id.equals(updatedDecision.id) ? updatedDecision : decision,
    ),
  };
}

function removeDecisionFromDecisionsState(
  state: DecisionsState,
  decisionId: EntityId,
): DecisionsState {
  if (state.status !== 'ready') {
    return state;
  }

  return {
    status: 'ready',
    decisions: state.decisions.filter((decision) => !decision.id.equals(decisionId)),
  };
}
