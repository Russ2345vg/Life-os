import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import type {
  CancelDecisionSafely,
  CancelLifeActionSafely,
  Clock,
  CompleteActionSession,
  CompleteLifeAction,
  ConfirmDecisionFromActions,
  CreateDecisionForDate,
  CreateLifeActionForDecision,
  GetActionSessionsForLifeAction,
  GetDecisionById,
  GetDecisionsForDate,
  GetLifeActionsForDecision,
  GetUnfinishedActionSession,
  PauseActionSession,
  ResumeActionSession,
  RescheduleDecisionSafely,
  RescheduleLifeActionSafely,
  StartLifeActionSession,
  UpdateDecisionDetails,
  UpdateLifeActionDetails,
} from '../../application';
import {
  DECISION_KIND,
  DECISION_STATUS,
  DayDate,
  type Decision,
  type DecisionKind,
  type DecisionStatus,
  type EntityId,
  type ActionSession,
  type LifeAction,
  type SessionCompletionKind,
} from '../../domain';
import { DecisionDetailsPanel } from '../components/DecisionDetailsPanel';
import { LifeActionDetailsPanel } from '../components/LifeActionDetailsPanel';
import {
  addDays,
  formatSelectedDateTitle,
  formatSelectedDateWeekday,
  isPastDate,
  isToday,
} from '../date/selectedDate';
import {
  completeSessionWorkflow,
  cancelLifeActionResult,
  cancelDecisionResult,
  confirmDecisionResult,
  createDecisionAndReload,
  createLifeActionAndReload,
  INITIAL_TODAY_PAGE_STATE,
  isDecisionActivationKey,
  loadSelectedDateDecisions,
  pauseSessionErrorMessage,
  retryLifeActionCompletion,
  rescheduleLifeActionResult,
  rescheduleDecisionResult,
  resumeSessionErrorMessage,
  startSessionErrorMessage,
  todayPageReducer,
  updateDecisionDetailsResult,
  updateLifeActionDetailsResult,
  validateDecisionForm,
  validateLifeActionForm,
  validateLifeActionEditForm,
  validateLifeActionRescheduleForm,
  validateDecisionRescheduleForm,
  validateDecisionConfirmationForm,
  validateDecisionEditForm,
  validateSessionCompletionForm,
  type ActionCompletionChoice,
  type DecisionFormState,
  type TodayPageState,
} from './TodayPageState';

interface TodayPageProps {
  readonly currentDate: DayDate;
  readonly getDecisionsForDate: Pick<GetDecisionsForDate, 'execute'>;
  readonly createDecisionForDate: Pick<CreateDecisionForDate, 'execute'>;
  readonly getDecisionById: Pick<GetDecisionById, 'execute'>;
  readonly getLifeActionsForDecision: Pick<GetLifeActionsForDecision, 'execute'>;
  readonly createLifeActionForDecision: Pick<CreateLifeActionForDecision, 'execute'>;
  readonly startLifeActionSession: Pick<StartLifeActionSession, 'execute'>;
  readonly pauseActionSession: Pick<PauseActionSession, 'execute'>;
  readonly resumeActionSession: Pick<ResumeActionSession, 'execute'>;
  readonly completeActionSession: Pick<CompleteActionSession, 'execute'>;
  readonly completeLifeAction: Pick<CompleteLifeAction, 'execute'>;
  readonly confirmDecisionFromActions: Pick<ConfirmDecisionFromActions, 'execute'>;
  readonly updateDecisionDetails: Pick<UpdateDecisionDetails, 'execute'>;
  readonly cancelDecisionSafely: Pick<CancelDecisionSafely, 'execute'>;
  readonly updateLifeActionDetails: Pick<UpdateLifeActionDetails, 'execute'>;
  readonly cancelLifeActionSafely: Pick<CancelLifeActionSafely, 'execute'>;
  readonly rescheduleDecisionSafely: Pick<RescheduleDecisionSafely, 'execute'>;
  readonly rescheduleLifeActionSafely: Pick<RescheduleLifeActionSafely, 'execute'>;
  readonly getActionSessionsForLifeAction: Pick<GetActionSessionsForLifeAction, 'execute'>;
  readonly getUnfinishedActionSession: Pick<GetUnfinishedActionSession, 'execute'>;
  readonly clock: Pick<Clock, 'now'>;
}

