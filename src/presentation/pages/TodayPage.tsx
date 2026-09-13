import { VoiceField } from '../voice-input/VoiceField';
import { VoiceTextInput } from '../voice-input/VoiceTextInput';
import { VoiceTextArea } from '../voice-input/VoiceTextArea';
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
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
  GetProjects,
  SpheresSnapshot,
  ConfirmDecisionFromActions,
  CreateDecisionForDate,
  CreateLifeActionForDecision,
  DeleteDecisionSafely,
  GetActionSessionsForLifeAction,
  GetDecisionById,
  GetDecisionsForDate,
  GetLifeActionsForDate,
  GetLifeActionsForDecision,
  GetUnfinishedActionSession,
  GetOpenDayConflict,
  GetRoutineBlocksForDate,
  ResolveOpenDayConflict,
  ResolveOpenLoop,
  ReflectionApplicationService,
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
  TomorrowPlanService,
  PreparationService,
  RelaxationApplicationService,
  SleepCheckApplicationService,
  EveningCycleApplicationService,
} from '../../application';
import {
  ACTION_SESSION_STATUS,
  DAY_STATUS,
  DECISION_KIND,
  DECISION_STATUS,
  LIFE_ACTION_STATUS,
  ROUTINE_BLOCK_ASSIGNMENT,
  SESSION_COMPLETION_KIND,
  TOMORROW_PLAN_STATUS,
  DayDate,
  EntityId,
  type Day,
  type Decision,
  type DecisionKind,
  type DecisionPriority,
  type DecisionStatus,
  type ActionSession,
  type LifeAction,
  type Project,
  type EffectiveRoutineOccurrence,
  type SessionCompletionKind,
} from '../../domain';
import { DecisionDetailsPanel } from '../components/DecisionDetailsPanel';
import type { DecisionWalkIntegration } from '../decision/DecisionWalkNavigation';
import { LifeActionDetailsPanel } from '../components/LifeActionDetailsPanel';
import { EveningReviewPanel } from './EveningReviewPanel';
import { SphereBadge, SphereSelect } from '../components/SphereReference';
import { useSpheres } from '../components/sphereReferenceModel';
import { OpenDayRecoveryPanel } from './OpenDayRecoveryPanel';
import { CurrentActionCard } from './CurrentActionCard';
import { TomorrowPlanningCenter, type TomorrowPlanningIntent } from './TomorrowPlanningCenter';
import { TodayActionNavigator } from './TodayActionNavigator';
import type { TodayActionSelectionStore } from './TodayActionSelectionStore';
import { resolveCurrentActionCardState } from './CurrentActionCardState';
import {
  TODAY_SCREEN_STATE,
  resolveTodayScreenState,
  selectAvailableLifeActions,
  type TodayDecisionsStatus,
  type TodayRecoveryStatus,
  type TodayScreenState,
} from './TodayScreenState';
import {
  addDays,
  formatSelectedDateTitle,
  formatSelectedDateWeekday,
  isPastDate,
  isToday,
  isTomorrow,
  isYesterday,
} from '../date/selectedDate';
import {
  completeSessionWorkflow,
  cancelLifeActionResult,
  cancelDecisionResult,
  confirmDecisionResult,
  createDecisionAndReload,
  createLifeActionAndReload,
  INITIAL_TODAY_PAGE_STATE,
  loadSelectedDateDecisions,
  loadTomorrowPlanSummaryData,
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
import { AppIcon, type AppIconName } from '../components/AppIcon';
import { formatDuration, scheduleSessionTimer } from '../session/sessionTimer';
import {
  findProject,
  findProjectForLifeAction,
  useProjects,
} from '../management/projectReferenceModel';

type OpenDayConflictLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly snapshot: OpenDayConflictSnapshot }
  | { readonly status: 'error' };

type TomorrowPlanSummaryState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly prepared: boolean;
      readonly mainDecisionCount: number;
    }
  | { readonly status: 'error' };

const EMPTY_TOMORROW_PLAN_SUMMARY: TomorrowPlanSummaryState = {
  status: 'ready',
  prepared: false,
  mainDecisionCount: 0,
};

type TodayRoutineLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly occurrences: readonly EffectiveRoutineOccurrence[] }
  | { readonly status: 'error' };

const TODAY_DESKTOP_MEDIA_QUERY = '(min-width: 75rem)';

function subscribeToTodayDesktopLayout(onStoreChange: () => void): () => void {
  const mediaQuery = window.matchMedia(TODAY_DESKTOP_MEDIA_QUERY);
  mediaQuery.addEventListener('change', onStoreChange);
  return () => mediaQuery.removeEventListener('change', onStoreChange);
}

function getTodayDesktopLayoutSnapshot(): boolean {
  return window.matchMedia(TODAY_DESKTOP_MEDIA_QUERY).matches;
}

function useTodayDesktopLayout(): boolean {
  return useSyncExternalStore(
    subscribeToTodayDesktopLayout,
    getTodayDesktopLayoutSnapshot,
    () => false,
  );
}

interface TodayPageProps {
  readonly decisionWalk?: DecisionWalkIntegration | undefined;
  readonly currentDate: DayDate;
  readonly currentDay: Day;
  readonly onCurrentDayChange: (day: Day) => void;
  readonly selectedDate: DayDate;
  readonly onSelectedDateChange: (date: DayDate) => void;
  readonly startupEveningDate?: DayDate | null;
  readonly openCreateRequested: boolean;
  readonly onOpenCreateRequestHandled: () => void;
  readonly startCurrentDay: Pick<StartCurrentDay, 'execute'>;
  readonly getEveningReview: Pick<GetEveningReview, 'execute'>;
  readonly getSpheres: Pick<GetSpheres, 'execute'>;
  readonly getProjects?: Pick<GetProjects, 'execute'>;
  readonly completeCurrentDay: Pick<CompleteCurrentDay, 'execute'>;
  readonly eveningCycle?: Pick<
    EveningCycleApplicationService,
    'start' | 'startShort' | 'selectMode' | 'skipPreparation'
  >;
  readonly resolveOpenLoop?: Pick<ResolveOpenLoop, 'execute'>;
  readonly reflection?: Pick<
    ReflectionApplicationService,
    'getSession' | 'answer' | 'skip' | 'createCorrection'
  >;
  readonly tomorrowPlan?: Pick<
    TomorrowPlanService,
    | 'getByTargetDate'
    | 'getOrCreate'
    | 'setVector'
    | 'assignPrimaryDecision'
    | 'createPrimaryDecision'
    | 'setOutcomes'
    | 'setFirstAttentionItem'
    | 'assignFirstAction'
    | 'createFirstAction'
    | 'setSupportingDecisions'
    | 'createSupportingDecision'
    | 'complete'
  >;
  readonly preparation?: Pick<
    PreparationService,
    'getOrGenerate' | 'configureRequiredCore' | 'completeItem' | 'skipItem' | 'continueToRelaxation'
  >;
  readonly relaxation?: Pick<
    RelaxationApplicationService,
    | 'getOrInitialize'
    | 'getStored'
    | 'choosePractice'
    | 'setPracticeDuration'
    | 'completeDrink'
    | 'completeHygiene'
    | 'startPracticeTimer'
    | 'completePractice'
    | 'startScreenFree'
    | 'shortenScreenFree'
    | 'skipScreenFree'
    | 'complete'
  >;
  readonly sleepCheck?: SleepCheckApplicationService;
  readonly updateDayResultSphere: Pick<UpdateDayResultSphere, 'execute'>;
  readonly getDecisionsForDate: Pick<GetDecisionsForDate, 'execute'>;
  readonly getLifeActionsForDate: Pick<GetLifeActionsForDate, 'execute'>;
  readonly createDecisionForDate: Pick<CreateDecisionForDate, 'execute'>;
  readonly deleteDecisionSafely: Pick<DeleteDecisionSafely, 'execute'>;
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
  readonly getRoutineBlocksForDate: Pick<GetRoutineBlocksForDate, 'execute'>;
  readonly resolveOpenDayConflict: Pick<ResolveOpenDayConflict, 'execute'>;
  readonly onOpenRoutine: () => void;
  readonly onOpenActions: () => void;
  readonly onOpenProject?: (projectId: string) => void;
  readonly clock: Pick<Clock, 'now'>;
  readonly todayActionSelectionStore: Pick<TodayActionSelectionStore, 'load' | 'save' | 'clear'>;
}

