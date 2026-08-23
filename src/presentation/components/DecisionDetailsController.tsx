import { useCallback, useEffect, useReducer, useRef, useState, type FormEvent } from 'react';
import type {
  CancelDecisionSafely,
  CancelLifeActionSafely,
  Clock,
  CompleteActionSession,
  CompleteLifeAction,
  ConfirmDecisionFromActions,
  CreateLifeActionForDecision,
  GetActionSessionsForLifeAction,
  GetDecisionById,
  GetDecisionOverview,
  GetLifeActionsForDecision,
  GetUnfinishedActionSession,
  PauseActionSession,
  RescheduleDecisionSafely,
  RescheduleLifeActionSafely,
  ResumeActionSession,
  StartLifeActionSession,
  UpdateDecisionDetails,
  UpdateLifeActionDetails,
  SpheresSnapshot,
} from '../../application';
import type { DayDate, Decision, EntityId, LifeAction, Project } from '../../domain';
import { DecisionDetailsPanel } from './DecisionDetailsPanel';
import { LifeActionDetailsController } from './LifeActionDetailsController';
import {
  cancelDecisionResult,
  confirmDecisionResult,
  createLifeActionAndReload,
  INITIAL_TODAY_PAGE_STATE,
  rescheduleDecisionResult,
  todayPageReducer,
  updateDecisionDetailsResult,
  validateDecisionConfirmationForm,
  validateDecisionEditForm,
  validateDecisionRescheduleForm,
  validateLifeActionForm,
} from '../pages/TodayPageState';

interface DecisionDetailsControllerProps {
  readonly decision: Decision | null;
  readonly currentDate: DayDate;
  readonly selectedDate: DayDate;
  readonly readOnly: boolean;
  readonly spheres?: SpheresSnapshot;
  readonly projects?: readonly Project[];
  readonly getDecisionById: Pick<GetDecisionById, 'execute'>;
  readonly getDecisionOverview: Pick<GetDecisionOverview, 'execute'>;
  readonly getLifeActionsForDecision: Pick<GetLifeActionsForDecision, 'execute'>;
  readonly createLifeActionForDecision: Pick<CreateLifeActionForDecision, 'execute'>;
  readonly confirmDecisionFromActions: Pick<ConfirmDecisionFromActions, 'execute'>;
  readonly updateDecisionDetails: Pick<UpdateDecisionDetails, 'execute'>;
  readonly cancelDecisionSafely: Pick<CancelDecisionSafely, 'execute'>;
  readonly rescheduleDecisionSafely: Pick<RescheduleDecisionSafely, 'execute'>;
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
  readonly clock: Pick<Clock, 'now'>;
  readonly onClose: () => void;
  readonly onDecisionChanged: (decision: Decision) => void;
  readonly initialLifeActionFormOpen?: boolean;
  readonly onLifeActionCreated?: (lifeAction: LifeAction) => void;
  readonly onOpenProject?: (projectId: string) => void;
}