export function TodayPage({
  currentDate,
  getDecisionsForDate,
  createDecisionForDate,
  getDecisionById,
  getLifeActionsForDecision,
  createLifeActionForDecision,
  startLifeActionSession,
  pauseActionSession,
  resumeActionSession,
  completeActionSession,
  completeLifeAction,
  confirmDecisionFromActions,
  updateDecisionDetails,
  cancelDecisionSafely,
  updateLifeActionDetails,
  cancelLifeActionSafely,
  rescheduleDecisionSafely,
  rescheduleLifeActionSafely,
  getActionSessionsForLifeAction,
  getUnfinishedActionSession,
  clock,
}: TodayPageProps) {
  const [state, dispatch] = useReducer(todayPageReducer, INITIAL_TODAY_PAGE_STATE);
  const [selectedDate, setSelectedDate] = useState(currentDate);
  const selectedDateRef = useRef(currentDate);
  const loadGenerationRef = useRef(0);
  const savingRef = useRef(false);
  const lifeActionSavingRef = useRef(false);
  const sessionMutationRef = useRef(false);
  const decisionConfirmationRef = useRef(false);
  const decisionEditRef = useRef(false);
  const decisionCancellationRef = useRef(false);
  const decisionRescheduleRef = useRef(false);
  const lifeActionEditRef = useRef(false);
  const lifeActionCancellationRef = useRef(false);
  const lifeActionRescheduleRef = useRef(false);

  const loadDecisions = useCallback(
    async (date: DayDate) => {
      const generation = ++loadGenerationRef.current;
      dispatch({ type: 'load_started' });
      const result = await loadSelectedDateDecisions({
        selectedDate: date,
        getDecisionsForDate,
        isCurrent: () =>
          generation === loadGenerationRef.current && selectedDateRef.current.equals(date),
      });

      if (result.status === 'succeeded') {
        dispatch({ type: 'load_succeeded', decisions: result.decisions });
      } else if (result.status === 'failed') {
        dispatch({ type: 'load_failed' });
      }
    },
    [getDecisionsForDate],
  );

  useEffect(() => {
    void loadDecisions(selectedDate);
  }, [loadDecisions, selectedDate]);

  function selectDate(date: DayDate, openForm = false): void {
    if (!date.equals(selectedDateRef.current)) {
      loadGenerationRef.current += 1;
      selectedDateRef.current = date;
      dispatch({ type: 'selected_date_changed' });
      setSelectedDate(date);
    }

    if (openForm) {
      dispatch({ type: 'open_form' });
    }
  }

  const loadDecisionDetails = useCallback(
    async (decisionId: EntityId) => {
      dispatch({ type: 'details_load_started', decisionId });
      try {
        const [decisionResult, lifeActions] = await Promise.all([
          getDecisionById.execute(decisionId),
          getLifeActionsForDecision.execute(decisionId),
        ]);

        if (!decisionResult.ok) {
          dispatch({ type: 'details_load_failed', decisionId });
          return;
        }

        dispatch({
          type: 'details_load_succeeded',
          decisionId,
          decision: decisionResult.value,
          lifeActions,
        });
      } catch {
        dispatch({ type: 'details_load_failed', decisionId });
      }
    },
    [getDecisionById, getLifeActionsForDecision],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (savingRef.current) {
      return;
    }

    const validationError = validateDecisionForm(state.form);
    if (validationError !== null) {
      dispatch({ type: 'save_failed', message: validationError });
      return;
    }

    savingRef.current = true;
    dispatch({ type: 'save_started' });
    try {
      const submissionDate = selectedDate;
      const result = await createDecisionAndReload({
        selectedDate: submissionDate,
        form: state.form,
        createDecisionForDate,
        getDecisionsForDate,
      });

      if (!selectedDateRef.current.equals(submissionDate)) {
        return;
      }

      if (!result.ok) {
        dispatch({ type: 'save_failed', message: result.message });
        return;
      }

      dispatch({ type: 'save_succeeded' });
      dispatch({ type: 'load_succeeded', decisions: result.decisions });
    } catch {
      dispatch({ type: 'save_failed', message: 'Не удалось создать решение' });
    } finally {
      savingRef.current = false;
    }
  }

  async function handleLifeActionSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (lifeActionSavingRef.current || state.details.status !== 'ready') {
      return;
    }

    const validationError = validateLifeActionForm(state.lifeActionForm);
    if (validationError !== null) {
      dispatch({ type: 'life_action_save_failed', message: validationError });
      return;
    }

    const decisionId = state.details.decisionId;
    lifeActionSavingRef.current = true;
    dispatch({ type: 'life_action_save_started' });
    try {
      const result = await createLifeActionAndReload({
        decisionId,
        plannedDate: selectedDate,
        form: state.lifeActionForm,
        createLifeActionForDecision,
        getLifeActionsForDecision,
      });

      if (!result.ok) {
        dispatch({ type: 'life_action_save_failed', message: result.message });
        return;
      }

      dispatch({
        type: 'life_action_save_succeeded',
        decisionId,
        lifeActions: result.lifeActions,
      });
    } catch {
      dispatch({ type: 'life_action_save_failed', message: 'Не удалось создать действие' });
    } finally {
      lifeActionSavingRef.current = false;
    }
  }

  async function handleDecisionConfirmation(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (decisionConfirmationRef.current || state.details.status !== 'ready') {
      return;
    }

    const validationError = validateDecisionConfirmationForm(state.decisionConfirmationForm);
    if (validationError !== null) {
      dispatch({ type: 'decision_confirmation_failed', message: validationError });
      return;
    }

    decisionConfirmationRef.current = true;
    dispatch({ type: 'decision_confirmation_started' });
    try {
      const result = await confirmDecisionResult({
        decisionId: state.details.decisionId,
        form: state.decisionConfirmationForm,
        confirmDecisionFromActions,
      });

      if (!result.ok) {
        dispatch({ type: 'decision_confirmation_failed', message: result.message });
        return;
      }

      dispatch({ type: 'decision_confirmation_succeeded', decision: result.decision });
    } catch {
      dispatch({
        type: 'decision_confirmation_failed',
        message: 'Не удалось подтвердить решение',
      });
    } finally {
      decisionConfirmationRef.current = false;
    }
  }

  async function handleDecisionEdit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (decisionEditRef.current || state.details.status !== 'ready') {
      return;
    }

    const validationError = validateDecisionEditForm(
      state.decisionEditForm,
      state.details.decision.kind,
    );
    if (validationError !== null) {
      dispatch({ type: 'decision_edit_failed', message: validationError });
      return;
    }

    decisionEditRef.current = true;
    dispatch({ type: 'decision_edit_started' });
    try {
      const result = await updateDecisionDetailsResult({
        decisionId: state.details.decisionId,
        form: state.decisionEditForm,
        updateDecisionDetails,
      });

      if (!result.ok) {
        dispatch({ type: 'decision_edit_failed', message: result.message });
        return;
      }

      dispatch({ type: 'decision_edit_succeeded', decision: result.decision });
    } catch {
      dispatch({ type: 'decision_edit_failed', message: 'Не удалось сохранить изменения' });
    } finally {
      decisionEditRef.current = false;
    }
  }

  async function handleDecisionCancellation(): Promise<void> {
    if (decisionCancellationRef.current || state.details.status !== 'ready') {
      return;
    }

    decisionCancellationRef.current = true;
    dispatch({ type: 'decision_cancellation_started' });
    try {
      const result = await cancelDecisionResult({
        decisionId: state.details.decisionId,
        cancelDecisionSafely,
      });

      if (!result.ok) {
        dispatch({ type: 'decision_cancellation_failed', message: result.message });
        return;
      }

      dispatch({ type: 'decision_cancellation_succeeded', decision: result.decision });
    } catch {
      dispatch({ type: 'decision_cancellation_failed', message: 'Не удалось отменить решение' });
    } finally {
      decisionCancellationRef.current = false;
    }
  }

  async function handleDecisionReschedule(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (decisionRescheduleRef.current || state.details.status !== 'ready') {
      return;
    }

    const validationError = validateDecisionRescheduleForm(state.decisionRescheduleForm);
    if (validationError !== null) {
      dispatch({ type: 'decision_reschedule_failed', message: validationError });
      return;
    }

    const previousPlannedDate = state.details.decision.plannedDate;
    decisionRescheduleRef.current = true;
    dispatch({ type: 'decision_reschedule_started' });
    try {
      const result = await rescheduleDecisionResult({
        decisionId: state.details.decisionId,
        form: state.decisionRescheduleForm,
        rescheduleDecisionSafely,
      });

      if (!result.ok) {
        dispatch({ type: 'decision_reschedule_failed', message: result.message });
        return;
      }

      const newPlannedDate = result.decision.plannedDate;
      const changed =
        previousPlannedDate !== null &&
        newPlannedDate !== null &&
        !previousPlannedDate.equals(newPlannedDate);
      const movedOffCurrentDay =
        changed && previousPlannedDate.equals(selectedDate) && !newPlannedDate.equals(selectedDate);
      dispatch({
        type: 'decision_reschedule_succeeded',
        decision: result.decision,
        movedOffCurrentDay,
        message:
          changed && newPlannedDate !== null
            ? `Решение перенесено на ${formatShortRussianDate(newPlannedDate)}`
            : null,
      });
    } catch {
      dispatch({ type: 'decision_reschedule_failed', message: 'Не удалось перенести решение' });
    } finally {
      decisionRescheduleRef.current = false;
    }
  }

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
    } catch {
      dispatch({
        type: 'life_action_reschedule_failed',
        message: 'Не удалось перенести действие',
      });
    } finally {
      lifeActionRescheduleRef.current = false;
    }
  }

  const loadLifeActionDetails = useCallback(
    async (lifeAction: LifeAction) => {
      dispatch({ type: 'action_details_load_started', lifeAction });
      try {
        const [sessions, unfinishedSession] = await Promise.all([
          getActionSessionsForLifeAction.execute(lifeAction.id),
          getUnfinishedActionSession.execute(),
        ]);
        dispatch({
          type: 'action_details_load_succeeded',
          lifeActionId: lifeAction.id,
          sessions,
          unfinishedSession,
        });
      } catch {
        dispatch({ type: 'action_details_load_failed', lifeActionId: lifeAction.id });
      }
    },
    [getActionSessionsForLifeAction, getUnfinishedActionSession],
  );

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
          break;
        case 'action_failed':
          dispatch({
            type: 'session_completed_action_failed',
            session: result.session,
            message: result.message,
          });
          break;
        case 'action_completed':
          dispatch({
            type: 'life_action_completed',
            lifeAction: result.lifeAction,
            session: result.session,
          });
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
    } catch {
      dispatch({
        type: 'session_operation_failed',
        message: 'Сессия завершена, но действие не удалось завершить',
      });
    } finally {
      sessionMutationRef.current = false;
    }
  }

  return (
    <TodayPageView
      currentDate={currentDate}
      selectedDate={selectedDate}
      clock={clock}
      state={state}
      onRetry={() => void loadDecisions(selectedDate)}
      onOpenPreviousDay={() => selectDate(addDays(selectedDateRef.current, -1))}
      onOpenNextDay={() => selectDate(addDays(selectedDateRef.current, 1))}
      onOpenToday={() => selectDate(currentDate)}
      onDateChange={(date) => selectDate(date)}
      onPlanTomorrow={() => selectDate(addDays(currentDate, 1), true)}
      onOpenForm={() => dispatch({ type: 'open_form' })}
      onCloseForm={() => dispatch({ type: 'close_form' })}
      onKindChange={(kind) => dispatch({ type: 'kind_changed', kind })}
      onTitleChange={(title) => dispatch({ type: 'title_changed', title })}
      onExpectedResultChange={(expectedResult) =>
        dispatch({ type: 'expected_result_changed', expectedResult })
      }
      onSubmit={(event) => void handleSubmit(event)}
      onOpenDecision={(decisionId) => void loadDecisionDetails(decisionId)}
      onCloseDecision={() => dispatch({ type: 'details_closed' })}
      onRetryDecision={() => {
        if (state.details.status !== 'closed') {
          void loadDecisionDetails(state.details.decisionId);
        }
      }}
      onOpenLifeActionForm={() => dispatch({ type: 'life_action_form_opened' })}
      onCloseLifeActionForm={() => dispatch({ type: 'life_action_form_closed' })}
      onLifeActionTitleChange={(title) => dispatch({ type: 'life_action_title_changed', title })}
      onLifeActionExpectedResultChange={(expectedResult) =>
        dispatch({ type: 'life_action_expected_result_changed', expectedResult })
      }
      onLifeActionDescriptionChange={(description) =>
        dispatch({ type: 'life_action_description_changed', description })
      }
      onLifeActionSubmit={(event) => void handleLifeActionSubmit(event)}
      onOpenDecisionConfirmationForm={() => dispatch({ type: 'decision_confirmation_form_opened' })}
      onCloseDecisionConfirmationForm={() =>
        dispatch({ type: 'decision_confirmation_form_closed' })
      }
      onDecisionActualResultChange={(actualResult) =>
        dispatch({ type: 'decision_actual_result_changed', actualResult })
      }
      onDecisionConfirmationSubmit={(event) => void handleDecisionConfirmation(event)}
      onOpenDecisionEditForm={() => dispatch({ type: 'decision_edit_form_opened' })}
      onCloseDecisionEditForm={() => dispatch({ type: 'decision_edit_form_closed' })}
      onDecisionEditTitleChange={(title) =>
        dispatch({ type: 'decision_edit_title_changed', title })
      }
      onDecisionEditExpectedResultChange={(expectedResult) =>
        dispatch({ type: 'decision_edit_expected_result_changed', expectedResult })
      }
      onDecisionEditSubmit={(event) => void handleDecisionEdit(event)}
      onOpenDecisionCancellation={() => dispatch({ type: 'decision_cancellation_opened' })}
      onCloseDecisionCancellation={() => dispatch({ type: 'decision_cancellation_closed' })}
      onConfirmDecisionCancellation={() => void handleDecisionCancellation()}
      onOpenDecisionRescheduleForm={() => dispatch({ type: 'decision_reschedule_form_opened' })}
      onCloseDecisionRescheduleForm={() => dispatch({ type: 'decision_reschedule_form_closed' })}
      onDecisionRescheduleDateChange={(newPlannedDate) =>
        dispatch({ type: 'decision_reschedule_date_changed', newPlannedDate })
      }
      onDecisionRescheduleSubmit={(event) => void handleDecisionReschedule(event)}
      onOpenLifeAction={(lifeAction) => void loadLifeActionDetails(lifeAction)}
      onBackToDecision={() => dispatch({ type: 'action_details_closed' })}
      onRetryLifeAction={() => {
        if (state.actionDetails.status !== 'closed') {
          void loadLifeActionDetails(state.actionDetails.lifeAction);
        }
      }}
      onStartSession={() => void handleStartSession()}
      onPauseSession={(session) => void handlePauseSession(session)}
      onResumeSession={(session) => void handleResumeSession(session)}
      onOpenSessionCompletionForm={() => dispatch({ type: 'session_completion_form_opened' })}
      onCloseSessionCompletionForm={() => dispatch({ type: 'session_completion_form_closed' })}
      onSessionResultNoteChange={(resultNote) =>
        dispatch({ type: 'session_result_note_changed', resultNote })
      }
      onSessionCompletionKindChange={(completionKind) =>
        dispatch({ type: 'session_completion_kind_changed', completionKind })
      }
      onActionCompletionChoiceChange={(actionChoice) =>
        dispatch({ type: 'action_completion_choice_changed', actionChoice })
      }
      onActionActualResultChange={(actualResult) =>
        dispatch({ type: 'action_actual_result_changed', actualResult })
      }
      onCompleteSession={(session) => void handleCompleteSession(session)}
      onRetryLifeActionCompletion={() => void handleRetryLifeActionCompletion()}
      onOpenLifeActionEditForm={() => dispatch({ type: 'life_action_edit_form_opened' })}
      onCloseLifeActionEditForm={() => dispatch({ type: 'life_action_edit_form_closed' })}
      onLifeActionEditTitleChange={(title) =>
        dispatch({ type: 'life_action_edit_title_changed', title })
      }
      onLifeActionEditDescriptionChange={(description) =>
        dispatch({ type: 'life_action_edit_description_changed', description })
      }
      onLifeActionEditExpectedResultChange={(expectedResult) =>
        dispatch({ type: 'life_action_edit_expected_result_changed', expectedResult })
      }
      onLifeActionEditSubmit={(event) => void handleLifeActionEdit(event)}
      onOpenLifeActionCancellation={() => dispatch({ type: 'life_action_cancellation_opened' })}
      onCloseLifeActionCancellation={() => dispatch({ type: 'life_action_cancellation_closed' })}
      onConfirmLifeActionCancellation={() => void handleLifeActionCancellation()}
      onOpenLifeActionRescheduleForm={() =>
        dispatch({ type: 'life_action_reschedule_form_opened' })
      }
      onCloseLifeActionRescheduleForm={() =>
        dispatch({ type: 'life_action_reschedule_form_closed' })
      }
      onLifeActionRescheduleDateChange={(newPlannedDate) =>
        dispatch({ type: 'life_action_reschedule_date_changed', newPlannedDate })
      }
      onLifeActionRescheduleSubmit={(event) => void handleLifeActionReschedule(event)}
    />
  );
}