export function TodayPage({
  decisionWalk,
  currentDate,
  currentDay,
  onCurrentDayChange,
  selectedDate,
  onSelectedDateChange,
  startupEveningDate = null,
  openCreateRequested,
  onOpenCreateRequestHandled,
  startCurrentDay,
  getEveningReview,
  getSpheres,
  getProjects,
  completeCurrentDay,
  eveningCycle,
  resolveOpenLoop,
  reflection,
  tomorrowPlan,
  preparation,
  relaxation,
  sleepCheck,
  updateDayResultSphere,
  getDecisionsForDate,
  getLifeActionsForDate,
  createDecisionForDate,
  deleteDecisionSafely,
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
  getRoutineBlocksForDate,
  resolveOpenDayConflict,
  onOpenRoutine,
  onOpenActions,
  onOpenProject = () => undefined,
  clock,
  todayActionSelectionStore,
}: TodayPageProps) {
  const useDesktopDashboard = useTodayDesktopLayout();
  const spheres = useSpheres(getSpheres);
  const projects = useProjects(getProjects);
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
  const [routineState, setRoutineState] = useState<TodayRoutineLoadState>({ status: 'loading' });
  const [tomorrowPlanSummaryResult, setTomorrowPlanSummaryResult] = useState<{
    readonly requestKey: string;
    readonly summary: TomorrowPlanSummaryState;
  } | null>(null);
  const [tomorrowPlanSummaryRefresh, setTomorrowPlanSummaryRefresh] = useState(0);
  const [tomorrowPlanningIntent, setTomorrowPlanningIntent] =
    useState<TomorrowPlanningIntent>('plan');
  const [isClosedTimelineOpen, setIsClosedTimelineOpen] = useState(false);
  const [selectedKeepOpenDayId, setSelectedKeepOpenDayId] = useState<string | null>(null);
  const [isResolvingOpenDays, setIsResolvingOpenDays] = useState(false);
  const [openDayRecoveryError, setOpenDayRecoveryError] = useState<string | null>(null);
  const [eveningReviewDate, setEveningReviewDate] = useState<DayDate | null>(null);
  const isEveningReviewOpen = eveningReviewDate !== null;
  const openedStartupEveningDateRef = useRef<string | null>(null);
  const [preferredLifeActionId, setPreferredLifeActionId] = useState<string | null>(() =>
    todayActionSelectionStore.load(currentDate),
  );
  const preferredLifeActionIdRef = useRef(preferredLifeActionId);

  useEffect(() => {
    if (startupEveningDate === null) return;
    const dateKey = startupEveningDate.toString();
    if (openedStartupEveningDateRef.current === dateKey) return;
    openedStartupEveningDateRef.current = dateKey;
    setEveningReviewDate(startupEveningDate);
  }, [startupEveningDate]);

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

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) {
        return;
      }

      setRoutineState({ status: 'loading' });
      try {
        const occurrences = await getRoutineBlocksForDate.execute(selectedDate);
        if (active) {
          setRoutineState({ status: 'ready', occurrences });
        }
      } catch {
        if (active) {
          setRoutineState({ status: 'error' });
        }
      }
    });

    return () => {
      active = false;
    };
  }, [getRoutineBlocksForDate, selectedDate]);

  useEffect(() => {
    let active = true;
    if (currentDay.status !== DAY_STATUS.completed) {
      return () => {
        active = false;
      };
    }

    const requestKey = `${currentDate.toString()}:${tomorrowPlanSummaryRefresh}`;
    const targetDate = addDays(currentDate, 1);
    void loadTomorrowPlanSummaryData({
      targetDate,
      getDecisionsForDate,
      getPlanPrepared: async (date) => {
        if (tomorrowPlan === undefined) return false;
        const snapshot = await tomorrowPlan.getByTargetDate(date);
        return snapshot?.plan.status === TOMORROW_PLAN_STATUS.completed;
      },
    })
      .then((summary) => {
        if (active) {
          setTomorrowPlanSummaryResult({
            requestKey,
            summary: { status: 'ready', ...summary },
          });
        }
      })
      .catch(() => {
        if (active) {
          setTomorrowPlanSummaryResult({ requestKey, summary: { status: 'error' } });
        }
      });

    return () => {
      active = false;
    };
  }, [
    currentDate,
    currentDay.status,
    getDecisionsForDate,
    tomorrowPlan,
    tomorrowPlanSummaryRefresh,
  ]);

  const tomorrowPlanSummaryRequestKey = `${currentDate.toString()}:${tomorrowPlanSummaryRefresh}`;
  const tomorrowPlanSummary: TomorrowPlanSummaryState =
    currentDay.status !== DAY_STATUS.completed
      ? EMPTY_TOMORROW_PLAN_SUMMARY
      : tomorrowPlanSummaryResult?.requestKey === tomorrowPlanSummaryRequestKey
        ? tomorrowPlanSummaryResult.summary
        : { status: 'loading' };

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

  function selectDate(date: DayDate, tomorrowIntent: TomorrowPlanningIntent = 'plan'): void {
    setTomorrowPlanningIntent(tomorrowIntent);
    setIsClosedTimelineOpen(false);
    if (!date.equals(selectedDateRef.current)) {
      loadGenerationRef.current += 1;
      selectedDateRef.current = date;
      dispatch({ type: 'selected_date_changed' });
      onSelectedDateChange(date);
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

  if (isTomorrow(selectedDate, currentDate) && state.decisions.status === 'ready') {
    return (
      <TomorrowPlanningCenter
        currentDate={currentDate}
        plannedDate={selectedDate}
        decisions={state.decisions.decisions}
        spheres={spheres}
        projects={projects}
        createDecisionForDate={createDecisionForDate}
        updateDecisionDetails={updateDecisionDetails}
        deleteDecisionSafely={deleteDecisionSafely}
        onDecisionsChange={(decisions) => dispatch({ type: 'load_succeeded', decisions })}
        onBack={() => selectDate(currentDate)}
        initialIntent={tomorrowPlanningIntent}
        {...(tomorrowPlan === undefined ? {} : { tomorrowPlan })}
      />
    );
  }

  return (
    <>
      <TodayPageView
        spheres={spheres}
        projects={projects}
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
        todayRecoveryStatus={todayRecoveryStatus}
        currentLifeActions={currentLifeActions}
        currentDaySessions={currentDaySessions}
        routineState={routineState}
        tomorrowPlanSummary={tomorrowPlanSummary}
        onRetryTomorrowPlanSummary={() => setTomorrowPlanSummaryRefresh((current) => current + 1)}
        closedTimelineOpen={isClosedTimelineOpen}
        onClosedTimelineOpenChange={setIsClosedTimelineOpen}
        useDesktopDashboard={useDesktopDashboard}
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
        onOpenEveningReview={() => setEveningReviewDate(selectedDate)}
        onOpenPreviousDay={() => selectDate(addDays(selectedDateRef.current, -1))}
        onOpenNextDay={() => selectDate(addDays(selectedDateRef.current, 1))}
        onOpenToday={() => selectDate(currentDate)}
        onDateChange={(date) => selectDate(date)}
        onPlanTomorrow={() => selectDate(addDays(currentDate, 1))}
        onAddTomorrowAction={() => selectDate(addDays(currentDate, 1), 'first-action')}
        onOpenRoutine={onOpenRoutine}
        onOpenActions={onOpenActions}
        onOpenProject={onOpenProject}
        decisionWalk={decisionWalk}
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
          {...(eveningCycle === undefined ? {} : { eveningCycle })}
          {...(resolveOpenLoop === undefined ? {} : { resolveOpenLoop })}
          {...(reflection === undefined ? {} : { reflection })}
          {...(tomorrowPlan === undefined ? {} : { tomorrowPlan })}
          {...(preparation === undefined ? {} : { preparation })}
          {...(relaxation === undefined ? {} : { relaxation })}
          {...(sleepCheck === undefined ? {} : { sleepCheck })}
          reviewDate={eveningReviewDate}
          onClose={() => setEveningReviewDate(null)}
          onCompleted={handleDayCompleted}
        />
      ) : null}
    </>
  );
}

interface TodayPageViewProps {
  readonly spheres?: SpheresSnapshot;
  readonly projects?: readonly Project[];
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
  readonly todayRecoveryStatus: TodayRecoveryStatus;
  readonly currentLifeActions: readonly LifeAction[];
  readonly currentDaySessions: readonly ActionSession[];
  readonly routineState?: TodayRoutineLoadState;
  readonly tomorrowPlanSummary?: TomorrowPlanSummaryState;
  readonly onRetryTomorrowPlanSummary?: () => void;
  readonly closedTimelineOpen?: boolean;
  readonly onClosedTimelineOpenChange?: (open: boolean) => void;
  readonly useDesktopDashboard?: boolean;
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
  readonly onAddTomorrowAction?: () => void;
  readonly decisionWalk?: DecisionWalkIntegration | undefined;
  readonly onOpenRoutine?: () => void;
  readonly onOpenActions?: () => void;
  readonly onOpenProject?: (projectId: string) => void;
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
  projects = [],
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
  todayRecoveryStatus,
  currentLifeActions,
  currentDaySessions,
  routineState = { status: 'ready', occurrences: [] },
  tomorrowPlanSummary = EMPTY_TOMORROW_PLAN_SUMMARY,
  onRetryTomorrowPlanSummary = () => undefined,
  closedTimelineOpen = false,
  onClosedTimelineOpenChange = () => undefined,
  useDesktopDashboard = false,
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
  onAddTomorrowAction = onPlanTomorrow,
  decisionWalk,
  onOpenRoutine = () => undefined,
  onOpenActions = () => undefined,
  onOpenProject = () => undefined,
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
  const hasRelativeDateTitle =
    isToday(selectedDate, currentDate) ||
    isTomorrow(selectedDate, currentDate) ||
    isYesterday(selectedDate, currentDate);
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
  const showingToday = isToday(selectedDate, currentDate);
  const completedToday = showingToday && todayScreenState.kind === TODAY_SCREEN_STATE.dayCompleted;
  const decisions = state.decisions.status === 'ready' ? state.decisions.decisions : [];
  const hasBlockingDayRecovery =
    showingToday &&
    (singlePastOpenDay !== null ||
      openDayConflictState.status === 'error' ||
      (openDayConflictState.status === 'ready' && openDayConflictState.snapshot.hasConflict));
  const activeRoutineOccurrences =
    routineState.status === 'ready'
      ? routineState.occurrences.filter((occurrence) => !occurrence.isSkipped)
      : [];
  const mainDecisions = decisions.filter((decision) => decision.kind === DECISION_KIND.main);
  const focusDecision =
    mainDecisions.find(
      (decision) =>
        decision.status === DECISION_STATUS.inProgress ||
        decision.status === DECISION_STATUS.planned,
    ) ??
    mainDecisions[0] ??
    null;
  const preparationInSidebar =
    todayScreenState.kind === TODAY_SCREEN_STATE.dayNotPlanned ||
    todayScreenState.kind === TODAY_SCREEN_STATE.dayPlanned;

  function openDecisionForm(kind: DecisionKind): void {
    onKindChange(kind);
    onOpenForm();
  }

  function openClosedTimeline(): void {
    onClosedTimelineOpenChange(true);
    requestAnimationFrame(() => {
      const timeline = document.getElementById('today-closed-timeline');
      timeline?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
      timeline?.querySelector<HTMLElement>('summary, [tabindex], button, a')?.focus();
    });
  }

