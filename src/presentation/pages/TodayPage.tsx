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
  CompleteCurrentDay,
  GetEveningReview,
  GetSpheres,
  SpheresSnapshot,
  ConfirmDecisionFromActions,
  CreateDecisionForDate,
  CreateLifeActionForDecision,
  GetActionSessionsForLifeAction,
  GetDecisionById,
  GetDecisionsForDate,
  GetLifeActionsForDate,
  GetLifeActionsForDecision,
  GetUnfinishedActionSession,
  GetOpenDayConflict,
  ResolveOpenDayConflict,
  OpenDayConflictSnapshot,
  PauseActionSession,
  ResumeActionSession,
  RescheduleDecisionSafely,
  RescheduleLifeActionSafely,
  StartCurrentDay,
  StartLifeActionSession,
  UpdateDecisionDetails,
  UpdateLifeActionDetails,
  UpdateDayResultSphere,
  CompleteCurrentDayResult,
} from '../../application';
import {
  DAY_STATUS,
  DECISION_KIND,
  DECISION_STATUS,
  DayDate,
  EntityId,
  type Day,
  type Decision,
  type DecisionKind,
  type DecisionPriority,
  type DecisionStatus,
  type ActionSession,
  type LifeAction,
  type SessionCompletionKind,
} from '../../domain';
import { DecisionDetailsPanel } from '../components/DecisionDetailsPanel';
import { LifeActionDetailsPanel } from '../components/LifeActionDetailsPanel';
import { EveningReviewPanel } from './EveningReviewPanel';
import { SphereBadge, SphereSelect } from '../components/SphereReference';
import { useSpheres } from '../components/sphereReferenceModel';
import { OpenDayRecoveryPanel } from './OpenDayRecoveryPanel';
import { CurrentActionCard } from './CurrentActionCard';
import { NextActionCard } from './NextActionCard';
import { TodayActionNavigator } from './TodayActionNavigator';
import type { TodayActionSelectionStore } from './TodayActionSelectionStore';
import { resolveCurrentActionCardState } from './CurrentActionCardState';
import { resolveNextActionCardState } from './NextActionCardState';
import {
  TODAY_SCREEN_STATE,
  resolveTodayScreenState,
  selectAvailableLifeActions,
  type TodayRecoveryStatus,
  type TodayScreenState,
} from './TodayScreenState';
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
  type DecisionEditTextField,
  type DecisionFormState,
  type TodayPageState,
} from './TodayPageState';

type OpenDayConflictLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly snapshot: OpenDayConflictSnapshot }
  | { readonly status: 'error' };

interface TodayPageProps {
  readonly currentDate: DayDate;
  readonly currentDay: Day;
  readonly onCurrentDayChange: (day: Day) => void;
  readonly selectedDate: DayDate;
  readonly onSelectedDateChange: (date: DayDate) => void;
  readonly openCreateRequested: boolean;
  readonly onOpenCreateRequestHandled: () => void;
  readonly startCurrentDay: Pick<StartCurrentDay, 'execute'>;
  readonly getEveningReview: Pick<GetEveningReview, 'execute'>;
  readonly getSpheres: Pick<GetSpheres, 'execute'>;
  readonly completeCurrentDay: Pick<CompleteCurrentDay, 'execute'>;
  readonly updateDayResultSphere: Pick<UpdateDayResultSphere, 'execute'>;
  readonly getDecisionsForDate: Pick<GetDecisionsForDate, 'execute'>;
  readonly getLifeActionsForDate: Pick<GetLifeActionsForDate, 'execute'>;
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
  readonly getOpenDayConflict: Pick<GetOpenDayConflict, 'execute'>;
  readonly resolveOpenDayConflict: Pick<ResolveOpenDayConflict, 'execute'>;
  readonly clock: Pick<Clock, 'now'>;
  readonly todayActionSelectionStore: Pick<TodayActionSelectionStore, 'load' | 'save' | 'clear'>;
}