interface TodayPageViewProps {
  readonly currentDate: DayDate;
  readonly selectedDate: DayDate;
  readonly clock: Pick<Clock, 'now'>;
  readonly state: TodayPageState;
  readonly onRetry: () => void;
  readonly onOpenPreviousDay: () => void;
  readonly onOpenNextDay: () => void;
  readonly onOpenToday: () => void;
  readonly onDateChange: (date: DayDate) => void;
  readonly onPlanTomorrow: () => void;
  readonly onOpenForm: () => void;
  readonly onCloseForm: () => void;
  readonly onKindChange: (kind: DecisionKind) => void;
  readonly onTitleChange: (title: string) => void;
  readonly onExpectedResultChange: (expectedResult: string) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onOpenDecision: (decisionId: EntityId) => void;
  readonly onCloseDecision: () => void;
  readonly onRetryDecision: () => void;
  readonly onOpenLifeActionForm: () => void;
  readonly onCloseLifeActionForm: () => void;
  readonly onLifeActionTitleChange: (title: string) => void;
  readonly onLifeActionExpectedResultChange: (expectedResult: string) => void;
  readonly onLifeActionDescriptionChange: (description: string) => void;
  readonly onLifeActionSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onOpenDecisionConfirmationForm: () => void;
  readonly onCloseDecisionConfirmationForm: () => void;
  readonly onDecisionActualResultChange: (actualResult: string) => void;
  readonly onDecisionConfirmationSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onOpenDecisionEditForm: () => void;
  readonly onCloseDecisionEditForm: () => void;
  readonly onDecisionEditTitleChange: (title: string) => void;
  readonly onDecisionEditExpectedResultChange: (expectedResult: string) => void;
  readonly onDecisionEditSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onOpenDecisionCancellation: () => void;
  readonly onCloseDecisionCancellation: () => void;
  readonly onConfirmDecisionCancellation: () => void;
  readonly onOpenDecisionRescheduleForm: () => void;
  readonly onCloseDecisionRescheduleForm: () => void;
  readonly onDecisionRescheduleDateChange: (newPlannedDate: string) => void;
  readonly onDecisionRescheduleSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onOpenLifeAction: (lifeAction: LifeAction) => void;
  readonly onBackToDecision: () => void;
  readonly onRetryLifeAction: () => void;
  readonly onStartSession: () => void;
  readonly onPauseSession: (session: ActionSession) => void;
  readonly onResumeSession: (session: ActionSession) => void;
  readonly onOpenSessionCompletionForm: () => void;
  readonly onCloseSessionCompletionForm: () => void;
  readonly onSessionResultNoteChange: (resultNote: string) => void;
  readonly onSessionCompletionKindChange: (completionKind: SessionCompletionKind) => void;
  readonly onActionCompletionChoiceChange: (actionChoice: ActionCompletionChoice) => void;
  readonly onActionActualResultChange: (actualResult: string) => void;
  readonly onCompleteSession: (session: ActionSession) => void;
  readonly onRetryLifeActionCompletion: () => void;
  readonly onOpenLifeActionEditForm: () => void;
  readonly onCloseLifeActionEditForm: () => void;
  readonly onLifeActionEditTitleChange: (title: string) => void;
  readonly onLifeActionEditDescriptionChange: (description: string) => void;
  readonly onLifeActionEditExpectedResultChange: (expectedResult: string) => void;
  readonly onLifeActionEditSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onOpenLifeActionCancellation: () => void;
  readonly onCloseLifeActionCancellation: () => void;
  readonly onConfirmLifeActionCancellation: () => void;
  readonly onOpenLifeActionRescheduleForm: () => void;
  readonly onCloseLifeActionRescheduleForm: () => void;
  readonly onLifeActionRescheduleDateChange: (newPlannedDate: string) => void;
  readonly onLifeActionRescheduleSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function TodayPageView({
  currentDate,
  selectedDate,
  clock,
  state,
  onRetry,
  onOpenPreviousDay,
  onOpenNextDay,
  onOpenToday,
  onDateChange,
  onPlanTomorrow,
  onOpenForm,
  onCloseForm,
  onKindChange,
  onTitleChange,
  onExpectedResultChange,
  onSubmit,
  onOpenDecision,
  onCloseDecision,
  onRetryDecision,
  onOpenLifeActionForm,
  onCloseLifeActionForm,
  onLifeActionTitleChange,
  onLifeActionExpectedResultChange,
  onLifeActionDescriptionChange,
  onLifeActionSubmit,
  onOpenDecisionConfirmationForm,
  onCloseDecisionConfirmationForm,
  onDecisionActualResultChange,
  onDecisionConfirmationSubmit,
  onOpenDecisionEditForm,
  onCloseDecisionEditForm,
  onDecisionEditTitleChange,
  onDecisionEditExpectedResultChange,
  onDecisionEditSubmit,
  onOpenDecisionCancellation,
  onCloseDecisionCancellation,
  onConfirmDecisionCancellation,
  onOpenDecisionRescheduleForm,
  onCloseDecisionRescheduleForm,
  onDecisionRescheduleDateChange,
  onDecisionRescheduleSubmit,
  onOpenLifeAction,
  onBackToDecision,
  onRetryLifeAction,
  onStartSession,
  onPauseSession,
  onResumeSession,
  onOpenSessionCompletionForm,
  onCloseSessionCompletionForm,
  onSessionResultNoteChange,
  onSessionCompletionKindChange,
  onActionCompletionChoiceChange,
  onActionActualResultChange,
  onCompleteSession,
  onRetryLifeActionCompletion,
  onOpenLifeActionEditForm,
  onCloseLifeActionEditForm,
  onLifeActionEditTitleChange,
  onLifeActionEditDescriptionChange,
  onLifeActionEditExpectedResultChange,
  onLifeActionEditSubmit,
  onOpenLifeActionCancellation,
  onCloseLifeActionCancellation,
  onConfirmLifeActionCancellation,
  onOpenLifeActionRescheduleForm,
  onCloseLifeActionRescheduleForm,
  onLifeActionRescheduleDateChange,
  onLifeActionRescheduleSubmit,
}: TodayPageViewProps) {
  const pastDate = isPastDate(selectedDate, currentDate);
  const selectedDateTitle = formatSelectedDateTitle(selectedDate, currentDate);

  return (
    <>
      <main className="today-page">
        <section className="date-navigation" aria-label="Навигация по датам">
          <div className="date-navigation-controls">
            <button
              className="date-arrow-button"
              type="button"
              aria-label="Открыть предыдущий день"
              onClick={onOpenPreviousDay}
            >
              ←
            </button>
            <p className="date-navigation-value">{selectedDate.toString()}</p>
            <button
              className="date-arrow-button"
              type="button"
              aria-label="Открыть следующий день"
              onClick={onOpenNextDay}
            >
              →
            </button>
            <button
              className="secondary-button date-today-button"
              type="button"
              disabled={isToday(selectedDate, currentDate)}
              onClick={onOpenToday}
            >
              Сегодня
            </button>
          </div>
          <label className="date-picker-label">
            <span>Выбрать дату</span>
            <input
              type="date"
              value={selectedDate.toString()}
              onInput={(event: FormEvent<HTMLInputElement>) => {
                if (event.currentTarget.value.length > 0) {
                  onDateChange(DayDate.create(event.currentTarget.value));
                }
              }}
            />
          </label>
        </section>

        <header className="today-header">
          <p className="today-brand">LifeOS</p>
          <div>
            <h1>{selectedDateTitle}</h1>
            <p className="today-date">
              {formatSelectedDateWeekday(selectedDate)} · {formatRussianDate(selectedDate)}
            </p>
          </div>
          <p className="today-storage-note">Данные сохраняются на этом устройстве</p>
        </header>

        <div className="today-actions">
          {pastDate ? null : (
            <button className="primary-button" type="button" onClick={onOpenForm}>
              Создать решение
            </button>
          )}
          <button className="secondary-button" type="button" onClick={onPlanTomorrow}>
            Планировать завтра
          </button>
        </div>

        {pastDate ? (
          <p className="past-date-note">Прошедший день доступен только для просмотра</p>
        ) : null}

        {state.decisionRescheduleNotice === null ? null : (
          <p className="decision-reschedule-notice" role="status">
            {state.decisionRescheduleNotice}
          </p>
        )}

        {state.isFormOpen ? (
          <DecisionForm
            form={state.form}
            isSaving={state.isSaving}
            error={state.formError}
            onKindChange={onKindChange}
            onTitleChange={onTitleChange}
            onExpectedResultChange={onExpectedResultChange}
            onClose={onCloseForm}
            onSubmit={onSubmit}
          />
        ) : null}

        {state.decisions.status === 'loading' ? (
          <p className="page-message" role="status">
            Загружаем решения на выбранную дату…
          </p>
        ) : null}

        {state.decisions.status === 'error' ? (
          <section className="page-message page-error" role="alert">
            <p>Не удалось загрузить выбранный день</p>
            <button className="secondary-button" type="button" onClick={onRetry}>
              Повторить
            </button>
          </section>
        ) : null}

        {state.decisions.status === 'ready' ? (
          state.decisions.decisions.length === 0 && !isToday(selectedDate, currentDate) ? (
            <p className="page-message">
              {pastDate
                ? 'На этот день решений не было'
                : 'На этот день решения ещё не запланированы'}
            </p>
          ) : (
            <DecisionSections
              decisions={state.decisions.decisions}
              onOpenDecision={onOpenDecision}
            />
          )
        ) : null}
      </main>

      {state.actionDetails.status === 'closed' ? (
        <DecisionDetailsPanel
          details={state.details}
          currentDate={currentDate}
          readOnly={pastDate}
          isFormOpen={state.isLifeActionFormOpen}
          isSaving={state.isLifeActionSaving}
          form={state.lifeActionForm}
          formError={state.lifeActionFormError}
          isConfirmationFormOpen={state.isDecisionConfirmationFormOpen}
          isConfirming={state.isDecisionConfirming}
          confirmationActualResult={state.decisionConfirmationForm.actualResult}
          confirmationError={state.decisionConfirmationError}
          isEditFormOpen={state.isDecisionEditFormOpen}
          isEditing={state.isDecisionEditing}
          editForm={state.decisionEditForm}
          editError={state.decisionEditError}
          isCancellationOpen={state.isDecisionCancellationOpen}
          isCancelling={state.isDecisionCancelling}
          cancellationError={state.decisionCancellationError}
          isRescheduleFormOpen={state.isDecisionRescheduleFormOpen}
          isRescheduling={state.isDecisionRescheduling}
          rescheduleForm={state.decisionRescheduleForm}
          rescheduleError={state.decisionRescheduleError}
          onClose={onCloseDecision}
          onRetry={onRetryDecision}
          onOpenForm={onOpenLifeActionForm}
          onCloseForm={onCloseLifeActionForm}
          onTitleChange={onLifeActionTitleChange}
          onExpectedResultChange={onLifeActionExpectedResultChange}
          onDescriptionChange={onLifeActionDescriptionChange}
          onSubmit={onLifeActionSubmit}
          onOpenConfirmationForm={onOpenDecisionConfirmationForm}
          onCloseConfirmationForm={onCloseDecisionConfirmationForm}
          onConfirmationActualResultChange={onDecisionActualResultChange}
          onConfirmationSubmit={onDecisionConfirmationSubmit}
          onOpenEditForm={onOpenDecisionEditForm}
          onCloseEditForm={onCloseDecisionEditForm}
          onEditTitleChange={onDecisionEditTitleChange}
          onEditExpectedResultChange={onDecisionEditExpectedResultChange}
          onEditSubmit={onDecisionEditSubmit}
          onOpenCancellation={onOpenDecisionCancellation}
          onCloseCancellation={onCloseDecisionCancellation}
          onConfirmCancellation={onConfirmDecisionCancellation}
          onOpenRescheduleForm={onOpenDecisionRescheduleForm}
          onCloseRescheduleForm={onCloseDecisionRescheduleForm}
          onRescheduleDateChange={onDecisionRescheduleDateChange}
          onRescheduleSubmit={onDecisionRescheduleSubmit}
          onOpenLifeAction={onOpenLifeAction}
        />
      ) : (
        <LifeActionDetailsPanel
          details={state.actionDetails}
          currentDate={currentDate}
          readOnly={pastDate}
          decisionTitle={
            state.details.status === 'ready' ? state.details.decision.title.toString() : null
          }
          decisionPlannedDate={
            state.details.status === 'ready' ? state.details.decision.plannedDate : null
          }
          clock={clock}
          isMutating={state.isSessionMutating}
          error={state.sessionError}
          isCompletionFormOpen={state.isSessionCompletionFormOpen}
          completionForm={state.sessionCompletionForm}
          hasPendingActionCompletion={state.hasPendingActionCompletion}
          onClose={onCloseDecision}
          onBack={onBackToDecision}
          onRetry={onRetryLifeAction}
          onStart={onStartSession}
          onPause={onPauseSession}
          onResume={onResumeSession}
          onOpenCompletionForm={onOpenSessionCompletionForm}
          onCloseCompletionForm={onCloseSessionCompletionForm}
          onResultNoteChange={onSessionResultNoteChange}
          onCompletionKindChange={onSessionCompletionKindChange}
          onActionChoiceChange={onActionCompletionChoiceChange}
          onActualResultChange={onActionActualResultChange}
          onComplete={onCompleteSession}
          onRetryActionCompletion={onRetryLifeActionCompletion}
          isEditFormOpen={state.isLifeActionEditFormOpen}
          isEditing={state.isLifeActionEditing}
          editForm={state.lifeActionEditForm}
          editError={state.lifeActionEditError}
          isCancellationOpen={state.isLifeActionCancellationOpen}
          isCancelling={state.isLifeActionCancelling}
          cancellationError={state.lifeActionCancellationError}
          onOpenEditForm={onOpenLifeActionEditForm}
          onCloseEditForm={onCloseLifeActionEditForm}
          onEditTitleChange={onLifeActionEditTitleChange}
          onEditDescriptionChange={onLifeActionEditDescriptionChange}
          onEditExpectedResultChange={onLifeActionEditExpectedResultChange}
          onEditSubmit={onLifeActionEditSubmit}
          onOpenCancellation={onOpenLifeActionCancellation}
          onCloseCancellation={onCloseLifeActionCancellation}
          onConfirmCancellation={onConfirmLifeActionCancellation}
          isRescheduleFormOpen={state.isLifeActionRescheduleFormOpen}
          isRescheduling={state.isLifeActionRescheduling}
          rescheduleForm={state.lifeActionRescheduleForm}
          rescheduleError={state.lifeActionRescheduleError}
          onOpenRescheduleForm={onOpenLifeActionRescheduleForm}
          onCloseRescheduleForm={onCloseLifeActionRescheduleForm}
          onRescheduleDateChange={onLifeActionRescheduleDateChange}
          onRescheduleSubmit={onLifeActionRescheduleSubmit}
        />
      )}
    </>
  );
}

interface DecisionFormProps {
  readonly form: DecisionFormState;
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly onKindChange: (kind: DecisionKind) => void;
  readonly onTitleChange: (title: string) => void;
  readonly onExpectedResultChange: (expectedResult: string) => void;
  readonly onClose: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function DecisionForm({
  form,
  isSaving,
  error,
  onKindChange,
  onTitleChange,
  onExpectedResultChange,
  onClose,
  onSubmit,
}: DecisionFormProps) {
  const isMain = form.kind === DECISION_KIND.main;

  return (
    <section className="decision-form-panel" aria-labelledby="decision-form-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Новое намерение</p>
          <h2 id="decision-form-title">Создать решение</h2>
        </div>
      </div>
      <form className="decision-form" onSubmit={onSubmit} noValidate>
        <label>
          <span>Вид</span>
          <select
            value={form.kind}
            disabled={isSaving}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              onKindChange(event.target.value as DecisionKind)
            }
          >
            <option value={DECISION_KIND.main}>Главное</option>
            <option value={DECISION_KIND.additional}>Дополнительное</option>
          </select>
        </label>

        <label>
          <span>Название решения</span>
          <input
            value={form.title}
            disabled={isSaving}
            maxLength={200}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onTitleChange(event.target.value)}
          />
        </label>