  const todayStatePanel =
    showingToday && !hasBlockingDayRecovery ? (
      <TodayStateCard
        spheres={spheres}
        projects={projects}
        state={todayScreenState}
        isStarting={isStartingDay}
        error={startDayError}
        startBlockedMessage={startDayBlockedMessage}
        onRetryRecovery={onRetryTodayRecovery}
        onStart={onStartDay}
        onCreateDecision={() => openDecisionForm(DECISION_KIND.main)}
        decisions={decisions}
        lifeActions={currentLifeActions}
        currentDaySessions={currentDaySessions}
        recoveryStatus={todayRecoveryStatus}
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
        onOpenProject={onOpenProject}
      />
    ) : null;
  const decisionPanels =
    state.decisions.status === 'ready' ? (
      <DecisionSections
        decisions={state.decisions.decisions}
        projects={projects}
        canCreate={!hasBlockingDayRecovery && !completedToday}
        onCreateMainDecision={() => openDecisionForm(DECISION_KIND.main)}
        onCreateAdditionalDecision={() => openDecisionForm(DECISION_KIND.additional)}
        onOpenDecision={onOpenDecision}
        onOpenProject={onOpenProject}
      />
    ) : null;
  const quickActionsPanel = (
    <TodayQuickActions
      hasFocus={focusDecision !== null}
      onOpenRoutine={onOpenRoutine}
      onSetFocus={() =>
        focusDecision === null
          ? openDecisionForm(DECISION_KIND.main)
          : onOpenDecision(focusDecision.id)
      }
      onAddAction={() => {
        if (focusDecision === null) {
          onOpenActions();
          return;
        }
        onOpenDecision(focusDecision.id);
      }}
    />
  );
  const focusPanel = (
    <TodayFocusCard
      decision={focusDecision}
      onSetFocus={() => openDecisionForm(DECISION_KIND.main)}
      onOpenDecision={onOpenDecision}
    />
  );
  const remindersPanel = (
    <TodayRemindersCard routineState={routineState} occurrences={activeRoutineOccurrences} />
  );
  const closedRemindersPanel = (
    <TodayRemindersCard
      routineState={routineState}
      occurrences={activeRoutineOccurrences}
      compact
    />
  );
  const closedQuickActionsPanel = (
    <CompletedQuickActions
      onOpenTimeline={openClosedTimeline}
      onOpenRoutine={onOpenRoutine}
      onAddTomorrowAction={onAddTomorrowAction}
    />
  );
  const tomorrowPanel = (
    <TodayTomorrowCard
      summary={tomorrowPlanSummary}
      onOpen={onPlanTomorrow}
      onRetry={onRetryTomorrowPlanSummary}
    />
  );
  const schedulePanel = (
    <TodayScheduleCard routineState={routineState} onOpenRoutine={onOpenRoutine} />
  );

  return (
    <>
      <main className="today-page">
        <section className="date-navigation today-toolbar" aria-label="Навигация по датам">
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
          {completedToday ? (
            <div className="today-closed-date-context" aria-label="Просматриваемая дата">
              <strong>{formatSelectedDateWeekday(selectedDate)}</strong>
              <span>{formatRussianDate(selectedDate)}</span>
            </div>
          ) : null}
          <div className="today-toolbar-actions">
            {completedToday ? null : (
              <button
                className="secondary-button lifeos-motion-outline today-plan-next-button"
                type="button"
                onClick={onPlanTomorrow}
              >
                Планировать {tomorrowPlanLabel}
              </button>
            )}
            <label
              className="date-picker-label lifeos-motion-outline today-calendar-button"
              title="Выбрать дату"
            >
              <AppIcon name="today" />
              <span className="visually-hidden">Выбрать дату</span>
              <input
                type="date"
                aria-label="Выбрать дату"
                value={selectedDate.toString()}
                onInput={(event: FormEvent<HTMLInputElement>) => {
                  if (event.currentTarget.value.length > 0) {
                    onDateChange(DayDate.create(event.currentTarget.value));
                  }
                }}
              />
            </label>
          </div>
        </section>

        {completedToday ? null : (
          <header className="today-header">
            <div className="today-header-copy">
              <p className="today-brand">План дня</p>
              <h1>{selectedDateTitle}</h1>
              <p className="today-date">
                {formatSelectedDateWeekday(selectedDate)}
                {hasRelativeDateTitle ? ` · ${formatRussianDate(selectedDate)}` : null}
              </p>
            </div>
          </header>
        )}

        {showingToday && !completedToday ? (
          <TodayMetrics
            decisionsStatus={state.decisions.status}
            recoveryStatus={todayRecoveryStatus}
            decisions={decisions}
            lifeActions={currentLifeActions}
            sessions={currentDaySessions}
            clock={clock}
            dayStatus={describeTodayDayStatus(todayScreenState, showingToday)}
            dayStatusTone={resolveDayStatusTone(todayScreenState, showingToday)}
          />
        ) : null}

        {showingToday &&
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
        ) : showingToday && openDayConflictState.status === 'error' ? (
          <section className="open-day-recovery open-day-recovery-error" role="alert">
            <p className="section-kicker danger">Проверка целостности</p>
            <h2>Не удалось проверить активные дни</h2>
            <p>Запуск дня временно заблокирован, чтобы не создать конфликт в данных.</p>
            <button className="secondary-button" type="button" onClick={onRetryOpenDayConflict}>
              Проверить снова
            </button>
          </section>
        ) : null}