export function TodayPage({
  currentDate,
  currentDay,
  onCurrentDayChange,
  selectedDate,
  onSelectedDateChange,
  openCreateRequested,
  onOpenCreateRequestHandled,
  startCurrentDay,
  getEveningReview,
  getSpheres,
  completeCurrentDay,
  updateDayResultSphere,
  getDecisionsForDate,
  getLifeActionsForDate,
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
  getOpenDayConflict,
  resolveOpenDayConflict,
  clock,
  todayActionSelectionStore,
}: TodayPageProps) {
  const spheres = useSpheres(getSpheres);
  const [state, dispatch] = useReducer(todayPageReducer, INITIAL_TODAY_PAGE_STATE);
  const selectedDateRef = useRef(selectedDate);
  const loadGenerationRef = useRef(0);
  const todayRecoveryGenerationRef = useRef(0);
  const openDayConflictGenerationRef = useRef(0);
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
  const daySphereMutationRef = useRef(false);
  const [currentLifeActions, setCurrentLifeActions] = useState<readonly LifeAction[]>([]);
  const [currentDaySessions, setCurrentDaySessions] = useState<readonly ActionSession[]>([]);
  const [unfinishedSession, setUnfinishedSession] = useState<ActionSession | null>(null);
  const [isCurrentActionMutating, setIsCurrentActionMutating] = useState(false);
  const [currentActionError, setCurrentActionError] = useState<string | null>(null);
  const [daySphereError, setDaySphereError] = useState<string | null>(null);
  const [isDaySphereUpdating, setIsDaySphereUpdating] = useState(false);
  const [todayRecoveryStatus, setTodayRecoveryStatus] = useState<TodayRecoveryStatus>('loading');
  const [isStartingDay, setIsStartingDay] = useState(false);
  const [startDayError, setStartDayError] = useState<string | null>(null);
  const [openDayConflictState, setOpenDayConflictState] = useState<OpenDayConflictLoadState>({
    status: 'loading',
  });
  const [selectedKeepOpenDayId, setSelectedKeepOpenDayId] = useState<string | null>(null);
  const [isResolvingOpenDays, setIsResolvingOpenDays] = useState(false);
  const [openDayRecoveryError, setOpenDayRecoveryError] = useState<string | null>(null);
  const [isEveningReviewOpen, setIsEveningReviewOpen] = useState(false);
  const [preferredLifeActionId, setPreferredLifeActionId] = useState<string | null>(() =>
    todayActionSelectionStore.load(currentDate),
  );
  const preferredLifeActionIdRef = useRef(preferredLifeActionId);

  const loadOpenDayConflict = useCallback(async () => {
    const generation = ++openDayConflictGenerationRef.current;
    setOpenDayConflictState({ status: 'loading' });
    setOpenDayRecoveryError(null);

    try {
      const snapshot = await getOpenDayConflict.execute();
      if (generation !== openDayConflictGenerationRef.current) {
        return;
      }

      setOpenDayConflictState({ status: 'ready', snapshot });
      const sessionDayId = snapshot.unfinishedSessionDayId?.toString() ?? null;
      const currentOpenDay = snapshot.openDays.find((item) => item.day.date.equals(currentDate));
      setSelectedKeepOpenDayId(sessionDayId ?? currentOpenDay?.day.id.toString() ?? null);
    } catch {
      if (generation !== openDayConflictGenerationRef.current) {
        return;
      }
      setOpenDayConflictState({ status: 'error' });
    }
  }, [currentDate, getOpenDayConflict]);

  useEffect(() => {
    void Promise.resolve().then(loadOpenDayConflict);

    return () => {
      openDayConflictGenerationRef.current += 1;
    };
  }, [loadOpenDayConflict]);

  const loadTodayRecovery = useCallback(async () => {
    const generation = ++todayRecoveryGenerationRef.current;
    setTodayRecoveryStatus('loading');

    try {
      const [lifeActions, recoveredSession] = await Promise.all([
        getLifeActionsForDate.execute(currentDate),
        getUnfinishedActionSession.execute(),
      ]);
      const sessions = (
        await Promise.all(
          lifeActions.map((lifeAction) => getActionSessionsForLifeAction.execute(lifeAction.id)),
        )
      ).flat();

      if (generation !== todayRecoveryGenerationRef.current) {
        return;
      }

      setCurrentLifeActions(lifeActions);
      setCurrentDaySessions(sessions);
      setUnfinishedSession(recoveredSession);

      const availableLifeActions = selectAvailableLifeActions(lifeActions, currentDay);
      const recoveredLifeActionId = recoveredSession?.lifeActionId.toString() ?? null;
      const storedLifeAction = availableLifeActions.find(
        (lifeAction) => lifeAction.id.toString() === preferredLifeActionIdRef.current,
      );
      const resolvedLifeActionId =
        recoveredLifeActionId ??
        storedLifeAction?.id.toString() ??
        availableLifeActions[0]?.id.toString() ??
        null;

      preferredLifeActionIdRef.current = resolvedLifeActionId;
      setPreferredLifeActionId(resolvedLifeActionId);
      if (resolvedLifeActionId === null) {
        todayActionSelectionStore.clear(currentDate);
      } else {
        todayActionSelectionStore.save(currentDate, resolvedLifeActionId);
      }
      setTodayRecoveryStatus('ready');
    } catch {
      if (generation !== todayRecoveryGenerationRef.current) {
        return;
      }

      setCurrentLifeActions([]);
      setCurrentDaySessions([]);
      setUnfinishedSession(null);
      setTodayRecoveryStatus('error');
    }
  }, [
    currentDate,
    currentDay,
    getActionSessionsForLifeAction,
    getLifeActionsForDate,
    getUnfinishedActionSession,
    todayActionSelectionStore,
  ]);

  useEffect(() => {
    void Promise.resolve().then(loadTodayRecovery);

    return () => {
      todayRecoveryGenerationRef.current += 1;
    };
  }, [loadTodayRecovery]);

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

  useEffect(() => {
    if (selectedDateRef.current.equals(selectedDate)) {
      return;
    }

    loadGenerationRef.current += 1;
    selectedDateRef.current = selectedDate;
    dispatch({ type: 'selected_date_changed' });
  }, [selectedDate]);

  useEffect(() => {
    if (!openCreateRequested) {
      return;
    }

    dispatch({ type: 'open_form' });
    onOpenCreateRequestHandled();
  }, [onOpenCreateRequestHandled, openCreateRequested]);

  function selectDate(date: DayDate, openForm = false): void {
    if (!date.equals(selectedDateRef.current)) {
      loadGenerationRef.current += 1;
      selectedDateRef.current = date;
      dispatch({ type: 'selected_date_changed' });
      onSelectedDateChange(date);
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

        const actionOverviews = await Promise.all(
          lifeActions.map(async (lifeAction) => ({
            lifeAction,
            sessions: await getActionSessionsForLifeAction.execute(lifeAction.id),
          })),
        );

        dispatch({
          type: 'details_load_succeeded',
          decisionId,
          decision: decisionResult.value,
          lifeActions,
          actionOverviews,
        });
      } catch {
        dispatch({ type: 'details_load_failed', decisionId });
      }
    },
    [getActionSessionsForLifeAction, getDecisionById, getLifeActionsForDecision],
  );

  function replaceCurrentLifeAction(lifeAction: LifeAction): void {
    setCurrentLifeActions((current) => {
      const exists = current.some((item) => item.id.equals(lifeAction.id));

      if (!exists) {
        return [...current, lifeAction];
      }

      return current.map((item) => (item.id.equals(lifeAction.id) ? lifeAction : item));
    });
  }

  function replaceCurrentDaySession(session: ActionSession): void {
    setCurrentDaySessions((current) => {
      const exists = current.some((item) => item.id.equals(session.id));

      if (!exists) {
        return [...current, session];
      }

      return current.map((item) => (item.id.equals(session.id) ? session : item));
    });
  }

  async function handleStartDay(): Promise<void> {
    if (isStartingDay || currentDay.status !== DAY_STATUS.planned) {
      return;
    }

    if (openDayConflictState.status !== 'ready') {
      setStartDayError('Сначала дождитесь проверки целостности активных дней');
      return;
    }

    if (openDayConflictState.snapshot.hasConflict) {
      setStartDayError('Сначала восстановите конфликт активных дней');
      return;
    }

    setIsStartingDay(true);
    setStartDayError(null);

    try {
      const result = await startCurrentDay.execute();

      if (!result.ok) {
        setStartDayError(startDayErrorMessage(result.error.code));
        if (result.error.code === 'day.multiple_open_detected') {
          await loadOpenDayConflict();
        }
        return;
      }

      onCurrentDayChange(result.value.day);

      if (result.value.firstLifeAction !== null) {
        replaceCurrentLifeAction(result.value.firstLifeAction);
      }
    } catch {
      setStartDayError('Не удалось начать день');
    } finally {
      setIsStartingDay(false);
    }
  }

  async function handleResolveOpenDayConflict(): Promise<void> {
    if (isResolvingOpenDays || openDayConflictState.status !== 'ready') {
      return;
    }

    const snapshot = openDayConflictState.snapshot;
    if (!snapshot.hasConflict) {
      await loadOpenDayConflict();
      return;
    }

    const keepOpenDay =
      selectedKeepOpenDayId === null
        ? null
        : (snapshot.openDays.find((item) => item.day.id.toString() === selectedKeepOpenDayId)
            ?.day ?? null);

    if (selectedKeepOpenDayId !== null && keepOpenDay === null) {
      setOpenDayRecoveryError('Выбранный день больше не найден. Проверьте состояние снова.');
      return;
    }

    setIsResolvingOpenDays(true);
    setOpenDayRecoveryError(null);

    try {
      const result = await resolveOpenDayConflict.execute({
        expectedOpenDays: snapshot.openDays.map(({ day }) => ({
          dayId: day.id,
          version: day.version,
        })),
        keepOpenDayId: keepOpenDay?.id ?? null,
      });

      if (!result.ok) {
        const message = openDayRecoveryErrorMessage(result.error.code);
        await loadOpenDayConflict();
        setOpenDayRecoveryError(message);
        return;
      }

      const updatedCurrentDay =
        result.value.completedDays.find((day) => day.id.equals(currentDay.id)) ??
        (result.value.keptOpenDay?.id.equals(currentDay.id) ? result.value.keptOpenDay : null);

      if (updatedCurrentDay !== null) {
        onCurrentDayChange(updatedCurrentDay);
      }

      setStartDayError(null);
      await Promise.all([loadOpenDayConflict(), loadTodayRecovery()]);
    } catch {
      setOpenDayRecoveryError('Не удалось восстановить активные дни. Данные не изменены.');
    } finally {
      setIsResolvingOpenDays(false);
    }
  }

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
      if (submissionDate.equals(currentDate)) {
        setStartDayError(null);
      }
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

      if (selectedDate.equals(currentDate)) {
        await loadTodayRecovery();
      }
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
      replaceCurrentLifeAction(result.lifeAction);
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
      replaceCurrentLifeAction(result.lifeAction);
      void loadTodayRecovery();
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
      replaceCurrentLifeAction(result.lifeAction);
      void loadTodayRecovery();
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
    async (lifeAction: LifeAction): Promise<boolean> => {
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
        return true;
      } catch {
        dispatch({ type: 'action_details_load_failed', lifeActionId: lifeAction.id });
        return false;
      }
    },
    [getActionSessionsForLifeAction, getUnfinishedActionSession],
  );

  async function handleOpenCurrentActionCompletion(lifeAction: LifeAction): Promise<void> {
    const loaded = await loadLifeActionDetails(lifeAction);
    if (loaded) {
      dispatch({ type: 'session_completion_form_opened' });
    }
  }

  async function handleOpenCurrentActionReschedule(lifeAction: LifeAction): Promise<void> {
    const loaded = await loadLifeActionDetails(lifeAction);
    if (loaded) {
      dispatch({ type: 'life_action_reschedule_form_opened' });
    }
  }

  async function handleOpenCurrentActionCancellation(lifeAction: LifeAction): Promise<void> {
    const loaded = await loadLifeActionDetails(lifeAction);
    if (loaded) {
      dispatch({ type: 'life_action_cancellation_opened' });
    }
  }

  async function handleStartSession(lifeAction?: LifeAction): Promise<void> {
    const targetLifeAction =
      lifeAction ??
      (state.actionDetails.status === 'ready' ? state.actionDetails.lifeAction : null);

    if (sessionMutationRef.current || targetLifeAction === null) {
      return;
    }

    sessionMutationRef.current = true;
    setIsCurrentActionMutating(true);
    setCurrentActionError(null);
    dispatch({ type: 'session_operation_started' });
    try {
      const result = await startLifeActionSession.execute({
        lifeActionId: targetLifeAction.id,
      });

      if (!result.ok) {
        const message = startSessionErrorMessage(result.error.code);
        dispatch({ type: 'session_operation_failed', message });
        setCurrentActionError(message);
        return;
      }

      dispatch({
        type: 'session_started',
        lifeAction: result.value.lifeAction,
        session: result.value.session,
      });
      replaceCurrentLifeAction(result.value.lifeAction);
      preferredLifeActionIdRef.current = result.value.lifeAction.id.toString();
      setPreferredLifeActionId(result.value.lifeAction.id.toString());
      todayActionSelectionStore.save(currentDate, result.value.lifeAction.id.toString());
      replaceCurrentDaySession(result.value.session);
      setUnfinishedSession(result.value.session);
      setTodayRecoveryStatus('ready');
    } catch {
      const message = 'Не удалось начать выполнение';
      dispatch({ type: 'session_operation_failed', message });
      setCurrentActionError(message);
    } finally {
      sessionMutationRef.current = false;
      setIsCurrentActionMutating(false);
    }
  }

  async function handlePauseSession(session: ActionSession): Promise<void> {
    if (sessionMutationRef.current) {
      return;
    }

    sessionMutationRef.current = true;
    setIsCurrentActionMutating(true);
    setCurrentActionError(null);
    dispatch({ type: 'session_operation_started' });
    try {
      const result = await pauseActionSession.execute({ sessionId: session.id });

      if (!result.ok) {
        const message = pauseSessionErrorMessage(result.error.code);
        dispatch({ type: 'session_operation_failed', message });
        setCurrentActionError(message);
        return;
      }

      dispatch({ type: 'session_updated', session: result.value });
      replaceCurrentDaySession(result.value);
      setUnfinishedSession(result.value);
      setTodayRecoveryStatus('ready');
    } catch {
      const message = 'Не удалось поставить работу на паузу';
      dispatch({ type: 'session_operation_failed', message });
      setCurrentActionError(message);
    } finally {
      sessionMutationRef.current = false;
      setIsCurrentActionMutating(false);
    }
  }

  async function handleResumeSession(session: ActionSession): Promise<void> {
    if (sessionMutationRef.current) {
      return;
    }

    sessionMutationRef.current = true;
    setIsCurrentActionMutating(true);
    setCurrentActionError(null);
    dispatch({ type: 'session_operation_started' });
    try {
      const result = await resumeActionSession.execute({ sessionId: session.id });

      if (!result.ok) {
        const message = resumeSessionErrorMessage();
        dispatch({ type: 'session_operation_failed', message });
        setCurrentActionError(message);
        return;
      }

      dispatch({ type: 'session_updated', session: result.value });
      replaceCurrentDaySession(result.value);
      setUnfinishedSession(result.value);
      setTodayRecoveryStatus('ready');
    } catch {
      const message = resumeSessionErrorMessage();
      dispatch({ type: 'session_operation_failed', message });
      setCurrentActionError(message);
    } finally {
      sessionMutationRef.current = false;
      setIsCurrentActionMutating(false);
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
          replaceCurrentDaySession(result.session);
          setUnfinishedSession(null);
          setTodayRecoveryStatus('ready');
          break;
        case 'action_failed':
          dispatch({
            type: 'session_completed_action_failed',
            session: result.session,
            message: result.message,
          });
          replaceCurrentDaySession(result.session);
          setUnfinishedSession(null);
          setTodayRecoveryStatus('ready');
          break;
        case 'action_completed':
          dispatch({
            type: 'life_action_completed',
            lifeAction: result.lifeAction,
            session: result.session,
          });
          replaceCurrentDaySession(result.session);
          replaceCurrentLifeAction(result.lifeAction);
          setUnfinishedSession(null);
          setTodayRecoveryStatus('ready');
          break;
      }

      if (result.status !== 'session_failed') {
        void loadTodayRecovery();
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
      replaceCurrentLifeAction(result.lifeAction);
      void loadTodayRecovery();
    } catch {
      dispatch({
        type: 'session_operation_failed',
        message: 'Сессия завершена, но действие не удалось завершить',
      });
    } finally {
      sessionMutationRef.current = false;
    }
  }

  function handleSelectCurrentLifeAction(lifeAction: LifeAction): void {
    if (unfinishedSession !== null || isCurrentActionMutating) {
      return;
    }

    const lifeActionId = lifeAction.id.toString();
    setCurrentActionError(null);
    preferredLifeActionIdRef.current = lifeActionId;
    setPreferredLifeActionId(lifeActionId);
    todayActionSelectionStore.save(currentDate, lifeActionId);
  }

  function handleDayCompleted(result: CompleteCurrentDayResult): void {
    const completedCurrentDay = result.day.date.equals(currentDate);

    if (completedCurrentDay) {
      onCurrentDayChange(result.day);
      setCurrentLifeActions((current) => {
        const byId = new Map(current.map((lifeAction) => [lifeAction.id.toString(), lifeAction]));
        for (const lifeAction of result.resolvedLifeActions) {
          byId.set(lifeAction.id.toString(), lifeAction);
        }
        return [...byId.values()];
      });
      setUnfinishedSession(null);
      setTodayRecoveryStatus('ready');
    }

    dispatch({ type: 'details_closed' });
    setIsEveningReviewOpen(false);
    void Promise.all([loadOpenDayConflict(), loadTodayRecovery()]);

    if (!completedCurrentDay) {
      selectDate(currentDate);
    }
  }

  async function handleDaySphereChange(sphereId: string | null): Promise<void> {
    if (daySphereMutationRef.current || currentDay.status !== DAY_STATUS.completed) return;
    daySphereMutationRef.current = true;
    setIsDaySphereUpdating(true);
    setDaySphereError(null);
    try {
      const result = await updateDayResultSphere.execute({
        dayId: currentDay.id,
        date: currentDay.date,
        expectedVersion: currentDay.version,
        sphereId: sphereId === null ? null : EntityId.create(sphereId),
      });
      if (result.ok) {
        onCurrentDayChange(result.value);
      } else {
        setDaySphereError(
          result.error.code === 'day.version_conflict'
            ? 'Результат дня изменился. Обновите данные и повторите.'
            : 'Не удалось изменить сферу результата дня.',
        );
      }
    } catch {
      setDaySphereError('Не удалось изменить сферу результата дня.');
    } finally {
      daySphereMutationRef.current = false;
      setIsDaySphereUpdating(false);
    }
  }

  const todayScreenState = resolveTodayScreenState({
    day: currentDay,
    decisionsStatus: state.decisions.status,
    decisions: state.decisions.status === 'ready' ? state.decisions.decisions : [],
    recoveryStatus: todayRecoveryStatus,
    lifeActions: currentLifeActions,
    unfinishedSession,
    isEveningControlOpen: isEveningReviewOpen,
    preferredLifeActionId,
  });

  const resolvedCurrentLifeAction =
    todayScreenState.kind === TODAY_SCREEN_STATE.dayStarted ||
    todayScreenState.kind === TODAY_SCREEN_STATE.activeSession ||
    todayScreenState.kind === TODAY_SCREEN_STATE.pausedSession
      ? todayScreenState.currentLifeAction
      : null;
  const resolvedCurrentLifeActionId = resolvedCurrentLifeAction?.id.toString() ?? null;

  useEffect(() => {
    if (currentDay.status !== DAY_STATUS.open || todayRecoveryStatus !== 'ready') {
      return;
    }

    if (todayScreenState.kind === TODAY_SCREEN_STATE.noCurrentAction) {
      todayActionSelectionStore.clear(currentDate);
      return;
    }

    if (resolvedCurrentLifeActionId !== null) {
      todayActionSelectionStore.save(currentDate, resolvedCurrentLifeActionId);
    }
  }, [
    currentDate,
    currentDay.status,
    resolvedCurrentLifeActionId,
    todayActionSelectionStore,
    todayRecoveryStatus,
    todayScreenState.kind,
  ]);

  return (
    <>
      <TodayPageView
        spheres={spheres}
        currentDate={currentDate}
        todayScreenState={todayScreenState}
        isStartingDay={isStartingDay}
        startDayError={startDayError}
        openDayConflictState={openDayConflictState}
        selectedKeepOpenDayId={selectedKeepOpenDayId}
        isResolvingOpenDays={isResolvingOpenDays}
        openDayRecoveryError={openDayRecoveryError}
        selectedDate={selectedDate}
        clock={clock}
        state={state}
        currentDaySessions={currentDaySessions}
        isCurrentActionMutating={isCurrentActionMutating}
        currentActionError={currentActionError}
        isDaySphereUpdating={isDaySphereUpdating}
        daySphereError={daySphereError}
        onDaySphereChange={(sphereId) => void handleDaySphereChange(sphereId)}
        onRetry={() => void loadDecisions(selectedDate)}
        onRetryTodayRecovery={() => void loadTodayRecovery()}
        onStartDay={() => void handleStartDay()}
        onRetryOpenDayConflict={() => void loadOpenDayConflict()}
        onSelectKeepOpenDay={setSelectedKeepOpenDayId}
        onResolveOpenDayConflict={() => void handleResolveOpenDayConflict()}
        onOpenEveningReview={() => setIsEveningReviewOpen(true)}
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
        onOpenDecisionConfirmationForm={() =>
          dispatch({ type: 'decision_confirmation_form_opened' })
        }
        onCloseDecisionConfirmationForm={() =>
          dispatch({ type: 'decision_confirmation_form_closed' })
        }
        onDecisionActualResultChange={(actualResult) =>
          dispatch({ type: 'decision_actual_result_changed', actualResult })
        }
        onDecisionConfirmationSubmit={(event) => void handleDecisionConfirmation(event)}
        onOpenDecisionEditForm={() => dispatch({ type: 'decision_edit_form_opened' })}
        onCloseDecisionEditForm={() => dispatch({ type: 'decision_edit_form_closed' })}
        onDecisionEditTextChange={(field, value) =>
          dispatch({ type: 'decision_edit_text_changed', field, value })
        }
        onDecisionEditKindChange={(kind) => dispatch({ type: 'decision_edit_kind_changed', kind })}
        onDecisionEditPriorityChange={(priority) =>
          dispatch({ type: 'decision_edit_priority_changed', priority })
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
        onDecisionRescheduleReasonChange={(reason) =>
          dispatch({ type: 'decision_reschedule_reason_changed', reason })
        }
        onDecisionRescheduleSubmit={(event) => void handleDecisionReschedule(event)}
        onOpenLifeAction={(lifeAction) => void loadLifeActionDetails(lifeAction)}
        onStartCurrentAction={(lifeAction) => void handleStartSession(lifeAction)}
        onPauseCurrentAction={(session) => void handlePauseSession(session)}
        onResumeCurrentAction={(session) => void handleResumeSession(session)}
        onCompleteCurrentActionSession={(lifeAction) =>
          void handleOpenCurrentActionCompletion(lifeAction)
        }
        onRescheduleCurrentAction={(lifeAction) =>
          void handleOpenCurrentActionReschedule(lifeAction)
        }
        onCancelCurrentAction={(lifeAction) => void handleOpenCurrentActionCancellation(lifeAction)}
        onSelectCurrentAction={handleSelectCurrentLifeAction}
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
        onLifeActionEditSphereChange={(sphereId) =>
          dispatch({ type: 'life_action_edit_sphere_changed', sphereId })
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
      {isEveningReviewOpen ? (
        <EveningReviewPanel
          getEveningReview={getEveningReview}
          getSpheres={getSpheres}
          completeCurrentDay={completeCurrentDay}
          reviewDate={selectedDate}
          onClose={() => setIsEveningReviewOpen(false)}
          onCompleted={handleDayCompleted}
        />
      ) : null}
    </>
  );
}

interface TodayPageViewProps {
  readonly spheres?: SpheresSnapshot;
  readonly currentDate: DayDate;
  readonly todayScreenState: TodayScreenState;
  readonly isStartingDay: boolean;
  readonly startDayError: string | null;
  readonly openDayConflictState: OpenDayConflictLoadState;
  readonly selectedKeepOpenDayId: string | null;
  readonly isResolvingOpenDays: boolean;
  readonly openDayRecoveryError: string | null;
  readonly selectedDate: DayDate;
  readonly clock: Pick<Clock, 'now'>;
  readonly state: TodayPageState;
  readonly currentDaySessions: readonly ActionSession[];
  readonly isCurrentActionMutating: boolean;
  readonly currentActionError: string | null;
  readonly isDaySphereUpdating?: boolean;
  readonly daySphereError?: string | null;
  readonly onDaySphereChange?: (sphereId: string | null) => void;
  readonly onRetry: () => void;
  readonly onRetryTodayRecovery: () => void;
  readonly onStartDay: () => void;
  readonly onRetryOpenDayConflict: () => void;
  readonly onSelectKeepOpenDay: (dayId: string | null) => void;
  readonly onResolveOpenDayConflict: () => void;
  readonly onOpenEveningReview: () => void;
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
  readonly onDecisionEditTextChange: (field: DecisionEditTextField, value: string) => void;
  readonly onDecisionEditKindChange: (kind: DecisionKind) => void;
  readonly onDecisionEditPriorityChange: (priority: DecisionPriority) => void;
  readonly onDecisionEditSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onOpenDecisionCancellation: () => void;
  readonly onCloseDecisionCancellation: () => void;
  readonly onConfirmDecisionCancellation: () => void;
  readonly onOpenDecisionRescheduleForm: () => void;
  readonly onCloseDecisionRescheduleForm: () => void;
  readonly onDecisionRescheduleDateChange: (newPlannedDate: string) => void;
  readonly onDecisionRescheduleReasonChange: (reason: string) => void;
  readonly onDecisionRescheduleSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onOpenLifeAction: (lifeAction: LifeAction) => void;
  readonly onStartCurrentAction: (lifeAction: LifeAction) => void;
  readonly onPauseCurrentAction: (session: ActionSession) => void;
  readonly onResumeCurrentAction: (session: ActionSession) => void;
  readonly onCompleteCurrentActionSession: (lifeAction: LifeAction) => void;
  readonly onRescheduleCurrentAction: (lifeAction: LifeAction) => void;
  readonly onCancelCurrentAction: (lifeAction: LifeAction) => void;
  readonly onSelectCurrentAction: (lifeAction: LifeAction) => void;
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
  readonly onLifeActionEditSphereChange?: (sphereId: string) => void;
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
  spheres = { active: [], archived: [] },
  currentDate,
  todayScreenState,
  isStartingDay,
  startDayError,
  openDayConflictState,
  selectedKeepOpenDayId,
  isResolvingOpenDays,
  openDayRecoveryError,
  selectedDate,
  clock,
  state,
  currentDaySessions,
  isCurrentActionMutating,
  currentActionError,
  isDaySphereUpdating = false,
  daySphereError = null,
  onDaySphereChange = () => undefined,
  onRetry,
  onRetryTodayRecovery,
  onStartDay,
  onRetryOpenDayConflict,
  onSelectKeepOpenDay,
  onResolveOpenDayConflict,
  onOpenEveningReview,
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
  onDecisionEditTextChange,
  onDecisionEditKindChange,
  onDecisionEditPriorityChange,
  onDecisionEditSubmit,
  onOpenDecisionCancellation,
  onCloseDecisionCancellation,
  onConfirmDecisionCancellation,
  onOpenDecisionRescheduleForm,
  onCloseDecisionRescheduleForm,
  onDecisionRescheduleDateChange,
  onDecisionRescheduleReasonChange,
  onDecisionRescheduleSubmit,
  onOpenLifeAction,
  onStartCurrentAction,
  onPauseCurrentAction,
  onResumeCurrentAction,
  onCompleteCurrentActionSession,
  onRescheduleCurrentAction,
  onCancelCurrentAction,
  onSelectCurrentAction,
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
  onLifeActionEditSphereChange = () => undefined,
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
  const tomorrowDate = addDays(currentDate, 1);
  const tomorrowPlanLabel = formatPlanDate(tomorrowDate);
  const singlePastOpenDay =
    openDayConflictState.status === 'ready' && !openDayConflictState.snapshot.hasConflict
      ? (openDayConflictState.snapshot.openDays.find((item) =>
          item.day.date.isBefore(currentDate),
        ) ?? null)
      : null;
  const selectedPastOpenDay =
    openDayConflictState.status === 'ready' && !openDayConflictState.snapshot.hasConflict
      ? (openDayConflictState.snapshot.openDays.find((item) =>
          item.day.date.equals(selectedDate),
        ) ?? null)
      : null;
  const startDayBlockedMessage =
    openDayConflictState.status === 'loading'
      ? 'Проверяем целостность активных дней…'
      : openDayConflictState.status === 'error'
        ? 'Не удалось проверить активные дни. Повторите проверку перед запуском.'
        : openDayConflictState.snapshot.hasConflict
          ? 'Сначала восстановите конфликт активных дней.'
          : singlePastOpenDay !== null
            ? `Сначала завершите день ${formatOpenDayDate(singlePastOpenDay.day.date)}.`
            : null;

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
          <div className="today-header-copy">
            <p className="today-brand">План дня</p>
            <h1>{selectedDateTitle}</h1>
            <p className="today-date">
              {formatSelectedDateWeekday(selectedDate)} · {formatRussianDate(selectedDate)}
            </p>
          </div>
        </header>

        {isToday(selectedDate, currentDate) ? (
          <TodayStateCard
            spheres={spheres}
            state={todayScreenState}
            isStarting={isStartingDay}
            error={startDayError}
            startBlockedMessage={startDayBlockedMessage}
            onRetryRecovery={onRetryTodayRecovery}
            onStart={onStartDay}
            decisions={state.decisions.status === 'ready' ? state.decisions.decisions : []}
            currentDaySessions={currentDaySessions}
            isCurrentActionMutating={isCurrentActionMutating}
            currentActionError={currentActionError}
            isDaySphereUpdating={isDaySphereUpdating}
            daySphereError={daySphereError}
            onDaySphereChange={onDaySphereChange}
            clock={clock}
            onOpenEveningReview={onOpenEveningReview}
            onOpenLifeAction={onOpenLifeAction}
            onStartCurrentAction={onStartCurrentAction}
            onPauseCurrentAction={onPauseCurrentAction}
            onResumeCurrentAction={onResumeCurrentAction}
            onCompleteCurrentActionSession={onCompleteCurrentActionSession}
            onRescheduleCurrentAction={onRescheduleCurrentAction}
            onCancelCurrentAction={onCancelCurrentAction}
            onSelectCurrentAction={onSelectCurrentAction}
          />
        ) : null}

        {isToday(selectedDate, currentDate) &&
        openDayConflictState.status === 'ready' &&
        openDayConflictState.snapshot.hasConflict ? (
          <OpenDayRecoveryPanel
            currentDate={currentDate}
            snapshot={openDayConflictState.snapshot}
            selectedKeepOpenDayId={selectedKeepOpenDayId}
            isResolving={isResolvingOpenDays}
            error={openDayRecoveryError}
            onSelectKeepOpenDay={onSelectKeepOpenDay}
            onResolve={onResolveOpenDayConflict}
            onRetry={onRetryOpenDayConflict}
          />
        ) : isToday(selectedDate, currentDate) && openDayConflictState.status === 'error' ? (
          <section className="open-day-recovery open-day-recovery-error" role="alert">
            <p className="section-kicker danger">Проверка целостности</p>
            <h2>Не удалось проверить активные дни</h2>
            <p>Запуск дня временно заблокирован, чтобы не создать конфликт в данных.</p>
            <button className="secondary-button" type="button" onClick={onRetryOpenDayConflict}>
              Проверить снова
            </button>
          </section>
        ) : null}

        {isToday(selectedDate, currentDate) && singlePastOpenDay !== null ? (
          <PastOpenDayRecoveryCard
            day={singlePastOpenDay.day}
            hasUnfinishedSession={singlePastOpenDay.hasUnfinishedSession}
            mode="redirect"
            onOpen={() => onDateChange(singlePastOpenDay.day.date)}
          />
        ) : pastDate && selectedPastOpenDay !== null ? (
          <PastOpenDayRecoveryCard
            day={selectedPastOpenDay.day}
            hasUnfinishedSession={selectedPastOpenDay.hasUnfinishedSession}
            mode="complete"
            onOpen={onOpenEveningReview}
          />
        ) : null}

        <div className="today-actions">
          {pastDate ? null : (
            <button className="primary-button" type="button" onClick={onOpenForm}>
              Создать решение
            </button>
          )}
          <button className="secondary-button" type="button" onClick={onPlanTomorrow}>
            Планировать {tomorrowPlanLabel}
          </button>
        </div>

        {pastDate && selectedPastOpenDay === null ? (
          <p className="past-date-note">Прошедший день доступен только для просмотра</p>
        ) : pastDate ? (
          <p className="past-date-note">
            Обычное редактирование прошлого дня заблокировано. Доступно только безопасное
            завершение.
          </p>
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
            <section className="empty-day-state" aria-labelledby="empty-day-title">
              <div className="empty-day-summary">
                <span className="empty-day-count" aria-label="Количество решений: 0">
                  0
                </span>
                <div>
                  <p className="section-kicker">Решения</p>
                  <h2 id="empty-day-title">
                    {pastDate
                      ? 'На этот день решений не было'
                      : 'На этот день решения ещё не запланированы'}
                  </h2>
                </div>
              </div>
              <div className="empty-day-actions">
                <button className="secondary-button" type="button" onClick={onOpenNextDay}>
                  Следующий день
                </button>
                <button className="secondary-button" type="button" onClick={onOpenToday}>
                  Вернуться к сегодня
                </button>
              </div>
            </section>
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
          spheres={spheres}
          details={state.details}
          currentDate={currentDate}
          readOnly={pastDate}
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
          onEditTextChange={onDecisionEditTextChange}
          onEditKindChange={onDecisionEditKindChange}
          onEditPriorityChange={onDecisionEditPriorityChange}
          onEditSubmit={onDecisionEditSubmit}
          onOpenCancellation={onOpenDecisionCancellation}
          onCloseCancellation={onCloseDecisionCancellation}
          onConfirmCancellation={onConfirmDecisionCancellation}
          onOpenRescheduleForm={onOpenDecisionRescheduleForm}
          onCloseRescheduleForm={onCloseDecisionRescheduleForm}
          onRescheduleDateChange={onDecisionRescheduleDateChange}
          onRescheduleReasonChange={onDecisionRescheduleReasonChange}
          onRescheduleSubmit={onDecisionRescheduleSubmit}
          onOpenLifeAction={onOpenLifeAction}
        />
      ) : (
        <LifeActionDetailsPanel
          spheres={spheres}
          details={state.actionDetails}
          currentDate={currentDate}
          readOnly={pastDate}
          sessionRecoveryMode={pastDate && selectedPastOpenDay !== null}
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
          onEditSphereChange={onLifeActionEditSphereChange}
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

function PastOpenDayRecoveryCard({
  day,
  hasUnfinishedSession,
  mode,
  onOpen,
}: {
  readonly day: Day;
  readonly hasUnfinishedSession: boolean;
  readonly mode: 'redirect' | 'complete';
  readonly onOpen: () => void;
}) {
  const dateLabel = formatOpenDayDate(day.date);

  return (
    <section className="past-open-day-recovery" aria-labelledby="past-open-day-recovery-title">
      <div>
        <p className="section-kicker danger">Незавершённый день</p>
        <h2 id="past-open-day-recovery-title">День {dateLabel} всё ещё открыт</h2>
        <p>
          {mode === 'redirect'
            ? 'Новый день нельзя начать, пока предыдущий рабочий цикл не завершён.'
            : 'Этот прошлый день не переводится в обычный режим редактирования. Завершите его через вечерний контроль.'}
        </p>
        {hasUnfinishedSession ? (
          <p className="past-open-day-recovery-warning">
            В этом дне есть активная или приостановленная сессия. Сначала завершите её.
          </p>
        ) : null}
      </div>
      <button className="primary-button" type="button" onClick={onOpen}>
        {mode === 'redirect' ? 'Открыть активный день' : 'Открыть вечерний контроль'}
      </button>
    </section>
  );
}

function formatOpenDayDate(date: DayDate): string {
  const [year, month, day] = date.toString().split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year!, month! - 1, day)));
}

interface TodayStateCardProps {
  readonly spheres: SpheresSnapshot;
  readonly state: TodayScreenState;
  readonly decisions: readonly Decision[];
  readonly currentDaySessions: readonly ActionSession[];
  readonly isCurrentActionMutating: boolean;
  readonly currentActionError: string | null;
  readonly isDaySphereUpdating: boolean;
  readonly daySphereError: string | null;
  readonly onDaySphereChange: (sphereId: string | null) => void;
  readonly clock: Pick<Clock, 'now'>;
  readonly isStarting: boolean;
  readonly error: string | null;
  readonly startBlockedMessage: string | null;
  readonly onRetryRecovery: () => void;
  readonly onStart: () => void;
  readonly onOpenEveningReview: () => void;
  readonly onOpenLifeAction: (lifeAction: LifeAction) => void;
  readonly onStartCurrentAction: (lifeAction: LifeAction) => void;
  readonly onPauseCurrentAction: (session: ActionSession) => void;
  readonly onResumeCurrentAction: (session: ActionSession) => void;
  readonly onCompleteCurrentActionSession: (lifeAction: LifeAction) => void;
  readonly onRescheduleCurrentAction: (lifeAction: LifeAction) => void;
  readonly onCancelCurrentAction: (lifeAction: LifeAction) => void;
  readonly onSelectCurrentAction: (lifeAction: LifeAction) => void;
}

function TodayStateCard({
  spheres,
  state,
  decisions,
  currentDaySessions,
  isCurrentActionMutating,
  currentActionError,
  isDaySphereUpdating,
  daySphereError,
  onDaySphereChange,
  clock,
  isStarting,
  error,
  startBlockedMessage,
  onRetryRecovery,
  onStart,
  onOpenEveningReview,
  onOpenLifeAction,
  onStartCurrentAction,
  onPauseCurrentAction,
  onResumeCurrentAction,
  onCompleteCurrentActionSession,
  onRescheduleCurrentAction,
  onCancelCurrentAction,
  onSelectCurrentAction,
}: TodayStateCardProps) {
  switch (state.kind) {
    case TODAY_SCREEN_STATE.loading:
      return (
        <section className="day-start-card today-state-card" aria-labelledby="day-state-title">
          <div className="day-start-header">
            <div>
              <p className="section-kicker">Восстановление</p>
              <h2 id="day-state-title">Восстанавливаем состояние дня…</h2>
              <p>Проверяем решения, действия и незавершённую рабочую сессию.</p>
            </div>
            <span className="day-start-status">Загрузка</span>
          </div>
        </section>
      );

    case TODAY_SCREEN_STATE.recoveryError:
      return (
        <section
          className="day-start-card today-state-card today-state-card-error"
          aria-labelledby="day-state-title"
        >
          <div className="day-start-header">
            <div>
              <p className="section-kicker danger">Требуется внимание</p>
              <h2 id="day-state-title">Не удалось восстановить состояние дня</h2>
              <p>{state.message}</p>
            </div>
            <span className="day-start-status day-start-status-error">Ошибка</span>
          </div>
          <p className="today-state-recovery-note">
            Данные не изменены. Повторите чтение перед продолжением работы.
          </p>
          <button className="secondary-button" type="button" onClick={onRetryRecovery}>
            Повторить восстановление
          </button>
        </section>
      );

    case TODAY_SCREEN_STATE.dayCompleted:
      return (
        <section
          className="day-start-card day-start-card-completed today-state-card"
          aria-labelledby="day-state-title"
        >
          <div className="day-start-header">
            <div>
              <p className="section-kicker green">Цикл закрыт</p>
              <h2 id="day-state-title">День завершён</h2>
              <p>Итог сохранён. Повторное завершение и запуск недоступны.</p>
            </div>
            <span className="day-start-status day-start-status-open">Завершён</span>
          </div>
          {state.day.summary === null ? null : (
            <blockquote className="day-completed-summary">{state.day.summary}</blockquote>
          )}
          <div className="day-result-sphere">
            <SphereBadge sphereId={state.day.sphereId?.toString() ?? null} snapshot={spheres} />
            <label>
              Сфера результата
              <SphereSelect
                value={state.day.sphereId?.toString() ?? null}
                snapshot={spheres}
                disabled={isDaySphereUpdating}
                onChange={onDaySphereChange}
              />
            </label>
            {daySphereError === null ? null : <p className="form-error">{daySphereError}</p>}
          </div>
        </section>
      );

    case TODAY_SCREEN_STATE.dayNotPlanned:
      return (
        <section
          className="day-start-card day-start-card-unplanned today-state-card"
          aria-labelledby="day-state-title"
        >
          <div className="day-start-header">
            <div>
              <p className="section-kicker">Подготовка</p>
              <h2 id="day-state-title">День не запланирован</h2>
              <p>Добавьте хотя бы одно главное решение, чтобы определить направление дня.</p>
            </div>
            <span className="day-start-status day-start-status-neutral">Нет плана</span>
          </div>
          <div className="day-start-main-count">
            <span>Главных решений</span>
            <strong>0 из 3</strong>
          </div>
          <p className="day-start-guidance">
            После подготовки главного решения появится доступная команда «Начать день».
          </p>
          {error === null ? null : (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button" type="button" disabled>
            Начать день
          </button>
        </section>
      );

    case TODAY_SCREEN_STATE.dayPlanned:
      return (
        <section
          className="day-start-card day-start-card-planned today-state-card"
          aria-labelledby="day-state-title"
        >
          <div className="day-start-header">
            <div>
              <p className="section-kicker gold">План готов</p>
              <h2 id="day-state-title">День запланирован</h2>
              <p>Проверьте главные решения и зафиксируйте начало рабочего цикла.</p>
            </div>
            <span className="day-start-status">Запланирован</span>
          </div>
          <div className="day-start-main-count">
            <span>Главных решений</span>
            <strong>{state.mainDecisionCount} из 3</strong>
          </div>
          {error === null ? null : (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {error !== null || startBlockedMessage === null ? null : (
            <p className="today-state-recovery-note">{startBlockedMessage}</p>
          )}
          <button
            className="primary-button"
            type="button"
            disabled={isStarting || startBlockedMessage !== null}
            onClick={onStart}
          >
            {isStarting ? 'Начинаем…' : 'Начать день'}
          </button>
        </section>
      );

    case TODAY_SCREEN_STATE.eveningControl:
      return (
        <section
          className="day-start-card today-state-card today-state-card-evening"
          aria-labelledby="day-state-title"
        >
          <div className="day-start-header">
            <div>
              <p className="section-kicker gold">Шаг завершения</p>
              <h2 id="day-state-title">Вечерний контроль</h2>
              <p>Проверка дня открыта. Обработайте остатки, итог и решения на завтра.</p>
            </div>
            <span className="day-start-status">Открыт</span>
          </div>
        </section>
      );

    case TODAY_SCREEN_STATE.activeSession:
      return (
        <OpenDayStateCard
          title="Рабочая сессия идёт"
          description={`Начата в ${formatTime(state.session.startedAt)}. Таймер восстановлен из сохранённого времени.`}
          statusLabel="Сессия идёт"
          statusClassName="day-start-status-open"
          lifeAction={state.currentLifeAction}
          nextLifeAction={state.nextLifeAction}
          availableLifeActions={state.availableLifeActions}
          currentLifeActionIndex={state.currentLifeActionIndex}
          unfinishedSession={state.session}
          decisions={decisions}
          currentDaySessions={currentDaySessions}
          isCurrentActionMutating={isCurrentActionMutating}
          currentActionError={currentActionError}
          clock={clock}
          onOpenLifeAction={onOpenLifeAction}
          onStartCurrentAction={onStartCurrentAction}
          onPauseCurrentAction={onPauseCurrentAction}
          onResumeCurrentAction={onResumeCurrentAction}
          onCompleteCurrentActionSession={onCompleteCurrentActionSession}
          onRescheduleCurrentAction={onRescheduleCurrentAction}
          onCancelCurrentAction={onCancelCurrentAction}
          onSelectCurrentAction={onSelectCurrentAction}
          onOpenEveningReview={onOpenEveningReview}
        />
      );

    case TODAY_SCREEN_STATE.pausedSession:
      return (
        <OpenDayStateCard
          title="Рабочая сессия на паузе"
          description="Сессия сохранена и ожидает продолжения или завершения."
          statusLabel="Пауза"
          statusClassName="day-start-status-paused"
          lifeAction={state.currentLifeAction}
          nextLifeAction={state.nextLifeAction}
          availableLifeActions={state.availableLifeActions}
          currentLifeActionIndex={state.currentLifeActionIndex}
          unfinishedSession={state.session}
          decisions={decisions}
          currentDaySessions={currentDaySessions}
          isCurrentActionMutating={isCurrentActionMutating}
          currentActionError={currentActionError}
          clock={clock}
          onOpenLifeAction={onOpenLifeAction}
          onStartCurrentAction={onStartCurrentAction}
          onPauseCurrentAction={onPauseCurrentAction}
          onResumeCurrentAction={onResumeCurrentAction}
          onCompleteCurrentActionSession={onCompleteCurrentActionSession}
          onRescheduleCurrentAction={onRescheduleCurrentAction}
          onCancelCurrentAction={onCancelCurrentAction}
          onSelectCurrentAction={onSelectCurrentAction}
          onOpenEveningReview={onOpenEveningReview}
        />
      );

    case TODAY_SCREEN_STATE.noCurrentAction:
      return (
        <section
          className="day-start-card day-start-card-open today-state-card"
          aria-labelledby="day-state-title"
        >
          <div className="day-start-header">
            <div>
              <p className="section-kicker green">День начат</p>
              <h2 id="day-state-title">Нет текущего действия</h2>
              <p>Создайте готовое действие внутри решения или завершите вечерний контроль.</p>
            </div>
            <span className="day-start-status day-start-status-neutral">Нет действия</span>
          </div>
          <p className="day-current-action-empty">
            Главный экран не подменяет отсутствие действия случайной карточкой.
          </p>
          <EveningControlEntry onOpen={onOpenEveningReview} />
        </section>
      );

    case TODAY_SCREEN_STATE.dayStarted:
      return (
        <OpenDayStateCard
          title="День начат"
          description={
            state.day.openedAt === null
              ? 'Состояние начала синхронизировано.'
              : `Начало в ${formatTime(state.day.openedAt)}`
          }
          statusLabel="Идёт"
          statusClassName="day-start-status-open"
          lifeAction={state.currentLifeAction}
          nextLifeAction={state.nextLifeAction}
          availableLifeActions={state.availableLifeActions}
          currentLifeActionIndex={state.currentLifeActionIndex}
          unfinishedSession={null}
          decisions={decisions}
          currentDaySessions={currentDaySessions}
          isCurrentActionMutating={isCurrentActionMutating}
          currentActionError={currentActionError}
          clock={clock}
          onOpenLifeAction={onOpenLifeAction}
          onStartCurrentAction={onStartCurrentAction}
          onPauseCurrentAction={onPauseCurrentAction}
          onResumeCurrentAction={onResumeCurrentAction}
          onCompleteCurrentActionSession={onCompleteCurrentActionSession}
          onRescheduleCurrentAction={onRescheduleCurrentAction}
          onCancelCurrentAction={onCancelCurrentAction}
          onSelectCurrentAction={onSelectCurrentAction}
          onOpenEveningReview={onOpenEveningReview}
        />
      );
  }
}

interface OpenDayStateCardProps {
  readonly title: string;
  readonly description: string;
  readonly statusLabel: string;
  readonly statusClassName: string;
  readonly lifeAction: LifeAction;
  readonly nextLifeAction: LifeAction | null;
  readonly availableLifeActions: readonly LifeAction[];
  readonly currentLifeActionIndex: number;
  readonly unfinishedSession: ActionSession | null;
  readonly decisions: readonly Decision[];
  readonly currentDaySessions: readonly ActionSession[];
  readonly isCurrentActionMutating: boolean;
  readonly currentActionError: string | null;
  readonly clock: Pick<Clock, 'now'>;
  readonly onOpenLifeAction: (lifeAction: LifeAction) => void;
  readonly onStartCurrentAction: (lifeAction: LifeAction) => void;
  readonly onPauseCurrentAction: (session: ActionSession) => void;
  readonly onResumeCurrentAction: (session: ActionSession) => void;
  readonly onCompleteCurrentActionSession: (lifeAction: LifeAction) => void;
  readonly onRescheduleCurrentAction: (lifeAction: LifeAction) => void;
  readonly onCancelCurrentAction: (lifeAction: LifeAction) => void;
  readonly onSelectCurrentAction: (lifeAction: LifeAction) => void;
  readonly onOpenEveningReview: () => void;
}

function OpenDayStateCard({
  title,
  description,
  statusLabel,
  statusClassName,
  lifeAction,
  nextLifeAction,
  availableLifeActions,
  currentLifeActionIndex,
  unfinishedSession,
  decisions,
  currentDaySessions,
  isCurrentActionMutating,
  currentActionError,
  clock,
  onOpenLifeAction,
  onStartCurrentAction,
  onPauseCurrentAction,
  onResumeCurrentAction,
  onCompleteCurrentActionSession,
  onRescheduleCurrentAction,
  onCancelCurrentAction,
  onSelectCurrentAction,
  onOpenEveningReview,
}: OpenDayStateCardProps) {
  const cardState = resolveCurrentActionCardState({
    lifeAction,
    decisions,
    sessions: currentDaySessions,
    unfinishedSession,
  });
  const nextCardState =
    nextLifeAction === null
      ? null
      : resolveNextActionCardState({ lifeAction: nextLifeAction, decisions });

  return (
    <section
      className="day-start-card day-start-card-open today-state-card"
      aria-labelledby="day-state-title"
    >
      <div className="day-start-header">
        <div>
          <p className="section-kicker green">Рабочий цикл</p>
          <h2 id="day-state-title">{title}</h2>
          <p>{description}</p>
        </div>
        <span className={`day-start-status ${statusClassName}`}>{statusLabel}</span>
      </div>
      <TodayActionNavigator
        lifeActions={availableLifeActions}
        currentLifeActionIndex={currentLifeActionIndex}
        isLockedBySession={unfinishedSession !== null}
        isMutating={isCurrentActionMutating}
        onSelect={onSelectCurrentAction}
      />
      <CurrentActionCard
        state={cardState}
        clock={clock}
        isMutating={isCurrentActionMutating}
        error={currentActionError}
        onStart={onStartCurrentAction}
        onPause={onPauseCurrentAction}
        onResume={onResumeCurrentAction}
        onCompleteSession={onCompleteCurrentActionSession}
        onOpen={onOpenLifeAction}
        onReschedule={onRescheduleCurrentAction}
        onCancel={onCancelCurrentAction}
      />
      <NextActionCard state={nextCardState} />
      <EveningControlEntry onOpen={onOpenEveningReview} />
    </section>
  );
}

function EveningControlEntry({ onOpen }: { readonly onOpen: () => void }) {
  return (
    <div className="day-evening-control">
      <div>
        <strong>День подходит к завершению?</strong>
        <p>Проверьте остатки, запишите итог и подготовьте завтра.</p>
      </div>
      <button className="secondary-button" type="button" onClick={onOpen}>
        Вечерний контроль
      </button>
    </div>
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

function openDayRecoveryErrorMessage(code: string): string {
  switch (code) {
    case 'day.recovery_conflict':
      return 'Активные дни изменились в другой вкладке. Проверьте состояние снова.';
    case 'day.recovery_session_blocked':
      return 'Нельзя закрыть день с активной или приостановленной сессией.';
    case 'day.recovery_orphaned_session':
      return 'Незавершённая сессия не связана с найденными активными днями. Сначала восстановите сессию.';
    case 'day.recovery_not_required':
      return 'Конфликт уже устранён. Обновите состояние.';
    case 'day.recovery_invalid_keep_day':
      return 'Выбранный активный день изменился. Проверьте состояние снова.';
    default:
      return 'Не удалось восстановить активные дни. Данные не изменены.';
  }
}

function startDayErrorMessage(code: string): string {
  switch (code) {
    case 'day.main_decision_required':
      return 'Чтобы начать день, добавьте хотя бы одно главное решение';
    case 'day.another_open_exists':
      return 'Сначала завершите ранее начатый день';
    case 'day.multiple_open_detected':
      return 'Обнаружено несколько активных дней. Требуется восстановление данных';
    case 'day.cannot_start':
    case 'day.already_completed':
      return 'Этот день уже нельзя начать';
    default:
      return 'Не удалось начать день';
  }
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
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

function formatPlanDate(date: DayDate): string {
  const [year, month, day] = date.toString().split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
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
