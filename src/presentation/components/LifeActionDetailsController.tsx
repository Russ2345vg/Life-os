import { useCallback, useEffect, useReducer, useRef, useState, type FormEvent } from 'react';
import type {
  CancelLifeActionSafely,
  Clock,
  CompleteActionSession,
  CompleteLifeAction,
  GetActionSessionsForLifeAction,
  GetDecisionById,
  GetUnfinishedActionSession,
  PauseActionSession,
  RescheduleLifeActionSafely,
  ResumeActionSession,
  StartLifeActionSession,
  UpdateLifeActionDetails,
  SpheresSnapshot,
} from '../../application';
import type { ActionSession, DayDate, LifeAction, SessionCompletionKind } from '../../domain';
import { LifeActionDetailsPanel } from './LifeActionDetailsPanel';
import {
  completeSessionWorkflow,
  cancelLifeActionResult,
  INITIAL_TODAY_PAGE_STATE,
  pauseSessionErrorMessage,
  rescheduleLifeActionResult,
  resumeSessionErrorMessage,
  retryLifeActionCompletion,
  startSessionErrorMessage,
  todayPageReducer,
  updateLifeActionDetailsResult,
  validateLifeActionEditForm,
  validateLifeActionRescheduleForm,
  validateSessionCompletionForm,
  type ActionCompletionChoice,
} from '../pages/TodayPageState';

interface LifeActionDecisionContext {
  readonly title: string;
  readonly plannedDate: DayDate | null;
}

interface LifeActionDetailsControllerProps {
  readonly lifeAction: LifeAction | null;
  readonly currentDate: DayDate;
  readonly readOnly: boolean;
  readonly spheres?: SpheresSnapshot;
  readonly clock: Pick<Clock, 'now'>;
  readonly getDecisionById: Pick<GetDecisionById, 'execute'>;
  readonly getActionSessionsForLifeAction: Pick<GetActionSessionsForLifeAction, 'execute'>;
  readonly getUnfinishedActionSession: Pick<GetUnfinishedActionSession, 'execute'>;
  readonly startLifeActionSession: Pick<StartLifeActionSession, 'execute'>;
  readonly pauseActionSession: Pick<PauseActionSession, 'execute'>;
  readonly resumeActionSession: Pick<ResumeActionSession, 'execute'>;
  readonly completeActionSession: Pick<CompleteActionSession, 'execute'>;
  readonly completeLifeAction: Pick<CompleteLifeAction, 'execute'>;
  readonly updateLifeActionDetails: Pick<UpdateLifeActionDetails, 'execute'>;
  readonly cancelLifeActionSafely: Pick<CancelLifeActionSafely, 'execute'>;
  readonly rescheduleLifeActionSafely: Pick<RescheduleLifeActionSafely, 'execute'>;
  readonly backLabel: string;
  readonly onClose: () => void;
  readonly onActionChanged: (lifeAction: LifeAction) => void;
}

