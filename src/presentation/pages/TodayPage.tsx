import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import type {
  CancelDecisionSafely,
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
  StartLifeActionSession,
  UpdateDecisionDetails,
} from '../../application';
import {
  DECISION_KIND,
  DECISION_STATUS,
  type DayDate,
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
  completeSessionWorkflow,
  cancelDecisionResult,
  confirmDecisionResult,
  createDecisionAndReload,
  createLifeActionAndReload,
  INITIAL_TODAY_PAGE_STATE,
  isDecisionActivationKey,
  pauseSessionErrorMessage,
  retryLifeActionCompletion,
  resumeSessionErrorMessage,
  startSessionErrorMessage,
  todayPageReducer,
  updateDecisionDetailsResult,
  validateDecisionForm,
  validateLifeActionForm,
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
  getActionSessionsForLifeAction,
  getUnfinishedActionSession,
  clock,
}: TodayPageProps) {
  const [state, dispatch] = useReducer(todayPageReducer, INITIAL_TODAY_PAGE_STATE);
  const savingRef = useRef(false);
  const lifeActionSavingRef = useRef(false);
  const sessionMutationRef = useRef(false);
  const decisionConfirmationRef = useRef(false);
  const decisionEditRef = useRef(false);
  const decisionCancellationRef = useRef(false);

  const loadDecisions = useCallback(async () => {
    dispatch({ type: 'load_started' });
    try {
      const decisions = await getDecisionsForDate.execute(currentDate);
      dispatch({ type: 'load_succeeded', decisions });
    } catch {
      dispatch({ type: 'load_failed' });
    }
  }, [currentDate, getDecisionsForDate]);

  useEffect(() => {
    void loadDecisions();
  }, [loadDecisions]);

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
      const result = await createDecisionAndReload({
        currentDate,
        form: state.form,
        createDecisionForDate,
        getDecisionsForDate,
      });

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
        plannedDate: currentDate,
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
      clock={clock}
      state={state}
      onRetry={() => void loadDecisions()}
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
    />
  );
}

interface TodayPageViewProps {
  readonly currentDate: DayDate;
  readonly clock: Pick<Clock, 'now'>;
  readonly state: TodayPageState;
  readonly onRetry: () => void;
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
}

export function TodayPageView({
  currentDate,
  clock,
  state,
  onRetry,
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
}: TodayPageViewProps) {
  return (
    <>
      <main className="today-page">
        <header className="today-header">
          <p className="today-brand">LifeOS</p>
          <div>
            <h1>Сегодня</h1>
            <p className="today-date">{formatRussianDate(currentDate)}</p>
          </div>
          <p className="today-storage-note">Данные сохраняются на этом устройстве</p>
        </header>

        <div className="today-actions">
          <button className="primary-button" type="button" onClick={onOpenForm}>
            Создать решение
          </button>
        </div>

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
            Загружаем решения…
          </p>
        ) : null}

        {state.decisions.status === 'error' ? (
          <section className="page-message page-error" role="alert">
            <p>Не удалось загрузить решения</p>
            <button className="secondary-button" type="button" onClick={onRetry}>
              Повторить
            </button>
          </section>
        ) : null}

        {state.decisions.status === 'ready' ? (
          <DecisionSections decisions={state.decisions.decisions} onOpenDecision={onOpenDecision} />
        ) : null}
      </main>

      {state.actionDetails.status === 'closed' ? (
        <DecisionDetailsPanel
          details={state.details}
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
          onOpenLifeAction={onOpenLifeAction}
        />
      ) : (
        <LifeActionDetailsPanel
          details={state.actionDetails}
          decisionTitle={
            state.details.status === 'ready' ? state.details.decision.title.toString() : null
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
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year!, month! - 1, day)));
}