        {showingToday && singlePastOpenDay !== null ? (
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

        {showingToday ? (
          completedToday && todayScreenState.kind === TODAY_SCREEN_STATE.dayCompleted ? (
            <div className="today-closed-results" aria-label="Итоги завершённого дня">
              <div className="today-closed-main">
                <CompletedDayHero
                  day={todayScreenState.day}
                  spheres={spheres}
                  isSphereUpdating={isDaySphereUpdating}
                  sphereError={daySphereError}
                  onSphereChange={onDaySphereChange}
                />
                <CompletedDayMetrics
                  decisionsStatus={state.decisions.status}
                  recoveryStatus={todayRecoveryStatus}
                  decisions={decisions}
                  lifeActions={currentLifeActions}
                  sessions={currentDaySessions}
                  day={todayScreenState.day}
                  clock={clock}
                />
                <CompletedDayDecisions
                  decisionsStatus={state.decisions.status}
                  decisions={decisions}
                  projects={projects}
                  onOpenDecision={onOpenDecision}
                  onOpenProject={onOpenProject}
                  onRetry={onRetry}
                />
                <CompletedDayDetails
                  decisionsStatus={state.decisions.status}
                  decisions={decisions}
                  lifeActions={currentLifeActions}
                  sessions={currentDaySessions}
                  projects={projects}
                  routineState={routineState}
                  recoveryStatus={todayRecoveryStatus}
                  timelineOpen={closedTimelineOpen}
                  onTimelineToggle={onClosedTimelineOpenChange}
                  onRetryDecisions={onRetry}
                  onRetryRecovery={onRetryTodayRecovery}
                  onOpenDecision={onOpenDecision}
                  onOpenProject={onOpenProject}
                  onOpenRoutine={onOpenRoutine}
                />
              </div>
              <aside className="today-closed-sidebar" aria-label="Следующие шаги">
                {tomorrowPanel}
                {closedQuickActionsPanel}
                {closedRemindersPanel}
              </aside>
            </div>
          ) : (
            <div className="today-dashboard" aria-label="Рабочая панель дня">
              {useDesktopDashboard ? (
                <>
                  <div className="today-dashboard-main">
                    {preparationInSidebar ? null : todayStatePanel}
                    {decisionPanels}
                    {schedulePanel}
                  </div>
                  <aside className="today-dashboard-sidebar" aria-label="Панель дня">
                    {preparationInSidebar ? todayStatePanel : null}
                    {quickActionsPanel}
                    {remindersPanel}
                    {focusPanel}
                  </aside>
                </>
              ) : (
                <>
                  {todayStatePanel}
                  {decisionPanels}
                  {quickActionsPanel}
                  {focusPanel}
                  {remindersPanel}
                  {schedulePanel}
                </>
              )}
            </div>
          )
        ) : state.decisions.status === 'ready' ? (
          state.decisions.decisions.length === 0 ? (
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
                {pastDate ? null : (
                  <button className="primary-button" type="button" onClick={onOpenForm}>
                    Создать Решение
                  </button>
                )}
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
              projects={projects}
              canCreate={!pastDate}
              onCreateMainDecision={() => openDecisionForm(DECISION_KIND.main)}
              onCreateAdditionalDecision={() => openDecisionForm(DECISION_KIND.additional)}
              onOpenDecision={onOpenDecision}
              onOpenProject={onOpenProject}
            />
          )
        ) : null}
      </main>

      {state.actionDetails.status === 'closed' ? (
        <DecisionDetailsPanel
          decisionWalk={decisionWalk}
          spheres={spheres}
          projects={projects}
          onOpenProject={onOpenProject}
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
          project={findProject(
            projects,
            state.details.status === 'ready'
              ? (state.details.decision.projectId?.toString() ?? null)
              : null,
          )}
          onOpenProject={onOpenProject}
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

interface TodayMetricsProps {
  readonly decisionsStatus: TodayDecisionsStatus;
  readonly recoveryStatus: TodayRecoveryStatus;
  readonly decisions: readonly Decision[];
  readonly lifeActions: readonly LifeAction[];
  readonly sessions: readonly ActionSession[];
  readonly clock: Pick<Clock, 'now'>;
  readonly dayStatus: string;
  readonly dayStatusTone: TodayMetricTone;
}

type TodayMetricTone = 'neutral' | 'active' | 'paused' | 'completed';

function TodayMetrics({
  decisionsStatus,
  recoveryStatus,
  decisions,
  lifeActions,
  sessions,
  clock,
  dayStatus,
  dayStatusTone,
}: TodayMetricsProps) {
  const now = useTodayMetricsNow(sessions, clock);
  const decisionsReady = decisionsStatus === 'ready';
  const actionsReady = recoveryStatus === 'ready';
  const relevantDecisions = decisions.filter(
    (decision) =>
      decision.status !== DECISION_STATUS.draft && decision.status !== DECISION_STATUS.cancelled,
  );
  const relevantActions = lifeActions.filter(
    (lifeAction) =>
      lifeAction.status !== LIFE_ACTION_STATUS.draft &&
      lifeAction.status !== LIFE_ACTION_STATUS.cancelled,
  );
  const completedDecisions = relevantDecisions.filter(
    (decision) => decision.status === DECISION_STATUS.confirmed,
  ).length;
  const completedActions = relevantActions.filter(
    (lifeAction) => lifeAction.status === LIFE_ACTION_STATUS.completed,
  ).length;
  const relevantMainDecisions = relevantDecisions.filter(
    (decision) => decision.kind === DECISION_KIND.main,
  );
  const decisionsGoalReached =
    relevantMainDecisions.length > 0 &&
    relevantMainDecisions.every((decision) => decision.status === DECISION_STATUS.confirmed);
  const actionsGoalReached =
    relevantActions.length > 0 && completedActions === relevantActions.length;
  const hasRunningSession = sessions.some(
    (session) => session.status === ACTION_SESSION_STATUS.running,
  );
  const workedDuration = sessions.reduce(
    (total, session) => total + session.workedDurationAt(now),
    0,
  );

  return (
    <dl className="today-metrics" aria-label="Сводка дня">
      <Metric
        icon="decisions"
        label="Решения"
        value={decisionsReady ? `${completedDecisions} / ${relevantDecisions.length}` : '—'}
        note={decisionsReady ? 'выполнено' : 'Нет данных'}
        isComplete={decisionsReady && decisionsGoalReached}
        feedbackReady={decisionsReady}
      />
      <Metric
        icon="actions"
        label="Действия"
        value={actionsReady ? `${completedActions} / ${relevantActions.length}` : '—'}
        note={actionsReady ? 'выполнено' : 'Нет данных'}
        isComplete={actionsReady && actionsGoalReached}
        feedbackReady={actionsReady}
      />
      <Metric
        icon="history"
        label="Время действия"
        value={actionsReady && sessions.length > 0 ? formatDuration(workedDuration) : '—'}
        note={
          actionsReady
            ? hasRunningSession
              ? 'активная сессия'
              : sessions.length > 0
                ? 'по сессиям'
                : 'Нет сессий'
            : 'Нет данных'
        }
        isActive={hasRunningSession}
      />
      <Metric
        icon="today"
        label="Статус дня"
        value={dayStatus}
        note={describeTodayDayStatusNote(dayStatusTone)}
        tone={dayStatusTone}
      />
    </dl>
  );
}

function Metric({
  icon,
  label,
  value,
  note,
  tone = 'neutral',
  isActive = false,
  isComplete = false,
  feedbackReady = true,
}: {
  readonly icon: AppIconName;
  readonly label: string;
  readonly value: string;
  readonly note: string;
  readonly tone?: TodayMetricTone;
  readonly isActive?: boolean;
  readonly isComplete?: boolean;
  readonly feedbackReady?: boolean;
}) {
  const successRevision = useMetricSuccessFeedback(isComplete, feedbackReady);

  return (
    <div
      className={`today-metric today-metric-${tone}${isActive ? ' today-metric-active-session' : ''}`}
    >
      <span className="today-metric-icon" aria-hidden="true">
        <AppIcon name={icon} />
        {isActive ? <span className="today-metric-status-dot" /> : null}
      </span>
      <div className="today-metric-copy">
        <dt>{label}</dt>
        <AnimatedMetricValue value={value} />
        <small>{note}</small>
      </div>
      {successRevision > 0 ? (
        <span key={successRevision} className="today-metric-success-feedback" aria-hidden="true" />
      ) : null}
    </div>
  );
}

interface AnimatedMetricValueState {
  readonly current: string;
  readonly previous: string | null;
  readonly revision: number;
}

function AnimatedMetricValue({ value }: { readonly value: string }) {
  const [displayedValue, setDisplayedValue] = useState<AnimatedMetricValueState>(() => ({
    current: value,
    previous: null,
    revision: 0,
  }));

  useEffect(() => {
    const updateTimer = globalThis.setTimeout(() => {
      setDisplayedValue((currentValue) =>
        currentValue.current === value
          ? currentValue
          : {
              current: value,
              previous: currentValue.current,
              revision: currentValue.revision + 1,
            },
      );
    }, 0);

    return () => globalThis.clearTimeout(updateTimer);
  }, [value]);

  return (
    <dd className="today-metric-value">
      {displayedValue.previous === null ? null : (
        <span
          key={`previous-${displayedValue.revision}`}
          className="today-metric-value-previous"
          aria-hidden="true"
        >
          {displayedValue.previous}
        </span>
      )}
      <span
        key={`current-${displayedValue.revision}`}
        className={
          displayedValue.previous === null
            ? 'today-metric-value-current'
            : 'today-metric-value-current today-metric-value-changed'
        }
      >
        {displayedValue.current}
      </span>
    </dd>
  );
}

function useMetricSuccessFeedback(isComplete: boolean, feedbackReady: boolean): number {
  const wasComplete = useRef(isComplete);
  const hasObservedReadyState = useRef(feedbackReady);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!feedbackReady) {
      wasComplete.current = isComplete;
      return;
    }

    if (!hasObservedReadyState.current) {
      hasObservedReadyState.current = true;
      wasComplete.current = isComplete;
      return;
    }

    const shouldShowFeedback = !wasComplete.current && isComplete;
    wasComplete.current = isComplete;

    if (!shouldShowFeedback) {
      return;
    }

    const feedbackTimer = globalThis.setTimeout(
      () => setRevision((currentRevision) => currentRevision + 1),
      0,
    );
    return () => globalThis.clearTimeout(feedbackTimer);
  }, [feedbackReady, isComplete]);

  return revision;
}

function describeTodayDayStatusNote(tone: TodayMetricTone): string {
  switch (tone) {
    case 'neutral':
      return 'Готов к старту';
    case 'active':
      return 'Рабочий цикл';
    case 'paused':
      return 'Сессия приостановлена';
    case 'completed':
      return 'Цикл закрыт';
  }
}

function useTodayMetricsNow(sessions: readonly ActionSession[], clock: Pick<Clock, 'now'>): Date {
  const [now, setNow] = useState(() => clock.now());
  const hasRunningSession = sessions.some(
    (session) => session.status === ACTION_SESSION_STATUS.running,
  );

  useEffect(() => {
    if (!hasRunningSession) {
      return;
    }

    return scheduleSessionTimer(() => setNow(clock.now()));
  }, [clock, hasRunningSession]);

  return now;
}

function describeTodayDayStatus(state: TodayScreenState, showingToday: boolean): string {
  if (!showingToday) {
    return 'Просмотр даты';
  }

  if (state.kind === TODAY_SCREEN_STATE.pausedSession) {
    return 'На паузе';
  }

  switch (state.day.status) {
    case DAY_STATUS.planned:
      return 'День не начат';
    case DAY_STATUS.open:
      return 'День идёт';
    case DAY_STATUS.completed:
      return 'День завершён';
  }
}

function resolveDayStatusTone(
  state: TodayScreenState,
  showingToday: boolean,
): 'neutral' | 'active' | 'paused' | 'completed' {
  if (!showingToday || state.day.status === DAY_STATUS.planned) {
    return 'neutral';
  }
  if (state.kind === TODAY_SCREEN_STATE.pausedSession) {
    return 'paused';
  }
  return state.day.status === DAY_STATUS.completed ? 'completed' : 'active';
}

type CompletedTimelineItem =
  | {
      readonly kind: 'action';
      readonly occurredAt: Date;
      readonly lifeAction: LifeAction;
    }
  | {
      readonly kind: 'session';
      readonly occurredAt: Date;
      readonly session: ActionSession;
      readonly lifeAction: LifeAction | null;
    };

function CompletedDayTimeline({
  lifeActions,
  sessions,
  decisions,
  projects,
  onOpenProject,
  dataAvailable,
  compact = false,
}: {
  readonly lifeActions: readonly LifeAction[];
  readonly sessions: readonly ActionSession[];
  readonly decisions: readonly Decision[];
  readonly projects: readonly Project[];
  readonly onOpenProject: (projectId: string) => void;
  readonly dataAvailable: boolean;
  readonly compact?: boolean;
}) {
  const items: CompletedTimelineItem[] = [
    ...lifeActions.flatMap<CompletedTimelineItem>((lifeAction) =>
      lifeAction.status === LIFE_ACTION_STATUS.completed && lifeAction.completedAt !== null
        ? [{ kind: 'action', occurredAt: lifeAction.completedAt, lifeAction }]
        : [],
    ),
    ...sessions.flatMap<CompletedTimelineItem>((session) =>
      session.status === ACTION_SESSION_STATUS.completed && session.completedAt !== null
        ? [
            {
              kind: 'session',
              occurredAt: session.completedAt,
              session,
              lifeAction:
                lifeActions.find((lifeAction) => lifeAction.id.equals(session.lifeActionId)) ??
                null,
            },
          ]
        : [],
    ),
  ].sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
  const lastSessionId = sessions.reduce<ActionSession | null>(
    (latest, session) =>
      latest === null || session.startedAt.getTime() > latest.startedAt.getTime()
        ? session
        : latest,
    null,
  )?.id;

  return (
    <section
      className={`today-completed-timeline${compact ? ' is-compact' : ''}`}
      {...(compact
        ? { 'aria-label': 'Хронология завершённого дня' }
        : { 'aria-labelledby': 'today-completed-title' })}
    >
      {compact ? null : (
        <div className="today-section-heading">
          <div>
            <p className="section-kicker">Хронология</p>
            <h2 id="today-completed-title">Выполненное</h2>
          </div>
          {items.length > 0 ? <span>{items.length}</span> : null}
        </div>
      )}
      {!dataAvailable ? (
        <p className="today-completed-empty">Данные о выполненном пока недоступны.</p>
      ) : items.length === 0 ? (
        <p className="today-completed-empty">Завершённых Действий и Сессий пока нет.</p>
      ) : (
        <ol className="today-completed-list">
          {items.map((item) => {
            const project =
              item.lifeAction === null
                ? null
                : findProjectForLifeAction(projects, decisions, item.lifeAction);
            return (
              <li
                key={`${item.kind}-${item.kind === 'action' ? item.lifeAction.id.toString() : item.session.id.toString()}`}
              >
                <time dateTime={item.occurredAt.toISOString()}>{formatTime(item.occurredAt)}</time>
                <span className="today-completed-marker" aria-hidden="true" />
                <div>
                  <strong>
                    {item.kind === 'action'
                      ? item.lifeAction.title.toString()
                      : (item.lifeAction?.title.toString() ?? 'Сессия действия')}
                  </strong>
                  <span>
                    {item.kind === 'action'
                      ? 'Действие завершено'
                      : `${lastSessionId?.equals(item.session.id) ? 'Последняя сессия' : item.session.completionKind === SESSION_COMPLETION_KIND.interrupted ? 'Сессия прервана' : 'Сессия завершена'} · ${formatDuration(item.session.workedDurationAt(item.occurredAt))}`}
                  </span>
                  {project === null ? null : (
                    <button
                      className="today-project-link"
                      type="button"
                      onClick={() => onOpenProject(project.id.toString())}
                    >
                      {project.title} →
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
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
  readonly projects: readonly Project[];
  readonly state: TodayScreenState;
  readonly decisions: readonly Decision[];
  readonly lifeActions: readonly LifeAction[];
  readonly currentDaySessions: readonly ActionSession[];
  readonly recoveryStatus: TodayRecoveryStatus;
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
  readonly onCreateDecision: () => void;
  readonly onOpenEveningReview: () => void;
  readonly onOpenLifeAction: (lifeAction: LifeAction) => void;
  readonly onStartCurrentAction: (lifeAction: LifeAction) => void;
  readonly onPauseCurrentAction: (session: ActionSession) => void;
  readonly onResumeCurrentAction: (session: ActionSession) => void;
  readonly onCompleteCurrentActionSession: (lifeAction: LifeAction) => void;
  readonly onRescheduleCurrentAction: (lifeAction: LifeAction) => void;
  readonly onCancelCurrentAction: (lifeAction: LifeAction) => void;
  readonly onSelectCurrentAction: (lifeAction: LifeAction) => void;
  readonly onOpenProject: (projectId: string) => void;
}

function TodayStateCard({
  spheres,
  projects,
  state,
  decisions,
  lifeActions,
  currentDaySessions,
  recoveryStatus,
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
  onCreateDecision,
  onOpenEveningReview,
  onOpenLifeAction,
  onStartCurrentAction,
  onPauseCurrentAction,
  onResumeCurrentAction,
  onCompleteCurrentActionSession,
  onRescheduleCurrentAction,
  onCancelCurrentAction,
  onSelectCurrentAction,
  onOpenProject,
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
        <section className="today-completed-workspace" aria-labelledby="day-state-title">
          <div className="day-start-header">
            <div>
              <p className="section-kicker">Цикл закрыт</p>
              <h2 id="day-state-title">День завершён</h2>
              <p>Итог сохранён. Повторное завершение и запуск недоступны.</p>
            </div>
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
          <CompletedDayTimeline
            lifeActions={lifeActions}
            sessions={currentDaySessions}
            decisions={decisions}
            projects={projects}
            onOpenProject={onOpenProject}
            dataAvailable={recoveryStatus === 'ready'}
          />
        </section>
      );

    case TODAY_SCREEN_STATE.dayNotPlanned:
      return (
        <section className="today-preparation" aria-labelledby="day-state-title">
          <div className="day-start-header">
            <div>
              <p className="section-kicker">Подготовка</p>
              <h2 id="day-state-title">Сначала создайте главное Решение</h2>
              <p>Оно определит направление дня и откроет возможность начать рабочий цикл.</p>
            </div>
          </div>
          <div className="today-preparation-progress">
            <div>
              <span>Подготовка плана</span>
              <strong>0 из 3 главных Решений</strong>
            </div>
            <progress max="3" value="0" aria-label="Подготовка плана: 0 из 3" />
          </div>
          {error === null ? null : (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary-button today-preparation-action"
            type="button"
            onClick={onCreateDecision}
          >
            Создать Решение
          </button>
        </section>
      );

    case TODAY_SCREEN_STATE.dayPlanned:
      return (
        <section
          className="today-preparation today-preparation-ready"
          aria-labelledby="day-state-title"
        >
          <div className="day-start-header">
            <div>
              <p className="section-kicker gold">План готов</p>
              <h2 id="day-state-title">План готов к началу</h2>
              <p>Проверьте главные Решения и зафиксируйте начало рабочего цикла.</p>
            </div>
          </div>
          <div className="today-preparation-progress">
            <div>
              <span>Подготовка плана</span>
              <strong>{state.mainDecisionCount} из 3 главных Решений</strong>
            </div>
            <progress
              max="3"
              value={state.mainDecisionCount}
              aria-label={`Подготовка плана: ${state.mainDecisionCount} из 3`}
            />
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
            className="primary-button today-preparation-action"
            type="button"
            aria-busy={isStarting}
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
          projects={projects}
          allLifeActions={lifeActions}
          currentDaySessions={currentDaySessions}
          recoveryStatus={recoveryStatus}
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
          onOpenProject={onOpenProject}
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
          projects={projects}
          allLifeActions={lifeActions}
          currentDaySessions={currentDaySessions}
          recoveryStatus={recoveryStatus}
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
          onOpenProject={onOpenProject}
          onOpenEveningReview={onOpenEveningReview}
        />
      );

    case TODAY_SCREEN_STATE.noCurrentAction:
      return (
        <section
          className="today-workspace today-workspace-empty"
          aria-labelledby="day-state-title"
        >
          <div className="day-start-header">
            <div>
              <p className="section-kicker">Текущий фокус</p>
              <h2 id="day-state-title">Нет текущего действия</h2>
              <p>Создайте готовое Действие внутри Решения или завершите день.</p>
            </div>
          </div>
          <EveningControlEntry onOpen={onOpenEveningReview} />
          <CompletedDayTimeline
            lifeActions={lifeActions}
            sessions={currentDaySessions}
            decisions={decisions}
            projects={projects}
            onOpenProject={onOpenProject}
            dataAvailable={recoveryStatus === 'ready'}
          />
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
          projects={projects}
          allLifeActions={lifeActions}
          currentDaySessions={currentDaySessions}
          recoveryStatus={recoveryStatus}
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
          onOpenProject={onOpenProject}
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
  readonly projects: readonly Project[];
  readonly allLifeActions: readonly LifeAction[];
  readonly currentDaySessions: readonly ActionSession[];
  readonly recoveryStatus: TodayRecoveryStatus;
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
  readonly onOpenProject: (projectId: string) => void;
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
  projects,
  allLifeActions,
  currentDaySessions,
  recoveryStatus,
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
  onOpenProject,
  onOpenEveningReview,
}: OpenDayStateCardProps) {
  const cardState = resolveCurrentActionCardState({
    lifeAction,
    decisions,
    sessions: currentDaySessions,
    unfinishedSession,
  });
  const project = findProjectForLifeAction(projects, decisions, lifeAction);
  return (
    <section className="today-workspace" aria-labelledby="day-state-title">
      <div className="day-start-header">
        <div>
          <p className="section-kicker">Текущий фокус</p>
          <h2 id="day-state-title">{title}</h2>
          <p>{description}</p>
        </div>
        <span className={`day-start-status ${statusClassName}`}>{statusLabel}</span>
      </div>
      <CurrentActionCard
        state={cardState}
        project={project}
        onOpenProject={onOpenProject}
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
      <TodayActionNavigator
        lifeActions={availableLifeActions}
        decisions={decisions}
        projects={projects}
        onOpenProject={onOpenProject}
        currentLifeActionIndex={currentLifeActionIndex}
        isLockedBySession={unfinishedSession !== null}
        isMutating={isCurrentActionMutating}
        onSelect={onSelectCurrentAction}
      />
      {nextLifeAction === null ? null : (
        <span className="visually-hidden">
          Следующее действие: {nextLifeAction.title.toString()}
        </span>
      )}
      <EveningControlEntry onOpen={onOpenEveningReview} />
      <CompletedDayTimeline
        lifeActions={allLifeActions}
        sessions={currentDaySessions}
        decisions={decisions}
        projects={projects}
        onOpenProject={onOpenProject}
        dataAvailable={recoveryStatus === 'ready'}
      />
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
  const titleInvalid = error !== null && form.title.trim().length === 0;
  const expectedResultInvalid =
    error !== null &&
    form.title.trim().length > 0 &&
    isMain &&
    form.expectedResult.trim().length === 0;

  return (
    <section
      className="decision-form-panel today-decision-form-panel"
      aria-labelledby="decision-form-title"
    >
      <header className="today-decision-form-header">
        <div className="today-decision-form-heading">
          <p className="section-kicker">Новое решение</p>
          <h2 id="decision-form-title">Создать решение</h2>
          <p>Зафиксируйте результат, который хотите получить.</p>
        </div>
      </header>
      <form className="decision-form" onSubmit={onSubmit} noValidate>
        <fieldset className="decision-kind-field">
          <legend>Тип решения</legend>
          <div className="decision-kind-segments">
            <label>
              <input
                type="radio"
                name="decision-kind"
                value={DECISION_KIND.main}
                checked={isMain}
                disabled={isSaving}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  onKindChange(event.target.value as DecisionKind)
                }
              />
              <span>
                <span className="decision-kind-icon" aria-hidden="true">
                  ★
                </span>
                Главное
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="decision-kind"
                value={DECISION_KIND.additional}
                checked={!isMain}
                disabled={isSaving}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  onKindChange(event.target.value as DecisionKind)
                }
              />
              <span>Дополнительное</span>
            </label>
          </div>
        </fieldset>

        <VoiceField className="decision-title-field" htmlFor="decision-title">
          <span>
            Название решения <span className="decision-required-mark">*</span>
          </span>
          <VoiceTextInput
            id="decision-title"
            value={form.title}
            disabled={isSaving}
            maxLength={200}
            autoComplete="off"
            required
            aria-invalid={titleInvalid}
            aria-describedby={titleInvalid ? 'decision-form-error' : undefined}
            placeholder="Например: Завершить этап 17.2"
            onValueChange={(value) => onTitleChange(value)}
          />
        </VoiceField>

        <VoiceField className="decision-result-field" htmlFor="decision-expected-result">
          <span>
            Ожидаемый результат
            {isMain ? <span className="decision-required-mark"> *</span> : null}
          </span>
          <VoiceTextArea
            id="decision-expected-result"
            value={form.expectedResult}
            disabled={isSaving}
            maxLength={1000}
            rows={3}
            required={isMain}
            aria-required={isMain}
            aria-invalid={expectedResultInvalid}
            aria-describedby={
              expectedResultInvalid
                ? 'decision-expected-result-help decision-form-error'
                : 'decision-expected-result-help'
            }
            placeholder="Что должно быть получено в результате?"
            onValueChange={(value) => onExpectedResultChange(value)}
          />
          <small id="decision-expected-result-help">
            Сформулируйте конкретный и проверяемый результат.
          </small>
        </VoiceField>

        <div className="form-actions today-decision-form-actions">
          <div className="today-decision-form-status">
            {error === null ? null : (
              <p id="decision-form-error" className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="today-decision-form-buttons">
            <button
              className="secondary-button"
              type="button"
              disabled={isSaving}
              onClick={onClose}
            >
              Отмена
            </button>
            <button
              className="primary-button"
              type="submit"
              aria-busy={isSaving}
              disabled={isSaving}
            >
              <span>{isSaving ? 'Создание…' : 'Создать решение'}</span>
              {isSaving ? null : (
                <span className="decision-submit-arrow" aria-hidden="true">
                  →
                </span>
              )}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

function TodayQuickActions({
  hasFocus,
  onOpenRoutine,
  onSetFocus,
  onAddAction,
}: {
  readonly hasFocus: boolean;
  readonly onOpenRoutine: () => void;
  readonly onSetFocus: () => void;
  readonly onAddAction: () => void;
}) {
  return (
    <section className="today-side-card today-quick-actions" aria-labelledby="quick-actions-title">
      <h2 id="quick-actions-title">Быстрые действия</h2>
      <div className="today-quick-action-list">
        <QuickActionRow icon="routine" label="Открыть распорядок дня" onClick={onOpenRoutine} />
        <QuickActionRow
          icon="decisions"
          label={hasFocus ? 'Настроить фокус' : 'Задать фокус'}
          onClick={onSetFocus}
        />
        <QuickActionRow icon="actions" label="Добавить действие" onClick={onAddAction} />
      </div>
    </section>
  );
}

function TodayTomorrowCard({
  summary,
  onOpen,
  onRetry,
}: {
  readonly summary: TomorrowPlanSummaryState;
  readonly onOpen: () => void;
  readonly onRetry: () => void;
}) {
  const prepared = summary.status === 'ready' && summary.prepared;
  const isLoading = summary.status === 'loading';
  const hasError = summary.status === 'error';

  return (
    <section className="today-side-card today-tomorrow-card" aria-labelledby="today-tomorrow-title">
      <h2 id="today-tomorrow-title">Завтра</h2>
      {summary.status === 'loading' ? (
        <p role="status">Проверяем план…</p>
      ) : summary.status === 'error' ? (
        <p>Не удалось проверить состояние плана.</p>
      ) : (
        <>
          <p>{prepared ? 'План подготовлен' : 'План пока не подготовлен'}</p>
          <span>{formatTomorrowMainDecisionCount(summary.mainDecisionCount, prepared)}</span>
        </>
      )}
      <button
        className="primary-button today-closed-primary"
        type="button"
        disabled={isLoading}
        aria-busy={isLoading}
        onClick={hasError ? onRetry : onOpen}
      >
        {isLoading
          ? 'Проверяем план…'
          : hasError
            ? 'Повторить'
            : prepared
              ? 'Открыть план'
              : 'Подготовить план'}
      </button>
    </section>
  );
}

function formatTomorrowMainDecisionCount(count: number, prepared: boolean): string {
  if (!prepared) return `${count} из 3 главных решений выбрано`;
  if (count === 1) return '1 главное решение выбрано';
  return `${count} ${count === 0 ? 'главных решений' : 'главных решения'} выбрано`;
}

function CompletedQuickActions({
  onOpenTimeline,
  onOpenRoutine,
  onAddTomorrowAction,
}: {
  readonly onOpenTimeline: () => void;
  readonly onOpenRoutine: () => void;
  readonly onAddTomorrowAction: () => void;
}) {
  return (
    <section
      className="today-side-card today-closed-quick-actions"
      aria-labelledby="closed-quick-actions-title"
    >
      <h2 id="closed-quick-actions-title">Быстрые действия</h2>
      <div className="today-closed-quick-action-list">
        <button type="button" aria-controls="today-closed-timeline" onClick={onOpenTimeline}>
          <AppIcon name="history" />
          <span>Посмотреть хронологию</span>
          <span aria-hidden="true">›</span>
        </button>
        <button type="button" onClick={onOpenRoutine}>
          <AppIcon name="routine" />
          <span>Открыть распорядок дня</span>
          <span aria-hidden="true">›</span>
        </button>
        <button type="button" onClick={onAddTomorrowAction}>
          <AppIcon name="actions" />
          <span>Добавить действие на завтра</span>
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </section>
  );
}

function CompletedDayHero({
  day,
  spheres,
  isSphereUpdating,
  sphereError,
  onSphereChange,
}: {
  readonly day: Day;
  readonly spheres: SpheresSnapshot;
  readonly isSphereUpdating: boolean;
  readonly sphereError: string | null;
  readonly onSphereChange: (sphereId: string | null) => void;
}) {
  const [isEditingSphere, setIsEditingSphere] = useState(false);
  const completedAt = day.completedAt;

  return (
    <section className="today-closed-hero" aria-labelledby="day-state-title">
      <div className="today-closed-hero-heading">
        <span className="today-closed-status-icon" aria-hidden="true">
          <AppIcon name="completed" />
        </span>
        <div className="today-closed-title-copy">
          <h1 id="day-state-title">День завершён</h1>
          <p>
            Итог сохранён
            {completedAt === null ? null : ` · Закрыт в ${formatTime(completedAt)}`}
          </p>
        </div>
      </div>
      <div className="today-closed-summary">
        <div className="today-closed-summary-copy">
          <h3>Итог дня</h3>
          <p>{day.summary ?? 'Итог дня не был добавлен.'}</p>
        </div>
        <div className="today-closed-sphere">
          <span>Сфера результата</span>
          <SphereBadge sphereId={day.sphereId?.toString() ?? null} snapshot={spheres} />
          <button
            className="secondary-button"
            type="button"
            aria-expanded={isEditingSphere}
            onClick={() => setIsEditingSphere((current) => !current)}
          >
            Изменить
          </button>
          {isEditingSphere ? (
            <label>
              <span className="visually-hidden">Выбрать сферу результата</span>
              <SphereSelect
                value={day.sphereId?.toString() ?? null}
                snapshot={spheres}
                disabled={isSphereUpdating}
                onChange={onSphereChange}
              />
            </label>
          ) : null}
          {sphereError === null ? null : <p className="form-error">{sphereError}</p>}
        </div>
      </div>
    </section>
  );
}

function CompletedDayMetrics({
  decisionsStatus,
  recoveryStatus,
  decisions,
  lifeActions,
  sessions,
  day,
  clock,
}: {
  readonly decisionsStatus: TodayDecisionsStatus;
  readonly recoveryStatus: TodayRecoveryStatus;
  readonly decisions: readonly Decision[];
  readonly lifeActions: readonly LifeAction[];
  readonly sessions: readonly ActionSession[];
  readonly day: Day;
  readonly clock: Pick<Clock, 'now'>;
}) {
  const decisionsReady = decisionsStatus === 'ready';
  const recoveryReady = recoveryStatus === 'ready';
  const relevantDecisions = decisions.filter(
    (decision) => decision.status !== DECISION_STATUS.draft,
  );
  const completedDecisions = relevantDecisions.filter(
    (decision) => decision.status === DECISION_STATUS.confirmed,
  ).length;
  const relevantActions = lifeActions.filter(
    (lifeAction) =>
      lifeAction.status !== LIFE_ACTION_STATUS.draft &&
      lifeAction.status !== LIFE_ACTION_STATUS.cancelled,
  );
  const completedActions = relevantActions.filter(
    (lifeAction) => lifeAction.status === LIFE_ACTION_STATUS.completed,
  ).length;
  const workedDuration = sessions.reduce(
    (total, session) => total + session.workedDurationAt(clock.now()),
    0,
  );

  return (
    <dl className="today-closed-metrics" aria-label="Сводка завершённого дня">
      <CompletedMetric
        icon="decisions"
        label="Решения"
        value={
          decisionsReady
            ? relevantDecisions.length === 0
              ? '0'
              : `${completedDecisions} из ${relevantDecisions.length}`
            : '—'
        }
        note={
          decisionsReady ? (relevantDecisions.length === 0 ? 'Не было' : 'выполнено') : 'Нет данных'
        }
      />
      <CompletedMetric
        icon="actions"
        label="Действия"
        value={
          recoveryReady
            ? relevantActions.length === 0
              ? '0'
              : `${completedActions} из ${relevantActions.length}`
            : '—'
        }
        note={
          recoveryReady
            ? relevantActions.length === 0
              ? 'Не запланированы'
              : 'выполнено'
            : 'Нет данных'
        }
      />
      <CompletedMetric
        icon="history"
        label="Сессии"
        value={recoveryReady ? sessions.length.toString() : '—'}
        note={
          recoveryReady
            ? sessions.length === 0
              ? 'Не было'
              : formatDuration(workedDuration)
            : 'Нет данных'
        }
      />
      <CompletedMetric
        icon="today"
        label="Статус дня"
        value="Закрыт"
        note={day.completedAt === null ? 'Итог сохранён' : formatTime(day.completedAt)}
        completed
      />
    </dl>
  );
}

function CompletedMetric({
  icon,
  label,
  value,
  note,
  completed = false,
}: {
  readonly icon: AppIconName;
  readonly label: string;
  readonly value: string;
  readonly note: string;
  readonly completed?: boolean;
}) {
  return (
    <div className={`today-closed-metric${completed ? ' is-completed' : ''}`}>
      <span aria-hidden="true">
        <AppIcon name={icon} />
      </span>
      <div>
        <dt>{label}</dt>
        <dd>{value}</dd>
        <small>{note}</small>
      </div>
    </div>
  );
}

function CompletedDayDecisions({
  decisionsStatus,
  decisions,
  projects,
  onOpenDecision,
  onOpenProject,
  onRetry,
}: {
  readonly decisionsStatus: TodayDecisionsStatus;
  readonly decisions: readonly Decision[];
  readonly projects: readonly Project[];
  readonly onOpenDecision: (decisionId: EntityId) => void;
  readonly onOpenProject: (projectId: string) => void;
  readonly onRetry: () => void;
}) {
  const mainDecisions = decisions
    .filter((decision) => decision.kind === DECISION_KIND.main)
    .sort(
      (left, right) =>
        (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER),
    );

  return (
    <section className="today-closed-decisions" aria-labelledby="main-decisions-title">
      <div className="today-closed-section-heading">
        <h2 id="main-decisions-title">Главные решения</h2>
        {decisionsStatus === 'ready' ? <span>{mainDecisions.length} из 3</span> : null}
      </div>
      {decisionsStatus === 'loading' ? (
        <p className="today-closed-section-message" role="status">
          Загружаем решения…
        </p>
      ) : decisionsStatus === 'error' ? (
        <div className="today-closed-section-message is-error" role="alert">
          <span>Решения временно недоступны.</span>
          <button className="secondary-button" type="button" onClick={onRetry}>
            Повторить
          </button>
        </div>
      ) : mainDecisions.length === 0 ? (
        <p className="today-closed-section-message">Главных решений не было.</p>
      ) : (
        <div className="today-closed-decision-list">
          {mainDecisions.map((decision) => (
            <CompletedDecisionCard
              key={decision.id.toString()}
              decision={decision}
              project={findProject(projects, decision.projectId?.toString() ?? null)}
              onOpen={onOpenDecision}
              onOpenProject={onOpenProject}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CompletedDecisionCard({
  decision,
  project,
  onOpen,
  onOpenProject,
}: {
  readonly decision: Decision;
  readonly project: Project | null;
  readonly onOpen: (decisionId: EntityId) => void;
  readonly onOpenProject: (projectId: string) => void;
}) {
  const title = formatDecisionTitle(decision);

  return (
    <article className={`today-closed-decision status-${decision.status}`}>
      <div className="today-closed-decision-copy">
        <button
          className="today-closed-decision-title"
          type="button"
          onClick={() => onOpen(decision.id)}
        >
          {decision.status === DECISION_STATUS.confirmed ? (
            <span className="today-closed-decision-status-icon" aria-hidden="true">
              <AppIcon name="completed" />
            </span>
          ) : null}
          {title}
        </button>
        {project === null ? null : (
          <button
            className="today-project-link"
            type="button"
            onClick={() => onOpenProject(project.id.toString())}
          >
            {project.title} →
          </button>
        )}
        {decision.expectedResult === null ? null : (
          <span className="today-closed-decision-result">
            <small>Ожидаемый результат</small>
            <span>{decision.expectedResult.toString()}</span>
          </span>
        )}
      </div>
      <span className={`status-badge status-${decision.status}`}>
        {completedDecisionStatusLabel(decision.status)}
      </span>
      <button
        className="today-closed-decision-menu"
        type="button"
        aria-label={`Открыть решение «${title}»`}
        onClick={() => onOpen(decision.id)}
      >
        <AppIcon name="more" />
      </button>
    </article>
  );
}

function completedDecisionStatusLabel(status: DecisionStatus): string {
  switch (status) {
    case DECISION_STATUS.draft:
      return 'Черновик';
    case DECISION_STATUS.planned:
      return 'Запланировано';
    case DECISION_STATUS.inProgress:
      return 'В работе';
    case DECISION_STATUS.confirmed:
      return 'Выполнено';
    case DECISION_STATUS.cancelled:
      return 'Отменено';
  }
}

function CompletedDayDetails({
  decisionsStatus,
  decisions,
  lifeActions,
  sessions,
  projects,
  routineState,
  recoveryStatus,
  timelineOpen,
  onTimelineToggle,
  onRetryDecisions,
  onRetryRecovery,
  onOpenDecision,
  onOpenProject,
  onOpenRoutine,
}: {
  readonly decisionsStatus: TodayDecisionsStatus;
  readonly decisions: readonly Decision[];
  readonly lifeActions: readonly LifeAction[];
  readonly sessions: readonly ActionSession[];
  readonly projects: readonly Project[];
  readonly routineState: TodayRoutineLoadState;
  readonly recoveryStatus: TodayRecoveryStatus;
  readonly timelineOpen: boolean;
  readonly onTimelineToggle: (open: boolean) => void;
  readonly onRetryDecisions: () => void;
  readonly onRetryRecovery: () => void;
  readonly onOpenDecision: (decisionId: EntityId) => void;
  readonly onOpenProject: (projectId: string) => void;
  readonly onOpenRoutine: () => void;
}) {
  const additionalDecisions = decisions.filter(
    (decision) => decision.kind === DECISION_KIND.additional,
  );
  const timelineCount =
    lifeActions.filter(
      (lifeAction) =>
        lifeAction.status === LIFE_ACTION_STATUS.completed && lifeAction.completedAt !== null,
    ).length +
    sessions.filter(
      (session) =>
        session.status === ACTION_SESSION_STATUS.completed && session.completedAt !== null,
    ).length;
  const routineCount =
    routineState.status === 'ready'
      ? routineState.occurrences.filter((occurrence) => !occurrence.isSkipped).length
      : null;

  return (
    <section className="today-closed-details" aria-labelledby="today-closed-details-title">
      <h2 id="today-closed-details-title">Детали дня</h2>
      <div className="today-closed-detail-list">
        {decisionsStatus === 'loading' ? (
          <div className="today-closed-detail-row">
            <span>Дополнительные решения</span>
            <strong>Загрузка…</strong>
          </div>
        ) : decisionsStatus === 'error' ? (
          <div className="today-closed-detail-row is-error">
            <span>Дополнительные решения</span>
            <strong>Недоступны</strong>
            <button type="button" onClick={onRetryDecisions}>
              Повторить
            </button>
          </div>
        ) : additionalDecisions.length === 0 ? (
          <div className="today-closed-detail-row">
            <span>Дополнительные решения</span>
            <strong>Не было</strong>
          </div>
        ) : (
          <details className="today-closed-detail-group">
            <summary className="today-closed-detail-row">
              <span>Дополнительные решения</span>
              <strong>{formatDecisionCount(additionalDecisions.length)}</strong>
              <span aria-hidden="true">›</span>
            </summary>
            <div className="today-closed-additional-list">
              {additionalDecisions.map((decision) => (
                <CompletedDecisionCard
                  key={decision.id.toString()}
                  decision={decision}
                  project={findProject(projects, decision.projectId?.toString() ?? null)}
                  onOpen={onOpenDecision}
                  onOpenProject={onOpenProject}
                />
              ))}
            </div>
          </details>
        )}
        {recoveryStatus === 'loading' ? (
          <div className="today-closed-detail-row" id="today-closed-timeline">
            <span>Хронология</span>
            <strong>Загрузка…</strong>
          </div>
        ) : recoveryStatus === 'error' ? (
          <div className="today-closed-detail-row is-error" id="today-closed-timeline">
            <span>Хронология</span>
            <strong>Недоступна</strong>
            <button type="button" onClick={onRetryRecovery}>
              Повторить
            </button>
          </div>
        ) : timelineCount === 0 ? (
          <div className="today-closed-detail-row" id="today-closed-timeline">
            <span>Хронология</span>
            <strong>0 записей</strong>
          </div>
        ) : (
          <details
            className="today-closed-detail-group"
            id="today-closed-timeline"
            open={timelineOpen}
            onToggle={(event) => onTimelineToggle(event.currentTarget.open)}
          >
            <summary className="today-closed-detail-row">
              <span>Хронология</span>
              <strong>{formatTimelineCount(timelineCount)}</strong>
              <span aria-hidden="true">›</span>
            </summary>
            <CompletedDayTimeline
              lifeActions={lifeActions}
              sessions={sessions}
              decisions={decisions}
              projects={projects}
              onOpenProject={onOpenProject}
              dataAvailable
              compact
            />
          </details>
        )}
        <button className="today-closed-detail-row" type="button" onClick={onOpenRoutine}>
          <span>Распорядок дня</span>
          <strong>
            {routineState.status === 'loading'
              ? 'Загрузка…'
              : routineState.status === 'error'
                ? 'Недоступен'
                : routineCount === 0
                  ? 'Не настроен'
                  : `${routineCount} блоков`}
          </strong>
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </section>
  );
}

function formatDecisionCount(count: number): string {
  const remainder100 = count % 100;
  const remainder10 = count % 10;
  const noun =
    remainder100 >= 11 && remainder100 <= 14
      ? 'решений'
      : remainder10 === 1
        ? 'решение'
        : remainder10 >= 2 && remainder10 <= 4
          ? 'решения'
          : 'решений';
  return `${count} ${noun}`;
}

function formatTimelineCount(count: number): string {
  const remainder100 = count % 100;
  const remainder10 = count % 10;
  const noun =
    remainder100 >= 11 && remainder100 <= 14
      ? 'записей'
      : remainder10 === 1
        ? 'запись'
        : remainder10 >= 2 && remainder10 <= 4
          ? 'записи'
          : 'записей';
  return `${count} ${noun}`;
}

function QuickActionRow({
  icon,
  label,
  onClick,
}: {
  readonly icon: 'routine' | 'decisions' | 'actions';
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}>
      <AppIcon name={icon} />
      <span>{label}</span>
      <span aria-hidden="true">›</span>
    </button>
  );
}

function TodayRemindersCard({
  routineState,
  occurrences,
  compact = false,
}: {
  readonly routineState: TodayRoutineLoadState;
  readonly occurrences: readonly EffectiveRoutineOccurrence[];
  readonly compact?: boolean;
}) {
  const reminders = occurrences.filter(
    (occurrence) => occurrence.effectiveAssignment.kind === ROUTINE_BLOCK_ASSIGNMENT.reminder,
  );

  return (
    <section className="today-side-card today-reminders" aria-labelledby="today-reminders-title">
      <div className="today-side-card-heading">
        <h2 id="today-reminders-title">Напоминания</h2>
        {reminders.length > 0 ? <span>{reminders.length}</span> : null}
      </div>
      {routineState.status === 'loading' ? (
        <p className="today-side-card-message" role="status">
          Загружаем напоминания…
        </p>
      ) : routineState.status === 'error' ? (
        <p className="today-side-card-message">Напоминания временно недоступны.</p>
      ) : reminders.length === 0 ? (
        <div className="today-side-empty">
          <strong>{compact ? 'Активных напоминаний нет' : 'Нет активных напоминаний'}</strong>
          {compact ? null : <p>Вы молодец, всё под контролем.</p>}
        </div>
      ) : (
        <ul className="today-reminder-list">
          {reminders.map((reminder) => (
            <li key={routineOccurrenceKey(reminder)}>
              <span>{reminder.title}</span>
              <time>{formatRoutineTime(reminder)}</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TodayFocusCard({
  decision,
  onSetFocus,
  onOpenDecision,
}: {
  readonly decision: Decision | null;
  readonly onSetFocus: () => void;
  readonly onOpenDecision: (decisionId: EntityId) => void;
}) {
  return (
    <section className="today-side-card today-focus-card" aria-labelledby="today-focus-title">
      <h2 id="today-focus-title">Фокус сегодня</h2>
      {decision === null ? (
        <div className="today-side-empty">
          <strong>Фокус не задан</strong>
          <p>Определите главный акцент дня.</p>
          <button className="secondary-button" type="button" onClick={onSetFocus}>
            Задать фокус
          </button>
        </div>
      ) : (
        <button
          className="today-focus-decision"
          type="button"
          aria-label={`Открыть фокус «${formatDecisionTitle(decision)}»`}
          onClick={() => onOpenDecision(decision.id)}
        >
          <strong>{formatDecisionTitle(decision)}</strong>
          {decision.expectedResult === null ? null : (
            <span>{decision.expectedResult.toString()}</span>
          )}
          <small>Открыть решение →</small>
        </button>
      )}
    </section>
  );
}

function TodayScheduleCard({
  routineState,
  onOpenRoutine,
}: {
  readonly routineState: TodayRoutineLoadState;
  readonly onOpenRoutine: () => void;
}) {
  const occurrences =
    routineState.status === 'ready'
      ? routineState.occurrences.filter((occurrence) => !occurrence.isSkipped)
      : [];

  return (
    <section
      className="today-schedule-card"
      id="today-schedule"
      aria-labelledby="today-schedule-title"
    >
      <div className="today-section-heading">
        <div>
          <p className="section-kicker">Ритм дня</p>
          <h2 id="today-schedule-title">Распорядок дня</h2>
        </div>
        <button className="secondary-button" type="button" onClick={onOpenRoutine}>
          Открыть
        </button>
      </div>
      {routineState.status === 'loading' ? (
        <p className="today-schedule-message" role="status">
          Загружаем распорядок…
        </p>
      ) : routineState.status === 'error' ? (
        <p className="today-schedule-message">Распорядок временно недоступен.</p>
      ) : occurrences.length === 0 ? (
        <div className="today-schedule-empty">
          <strong>Блоки дня пока не заданы</strong>
          <p>Настройте распорядок, чтобы видеть ритм дня на одной панели.</p>
        </div>
      ) : (
        <ol className="today-schedule-list">
          {occurrences.map((occurrence) => (
            <li key={routineOccurrenceKey(occurrence)}>
              <span>{occurrence.title}</span>
              <time>{formatRoutineTime(occurrence)}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function routineOccurrenceKey(occurrence: EffectiveRoutineOccurrence): string {
  return `${occurrence.sourceBlockId.toString()}-${occurrence.occurrenceDate.toString()}`;
}

function formatRoutineTime(occurrence: EffectiveRoutineOccurrence): string {
  return `${occurrence.effectiveStartTime}–${occurrence.effectiveEndTime}`;
}

function DecisionSections({
  decisions,
  projects,
  canCreate,
  onCreateMainDecision,
  onCreateAdditionalDecision,
  onOpenDecision,
  onOpenProject,
}: {
  readonly decisions: readonly Decision[];
  readonly projects: readonly Project[];
  readonly canCreate: boolean;
  readonly onCreateMainDecision: () => void;
  readonly onCreateAdditionalDecision: () => void;
  readonly onOpenDecision: (decisionId: EntityId) => void;
  readonly onOpenProject: (projectId: string) => void;
}) {
  const mainDecisions = decisions.filter((decision) => decision.kind === DECISION_KIND.main);
  const additionalDecisions = decisions.filter(
    (decision) => decision.kind === DECISION_KIND.additional,
  );
  const mainDecisionSlots = [1, 2, 3].map((order) => ({
    order,
    decision: findDecisionForOrder(mainDecisions, order),
  }));
  const remainingMainDecisionCount = mainDecisionSlots.filter(
    ({ decision }) => decision === undefined,
  ).length;

  return (
    <div className="decision-sections">
      <section className="decision-section" aria-labelledby="main-decisions-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker gold">Фокус дня</p>
            <h2 id="main-decisions-title">Главные решения</h2>
          </div>
          <span className="section-count">{3 - remainingMainDecisionCount} из 3</span>
        </div>
        <div className="main-decision-list">
          {mainDecisionSlots.map(({ order, decision }) =>
            decision === undefined ? null : (
              <DecisionCard
                key={decision.id.toString()}
                decision={decision}
                project={findProject(projects, decision.projectId?.toString() ?? null)}
                order={order}
                main
                onOpen={onOpenDecision}
                onOpenProject={onOpenProject}
              />
            ),
          )}
          {!canCreate || remainingMainDecisionCount === 0 ? null : (
            <button
              className="secondary-button add-main-decision-button"
              type="button"
              onClick={onCreateMainDecision}
            >
              <AppIcon name="create" />
              <span>Добавить главное решение</span>
            </button>
          )}
        </div>
      </section>

      <section className="decision-section" aria-labelledby="additional-decisions-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Поддержка плана</p>
            <h2 id="additional-decisions-title">Дополнительные решения</h2>
          </div>
          <span className="section-count">{additionalDecisions.length}</span>
        </div>
        {additionalDecisions.length === 0 ? (
          <div className="empty-additional">
            <AppIcon name="decisions" />
            <strong>Пока дополнительных решений нет</strong>
            <p>Добавьте вспомогательные решения для выполнения плана.</p>
            {canCreate ? (
              <button
                className="secondary-button"
                type="button"
                onClick={onCreateAdditionalDecision}
              >
                <AppIcon name="create" />
                Добавить решение
              </button>
            ) : null}
          </div>
        ) : (
          <div className="additional-decision-list">
            {additionalDecisions.map((decision) => (
              <DecisionCard
                key={decision.id.toString()}
                decision={decision}
                project={findProject(projects, decision.projectId?.toString() ?? null)}
                onOpen={onOpenDecision}
                onOpenProject={onOpenProject}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DecisionCard({
  decision,
  project,
  order,
  main = false,
  onOpen,
  onOpenProject,
}: {
  readonly decision: Decision;
  readonly project: Project | null;
  readonly order?: number;
  readonly main?: boolean;
  readonly onOpen: (decisionId: EntityId) => void;
  readonly onOpenProject: (projectId: string) => void;
}) {
  const title = formatDecisionTitle(decision);

  return (
    <article className={`decision-card decision-card-button${main ? ' main-decision' : ''}`}>
      <button
        className="today-decision-open-area"
        type="button"
        aria-label={`Открыть решение «${title}»`}
        onClick={() => onOpen(decision.id)}
      />
      {order === undefined ? null : (
        <span className="decision-order">{order.toString().padStart(2, '0')}</span>
      )}
      <span className="decision-card-copy">
        {main ? <span className="decision-card-eyebrow">Главное решение</span> : null}
        <span className="decision-card-title">{title}</span>
        {project === null ? null : (
          <button
            className="today-project-link decision-project-link"
            type="button"
            onClick={() => onOpenProject(project.id.toString())}
          >
            {project.title} →
          </button>
        )}
        {decision.expectedResult === null ? null : (
          <span className="decision-result">
            <small>Ожидаемый результат</small>
            <span>{decision.expectedResult.toString()}</span>
          </span>
        )}
      </span>
      <span className="decision-card-actions">
        <span className={`status-badge status-${decision.status}`}>
          {decisionStatusLabel(decision.status)}
        </span>
        <span className="decision-card-more" aria-hidden="true">
          ⋯
        </span>
      </span>
      <span className="decision-open-hint" aria-hidden="true">
        Открыть <span>→</span>
      </span>
    </article>
  );
}

function formatDecisionTitle(decision: Decision): string {
  const title = decision.title?.toString().trim();
  return title === undefined || title.length === 0 ? 'Решение без названия' : title;
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