export function LifeActionDetailsController({
  lifeAction,
  currentDate,
  readOnly,
  spheres = { active: [], archived: [] },
  clock,
  getDecisionById,
  getActionSessionsForLifeAction,
  getUnfinishedActionSession,
  startLifeActionSession,
  pauseActionSession,
  resumeActionSession,
  completeActionSession,
  completeLifeAction,
  updateLifeActionDetails,
  cancelLifeActionSafely,
  rescheduleLifeActionSafely,
  backLabel,
  onClose,
  onActionChanged,
}: LifeActionDetailsControllerProps) {
  const [state, dispatch] = useReducer(todayPageReducer, INITIAL_TODAY_PAGE_STATE);
  const [decisionContext, setDecisionContext] = useState<LifeActionDecisionContext | null>(null);
  const loadGenerationRef = useRef(0);
  const sessionMutationRef = useRef(false);
  const lifeActionEditRef = useRef(false);
  const lifeActionCancellationRef = useRef(false);
  const lifeActionRescheduleRef = useRef(false);

  const loadLifeActionDetails = useCallback(
    async (action: LifeAction) => {
      const generation = ++loadGenerationRef.current;
      dispatch({ type: 'action_details_load_started', lifeAction: action });
      setDecisionContext(null);

      try {
        const [sessions, unfinishedSession, context] = await Promise.all([
          getActionSessionsForLifeAction.execute(action.id),
          getUnfinishedActionSession.execute(),
          loadDecisionContext(action, getDecisionById),
        ]);

        if (generation !== loadGenerationRef.current) {
          return;
        }

        setDecisionContext(context);
        dispatch({
          type: 'action_details_load_succeeded',
          lifeActionId: action.id,
          sessions,
          unfinishedSession,
        });
      } catch {
        if (generation !== loadGenerationRef.current) {
          return;
        }

        dispatch({ type: 'action_details_load_failed', lifeActionId: action.id });
      }
    },
    [getActionSessionsForLifeAction, getDecisionById, getUnfinishedActionSession],
  );

  useEffect(() => {
    if (lifeAction === null) {
      return;
    }

    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) {
        void loadLifeActionDetails(lifeAction);
      }
    });

    return () => {
      cancelled = true;
      loadGenerationRef.current += 1;
    };
  }, [lifeAction, loadLifeActionDetails]);

  async function handleLifeActionEdit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (lifeActionEditRef.current || state.actionDetails.status !== 'ready') {
      return;
    }

    const validationError = validateLifeActionEditForm(state.lifeActionEditForm);
    if (validationError !== null) {
      dispatch({ type: 'life_action_edit_failed', message: validationError });
      return;
    }

    lifeActionEditRef.current = true;
    dispatch({ type: 'life_action_edit_started' });
    try {
      const result = await updateLifeActionDetailsResult({
        lifeActionId: state.actionDetails.lifeAction.id,
        form: state.lifeActionEditForm,
        updateLifeActionDetails,
      });

      if (!result.ok) {
        dispatch({ type: 'life_action_edit_failed', message: result.message });
        return;
      }

      dispatch({ type: 'life_action_edit_succeeded', lifeAction: result.lifeAction });
      onActionChanged(result.lifeAction);
    } catch {
      dispatch({ type: 'life_action_edit_failed', message: 'Не удалось сохранить изменения' });
    } finally {
      lifeActionEditRef.current = false;
    }
  }

  async function handleLifeActionCancellation(): Promise<void> {
    if (lifeActionCancellationRef.current || state.actionDetails.status !== 'ready') {
      return;
    }

    lifeActionCancellationRef.current = true;
    dispatch({ type: 'life_action_cancellation_started' });
    try {
      const result = await cancelLifeActionResult({
        lifeActionId: state.actionDetails.lifeAction.id,
        cancelLifeActionSafely,
      });

      if (!result.ok) {
        dispatch({ type: 'life_action_cancellation_failed', message: result.message });
        return;
      }

      dispatch({ type: 'life_action_cancellation_succeeded', lifeAction: result.lifeAction });
      onActionChanged(result.lifeAction);
    } catch {
      dispatch({
        type: 'life_action_cancellation_failed',
        message: 'Не удалось отменить действие',
      });
    } finally {
      lifeActionCancellationRef.current = false;
    }
  }

  async function handleLifeActionReschedule(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (lifeActionRescheduleRef.current || state.actionDetails.status !== 'ready') {
      return;
    }

    const validationError = validateLifeActionRescheduleForm(state.lifeActionRescheduleForm);
    if (validationError !== null) {
      dispatch({ type: 'life_action_reschedule_failed', message: validationError });
      return;
    }

    lifeActionRescheduleRef.current = true;
    dispatch({ type: 'life_action_reschedule_started' });
    try {
      const result = await rescheduleLifeActionResult({
        lifeActionId: state.actionDetails.lifeAction.id,
        form: state.lifeActionRescheduleForm,
        rescheduleLifeActionSafely,
      });

      if (!result.ok) {
        dispatch({ type: 'life_action_reschedule_failed', message: result.message });
        return;
      }

      dispatch({ type: 'life_action_reschedule_succeeded', lifeAction: result.lifeAction });
      onActionChanged(result.lifeAction);
    } catch {
      dispatch({
        type: 'life_action_reschedule_failed',
        message: 'Не удалось перенести действие',
      });
    } finally {
      lifeActionRescheduleRef.current = false;
    }
  }

  async function handleStartSession(): Promise<void> {
    if (sessionMutationRef.current || state.actionDetails.status !== 'ready') {
      return;
    }

    sessionMutationRef.current = true;
    dispatch({ type: 'session_operation_started' });
    try {
      const result = await startLifeActionSession.execute({
        lifeActionId: state.actionDetails.lifeAction.id,
      });

      if (!result.ok) {
        dispatch({
          type: 'session_operation_failed',
          message: startSessionErrorMessage(result.error.code),
        });
        return;
      }

      dispatch({
        type: 'session_started',
        lifeAction: result.value.lifeAction,
        session: result.value.session,
      });
      onActionChanged(result.value.lifeAction);
    } catch {
      dispatch({ type: 'session_operation_failed', message: 'Не удалось начать выполнение' });
    } finally {
      sessionMutationRef.current = false;
    }
  }

  async function handlePauseSession(session: ActionSession): Promise<void> {
    if (sessionMutationRef.current) {
      return;
    }

    sessionMutationRef.current = true;
    dispatch({ type: 'session_operation_started' });
    try {
      const result = await pauseActionSession.execute({ sessionId: session.id });

      if (!result.ok) {
        dispatch({
          type: 'session_operation_failed',
          message: pauseSessionErrorMessage(result.error.code),
        });
        return;
      }

      dispatch({ type: 'session_updated', session: result.value });
      if (state.actionDetails.status === 'ready') {
        onActionChanged(state.actionDetails.lifeAction);
      }
    } catch {
      dispatch({
        type: 'session_operation_failed',
        message: 'Не удалось поставить работу на паузу',
      });
    } finally {
      sessionMutationRef.current = false;
    }
  }

  async function handleResumeSession(session: ActionSession): Promise<void> {
    if (sessionMutationRef.current) {
      return;
    }

    sessionMutationRef.current = true;
    dispatch({ type: 'session_operation_started' });
    try {
      const result = await resumeActionSession.execute({ sessionId: session.id });

      if (!result.ok) {
        dispatch({
          type: 'session_operation_failed',
          message: resumeSessionErrorMessage(),
        });
        return;
      }

      dispatch({ type: 'session_updated', session: result.value });
      if (state.actionDetails.status === 'ready') {
        onActionChanged(state.actionDetails.lifeAction);
      }
    } catch {
      dispatch({ type: 'session_operation_failed', message: resumeSessionErrorMessage() });
    } finally {
      sessionMutationRef.current = false;
    }
  }

  async function handleCompleteSession(session: ActionSession): Promise<void> {
    if (sessionMutationRef.current || state.actionDetails.status !== 'ready') {
      return;
    }

    const validationError = validateSessionCompletionForm(state.sessionCompletionForm);
    if (validationError !== null) {
      dispatch({ type: 'session_operation_failed', message: validationError });
      return;
    }

    sessionMutationRef.current = true;
    dispatch({ type: 'session_operation_started' });
    try {
      const result = await completeSessionWorkflow({
        session,
        lifeAction: state.actionDetails.lifeAction,
        form: state.sessionCompletionForm,
        completeActionSession,
        completeLifeAction,
      });

      switch (result.status) {
        case 'session_failed':
          dispatch({ type: 'session_operation_failed', message: result.message });
          break;
        case 'session_completed':
          dispatch({ type: 'session_completed', session: result.session });
          onActionChanged(state.actionDetails.lifeAction);
          break;
        case 'action_failed':
          dispatch({
            type: 'session_completed_action_failed',
            session: result.session,
            message: result.message,
          });
          onActionChanged(state.actionDetails.lifeAction);
          break;
        case 'action_completed':
          dispatch({
            type: 'life_action_completed',
            lifeAction: result.lifeAction,
            session: result.session,
          });
          onActionChanged(result.lifeAction);
          break;
      }
    } catch {
      dispatch({ type: 'session_operation_failed', message: 'Не удалось завершить сессию' });
    } finally {
      sessionMutationRef.current = false;
    }
  }

  async function handleRetryLifeActionCompletion(): Promise<void> {
    if (sessionMutationRef.current || state.actionDetails.status !== 'ready') {
      return;
    }

    sessionMutationRef.current = true;
    dispatch({ type: 'session_operation_started' });
    try {
      const result = await retryLifeActionCompletion({
        lifeAction: state.actionDetails.lifeAction,
        actualResult: state.sessionCompletionForm.actualResult,
        completeLifeAction,
      });

      if (!result.ok) {
        dispatch({ type: 'session_operation_failed', message: result.message });
        return;
      }

      dispatch({ type: 'life_action_completed', lifeAction: result.lifeAction });
      onActionChanged(result.lifeAction);
    } catch {
      dispatch({
        type: 'session_operation_failed',
        message: 'Сессия завершена, но действие не удалось завершить',
      });
    } finally {
      sessionMutationRef.current = false;
    }
  }

  if (lifeAction === null) {
    return null;
  }

  return (
    <LifeActionDetailsPanel
      details={state.actionDetails}
      currentDate={currentDate}
      readOnly={readOnly}
      spheres={spheres}
      decisionTitle={decisionContext?.title ?? null}
      decisionPlannedDate={decisionContext?.plannedDate ?? null}
      clock={clock}
      isMutating={state.isSessionMutating}
      error={state.sessionError}
      isCompletionFormOpen={state.isSessionCompletionFormOpen}
      completionForm={state.sessionCompletionForm}
      hasPendingActionCompletion={state.hasPendingActionCompletion}
      backLabel={backLabel}
      onClose={onClose}
      onBack={onClose}
      onRetry={() => {
        if (state.actionDetails.status !== 'closed') {
          void loadLifeActionDetails(state.actionDetails.lifeAction);
        }
      }}
      onStart={() => void handleStartSession()}
      onPause={(session) => void handlePauseSession(session)}
      onResume={(session) => void handleResumeSession(session)}
      onOpenCompletionForm={() => dispatch({ type: 'session_completion_form_opened' })}
      onCloseCompletionForm={() => dispatch({ type: 'session_completion_form_closed' })}
      onResultNoteChange={(resultNote) =>
        dispatch({ type: 'session_result_note_changed', resultNote })
      }
      onCompletionKindChange={(completionKind: SessionCompletionKind) =>
        dispatch({ type: 'session_completion_kind_changed', completionKind })
      }
      onActionChoiceChange={(actionChoice: ActionCompletionChoice) =>
        dispatch({ type: 'action_completion_choice_changed', actionChoice })
      }
      onActualResultChange={(actualResult) =>
        dispatch({ type: 'action_actual_result_changed', actualResult })
      }
      onComplete={(session) => void handleCompleteSession(session)}
      onRetryActionCompletion={() => void handleRetryLifeActionCompletion()}
      isEditFormOpen={state.isLifeActionEditFormOpen}
      isEditing={state.isLifeActionEditing}
      editForm={state.lifeActionEditForm}
      editError={state.lifeActionEditError}
      isCancellationOpen={state.isLifeActionCancellationOpen}
      isCancelling={state.isLifeActionCancelling}
      cancellationError={state.lifeActionCancellationError}
      onOpenEditForm={() => dispatch({ type: 'life_action_edit_form_opened' })}
      onCloseEditForm={() => dispatch({ type: 'life_action_edit_form_closed' })}
      onEditTitleChange={(title) => dispatch({ type: 'life_action_edit_title_changed', title })}
      onEditDescriptionChange={(description) =>
        dispatch({ type: 'life_action_edit_description_changed', description })
      }
      onEditExpectedResultChange={(expectedResult) =>
        dispatch({ type: 'life_action_edit_expected_result_changed', expectedResult })
      }
      onEditSphereChange={(sphereId) =>
        dispatch({ type: 'life_action_edit_sphere_changed', sphereId })
      }
      onEditSubmit={(event) => void handleLifeActionEdit(event)}
      onOpenCancellation={() => dispatch({ type: 'life_action_cancellation_opened' })}
      onCloseCancellation={() => dispatch({ type: 'life_action_cancellation_closed' })}
      onConfirmCancellation={() => void handleLifeActionCancellation()}
      isRescheduleFormOpen={state.isLifeActionRescheduleFormOpen}
      isRescheduling={state.isLifeActionRescheduling}
      rescheduleForm={state.lifeActionRescheduleForm}
      rescheduleError={state.lifeActionRescheduleError}
      onOpenRescheduleForm={() => dispatch({ type: 'life_action_reschedule_form_opened' })}
      onCloseRescheduleForm={() => dispatch({ type: 'life_action_reschedule_form_closed' })}
      onRescheduleDateChange={(newPlannedDate) =>
        dispatch({ type: 'life_action_reschedule_date_changed', newPlannedDate })
      }
      onRescheduleSubmit={(event) => void handleLifeActionReschedule(event)}
    />
  );
}

async function loadDecisionContext(
  lifeAction: LifeAction,
  getDecisionById: Pick<GetDecisionById, 'execute'>,
): Promise<LifeActionDecisionContext | null> {
  if (lifeAction.decisionId === null) {
    return null;
  }

  const result = await getDecisionById.execute(lifeAction.decisionId);
  if (!result.ok) {
    return null;
  }

  return {
    title: result.value.title.toString(),
    plannedDate: result.value.plannedDate,
  };
}