        <label>
          <span>Ожидаемый результат{isMain ? ' *' : ''}</span>
          <textarea
            value={form.expectedResult}
            disabled={isSaving}
            maxLength={1000}
            rows={3}
            aria-required={isMain}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              onExpectedResultChange(event.target.value)
            }
          />
        </label>

        {error === null ? null : (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="form-actions">
          <button className="primary-button" type="submit" disabled={isSaving}>
            {isSaving ? 'Сохраняем…' : 'Создать'}
          </button>
          <button className="secondary-button" type="button" disabled={isSaving} onClick={onClose}>
            Отмена
          </button>
        </div>
      </form>
    </section>
  );
}

function DecisionSections({
  decisions,
  onOpenDecision,
}: {
  readonly decisions: readonly Decision[];
  readonly onOpenDecision: (decisionId: EntityId) => void;
}) {
  const mainDecisions = decisions.filter((decision) => decision.kind === DECISION_KIND.main);
  const additionalDecisions = decisions.filter(
    (decision) => decision.kind === DECISION_KIND.additional,
  );

  return (
    <div className="decision-sections">
      <section className="decision-section" aria-labelledby="main-decisions-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker gold">Фокус дня</p>
            <h2 id="main-decisions-title">Главные решения</h2>
          </div>
          <span className="section-count">до 3</span>
        </div>
        <div className="main-decision-grid">
          {[1, 2, 3].map((order) => {
            const decision = findDecisionForOrder(mainDecisions, order);
            return decision === undefined ? (
              <EmptyMainDecision key={order} order={order} />
            ) : (
              <DecisionCard
                key={decision.id.toString()}
                decision={decision}
                order={order}
                main
                onOpen={onOpenDecision}
              />
            );
          })}
        </div>
      </section>

      <section className="decision-section" aria-labelledby="additional-decisions-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Остальное</p>
            <h2 id="additional-decisions-title">Дополнительные решения</h2>
          </div>
        </div>
        {additionalDecisions.length === 0 ? (
          <p className="empty-additional">Дополнительных решений пока нет</p>
        ) : (
          <div className="additional-decision-list">
            {additionalDecisions.map((decision) => (
              <DecisionCard
                key={decision.id.toString()}
                decision={decision}
                onOpen={onOpenDecision}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EmptyMainDecision({ order }: { readonly order: number }) {
  return (
    <article className="decision-card main-decision empty-decision">
      <span className="decision-order">{order}</span>
      <p>Место свободно</p>
    </article>
  );
}

function DecisionCard({
  decision,
  order,
  main = false,
  onOpen,
}: {
  readonly decision: Decision;
  readonly order?: number;
  readonly main?: boolean;
  readonly onOpen: (decisionId: EntityId) => void;
}) {
  return (
    <button
      className={`decision-card decision-card-button${main ? ' main-decision' : ''}`}
      type="button"
      aria-label={`Открыть решение «${decision.title.toString()}»`}
      onClick={() => onOpen(decision.id)}
      onKeyDown={(event) => {
        if (isDecisionActivationKey(event.key)) {
          event.preventDefault();
          onOpen(decision.id);
        }
      }}
    >
      {order === undefined ? null : <span className="decision-order">{order}</span>}
      <span className="decision-card-title">{decision.title.toString()}</span>
      {decision.expectedResult === null ? null : (
        <span className="decision-result">{decision.expectedResult.toString()}</span>
      )}
      <span className={`status-badge status-${decision.status}`}>
        {decisionStatusLabel(decision.status)}
      </span>
      <span className="decision-open-hint" aria-hidden="true">
        Открыть <span>→</span>
      </span>
    </button>
  );
}

function findDecisionForOrder(decisions: readonly Decision[], order: number): Decision | undefined {
  const matchingDecisions = decisions.filter((decision) => decision.order === order);
  return (
    matchingDecisions.find(
      (decision) =>
        decision.status === DECISION_STATUS.planned ||
        decision.status === DECISION_STATUS.inProgress,
    ) ?? matchingDecisions[0]
  );
}

function decisionStatusLabel(status: DecisionStatus): string {
  switch (status) {
    case DECISION_STATUS.draft:
      return 'Черновик';
    case DECISION_STATUS.planned:
      return 'Запланировано';
    case DECISION_STATUS.inProgress:
      return 'Выполняется';
    case DECISION_STATUS.confirmed:
      return 'Подтверждено';
    case DECISION_STATUS.cancelled:
      return 'Отменено';
  }
}

function formatRussianDate(date: DayDate): string {
  const [year, month, day] = date.toString().split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year!, month! - 1, day)));
}

function formatShortRussianDate(date: DayDate): string {
  const [year, month, day] = date.toString().split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year!, month! - 1, day)));
}