export function DecisionDetailsController({
  decision,
  currentDate,
  selectedDate,
  readOnly,
  spheres = { active: [], archived: [] },
  projects = [],
  getDecisionById,
  getDecisionOverview,
  getLifeActionsForDecision,
  createLifeActionForDecision,
  confirmDecisionFromActions,
  updateDecisionDetails,
  cancelDecisionSafely,
  rescheduleDecisionSafely,
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
  clock,
  onClose,
  onDecisionChanged,
  initialLifeActionFormOpen = false,
  onLifeActionCreated,
  onOpenProject = () => undefined,
}: DecisionDetailsControllerProps) {
  const [state, dispatch] = useReducer(todayPageReducer, INITIAL_TODAY_PAGE_STATE);
  const [selectedAction, setSelectedAction] = useState<LifeAction | null>(null);
  const loadGenerationRef = useRef(0);
  const lifeActionSavingRef = useRef(false);
  const decisionConfirmationRef = useRef(false);
  const decisionEditRef = useRef(false);
  const decisionCancellationRef = useRef(false);
  const decisionRescheduleRef = useRef(false);
  const shouldOpenLifeActionFormRef = useRef(initialLifeActionFormOpen);
  const loadDecisionDetails = useCallback(
    async (decisionId: EntityId, closeSelectedAction = true) => {
      const generation = ++loadGenerationRef.current;
      dispatch({ type: 'details_load_started', decisionId });
      if (closeSelectedAction) {
        setSelectedAction(null);
      }

      try {
        const overviewResult = await getDecisionOverview.execute(decisionId);

        if (generation !== loadGenerationRef.current) {
          return;
        }

        if (!overviewResult.ok) {
          dispatch({ type: 'details_load_failed', decisionId });
          return;
        }

        dispatch({
          type: 'details_load_succeeded',
          decisionId,
          decision: overviewResult.value.decision,
          lifeActions: overviewResult.value.actions.map((entry) => entry.lifeAction),
          actionOverviews: overviewResult.value.actions,
        });
        if (shouldOpenLifeActionFormRef.current) {
          shouldOpenLifeActionFormRef.current = false;
          dispatch({ type: 'life_action_form_opened' });
        }
      } catch {
        if (generation === loadGenerationRef.current) {
          dispatch({ type: 'details_load_failed', decisionId });
        }
      }
    },
    [getDecisionOverview],
  );

  useEffect(() => {
    if (decision === null) {
      loadGenerationRef.current += 1;
      return;
    }

    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) {
        void loadDecisionDetails(decision.id);
      }
    });

    return () => {
      cancelled = true;
      loadGenerationRef.current += 1;
    };
  }, [decision, loadDecisionDetails]);

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
    const plannedDate = state.details.decision.plannedDate ?? selectedDate;
    lifeActionSavingRef.current = true;
    dispatch({ type: 'life_action_save_started' });

    try {
      const result = await createLifeActionAndReload({
        decisionId,
        plannedDate,
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
      onLifeActionCreated?.(result.lifeAction);
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
      onDecisionChanged(result.decision);
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
      onDecisionChanged(result.decision);
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
      onDecisionChanged(result.decision);
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
        expectedVersion: state.details.decision.version,
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
      onDecisionChanged(result.decision);
    } catch {
      dispatch({ type: 'decision_reschedule_failed', message: 'Не удалось перенести решение' });
    } finally {
      decisionRescheduleRef.current = false;
    }
  }

  function handleActionChanged(lifeAction: LifeAction): void {
    setSelectedAction(lifeAction);
    if (state.details.status === 'ready') {
      void loadDecisionDetails(state.details.decisionId, false);
    }
  }

  if (decision === null) {
    return null;
  }

  if (selectedAction !== null) {
    const actionReadOnly = selectedAction.plannedDate?.isBefore(currentDate) ?? readOnly;

    return (
      <LifeActionDetailsController
        lifeAction={selectedAction}
        currentDate={currentDate}
        readOnly={actionReadOnly}
        clock={clock}
        getDecisionById={getDecisionById}
        getActionSessionsForLifeAction={getActionSessionsForLifeAction}
        getUnfinishedActionSession={getUnfinishedActionSession}
        startLifeActionSession={startLifeActionSession}
        pauseActionSession={pauseActionSession}
        resumeActionSession={resumeActionSession}
        completeActionSession={completeActionSession}
        completeLifeAction={completeLifeAction}
        updateLifeActionDetails={updateLifeActionDetails}
        cancelLifeActionSafely={cancelLifeActionSafely}
        rescheduleLifeActionSafely={rescheduleLifeActionSafely}
        backLabel="Назад к решению"
        spheres={spheres}
        projects={projects}
        onOpenProject={onOpenProject}
        onClose={() => setSelectedAction(null)}
        onActionChanged={handleActionChanged}
      />
    );
  }

  return (
    <DecisionDetailsPanel
      details={state.details}
      currentDate={currentDate}
      readOnly={readOnly}
      spheres={spheres}
      projects={projects}
      now={clock.now()}
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
      onClose={onClose}
      onRetry={() => {
        if (state.details.status !== 'closed') {
          void loadDecisionDetails(state.details.decisionId, false);
        }
      }}
      onOpenForm={() => dispatch({ type: 'life_action_form_opened' })}
      onCloseForm={() => dispatch({ type: 'life_action_form_closed' })}
      onTitleChange={(title) => dispatch({ type: 'life_action_title_changed', title })}
      onExpectedResultChange={(expectedResult) =>
        dispatch({ type: 'life_action_expected_result_changed', expectedResult })
      }
      onDescriptionChange={(description) =>
        dispatch({ type: 'life_action_description_changed', description })
      }
      onSubmit={(event) => void handleLifeActionSubmit(event)}
      onOpenConfirmationForm={() => dispatch({ type: 'decision_confirmation_form_opened' })}
      onCloseConfirmationForm={() => dispatch({ type: 'decision_confirmation_form_closed' })}
      onConfirmationActualResultChange={(actualResult) =>
        dispatch({ type: 'decision_actual_result_changed', actualResult })
      }
      onConfirmationSubmit={(event) => void handleDecisionConfirmation(event)}
      onOpenEditForm={() => dispatch({ type: 'decision_edit_form_opened' })}
      onCloseEditForm={() => dispatch({ type: 'decision_edit_form_closed' })}
      onEditTextChange={(field, value) =>
        dispatch({ type: 'decision_edit_text_changed', field, value })
      }
      onEditKindChange={(kind) => dispatch({ type: 'decision_edit_kind_changed', kind })}
      onEditPriorityChange={(priority) =>
        dispatch({ type: 'decision_edit_priority_changed', priority })
      }
      onEditSubmit={(event) => void handleDecisionEdit(event)}
      onOpenCancellation={() => dispatch({ type: 'decision_cancellation_opened' })}
      onCloseCancellation={() => dispatch({ type: 'decision_cancellation_closed' })}
      onConfirmCancellation={() => void handleDecisionCancellation()}
      onOpenRescheduleForm={() => dispatch({ type: 'decision_reschedule_form_opened' })}
      onCloseRescheduleForm={() => dispatch({ type: 'decision_reschedule_form_closed' })}
      onRescheduleDateChange={(newPlannedDate) =>
        dispatch({ type: 'decision_reschedule_date_changed', newPlannedDate })
      }
      onRescheduleReasonChange={(reason) =>
        dispatch({ type: 'decision_reschedule_reason_changed', reason })
      }
      onRescheduleSubmit={(event) => void handleDecisionReschedule(event)}
      onOpenLifeAction={setSelectedAction}
      onOpenProject={onOpenProject}
    />
  );
}

function formatShortRussianDate(date: DayDate): string {
  const [year, month, day] = date.toString().split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year!, month! - 1, day)));
}
