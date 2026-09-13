import { VoiceField } from '../voice-input/VoiceField';
import { VoiceTextArea } from '../voice-input/VoiceTextArea';
import { VoiceTextInput } from '../voice-input/VoiceTextInput';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react';
import type {
  CompleteCurrentDay,
  CompleteCurrentDayInput,
  CompleteCurrentDayResult,
  EveningReviewSnapshot,
  GetEveningReview,
  GetSpheres,
  ResolveOpenLoop,
  ReflectionApplicationService,
  ReflectionSession,
  SpheresSnapshot,
  TomorrowPlanService,
  PreparationService,
  RelaxationApplicationService,
  SleepCheckApplicationService,
  EveningCycleApplicationService,
  TomorrowPlanSnapshot,
} from '../../application';
import {
  ACTION_SESSION_STATUS,
  DECISION_KIND,
  type DayDate,
  type DecisionKind,
  type EveningCycle,
  type LifeAction,
  type OpenLoopEntityType,
  type OpenLoopResolutionKind,
  EVENING_CYCLE_STATE,
  EVENING_CYCLE_MODE,
  EVENING_CYCLE_COMPLETION,
  EVENING_MODE_REASON,
  type EveningCycleMode,
  REFLECTION_QUESTION_TYPE,
  type ReflectionQuestion,
  EntityId,
} from '../../domain';
import {
  decisionKindLabel,
  decisionStatusLabel,
  lifeActionStatusLabel,
} from '../entityPresentation';
import {
  buildCompleteCurrentDayInput,
  canCompleteAction,
  createEmptyTomorrowDecisionForm,
  createInitialEveningActionForms,
  createInitialTomorrowDecisionForms,
  getEveningReviewReadiness,
  isUnfinishedAction,
  updateEveningActionForm,
  validateEveningReviewSubmission,
  type EveningActionForms,
  type EveningActionResolutionKind,
  type TomorrowDecisionForm,
} from './EveningReviewPanelState';
import { SphereSelect } from '../components/SphereReference';
import { useSpheres } from '../components/sphereReferenceModel';
import { EveningVisualIcon } from '../components/EveningVisualIcon';
import { TomorrowComposer } from './TomorrowComposer';
import { PreparationPanel } from './PreparationPanel';
import { EveningRelaxationScene } from './EveningRelaxationScene';
import { EveningSleepCheckScene } from './EveningSleepCheckScene';
import { EveningCommandCenter } from './EveningCommandCenter';
import {
  buildEveningKpis,
  buildEveningNotStartedSceneModel,
  defaultEveningView,
  isEveningViewAvailable,
  selectEveningView,
  type SelectedEveningView,
} from './EveningCommandCenterPresentation';
import { EveningResolvingScene } from './EveningResolvingScene';
import {
  createResolutionFeedback,
  createTechnicalResolutionFeedback,
  tryBeginOpenLoopResolution,
  type EveningResolutionFeedback,
  type PendingOpenLoopResolution,
} from './EveningResolvingPresentation';
import { EveningReflectionScene } from './EveningReflectionScene';
import {
  EMPTY_REFLECTION_ANSWER_DRAFT,
  reflectionAnswerFromDraft,
  type ReflectionAnswerDraft,
} from './ReflectionAnswerDraft';
import { submitReflectionDraft } from './ReflectionSubmission';
import {
  EMPTY_EVENING_TOMORROW_PREVIEW,
  buildEveningRecoverySceneModel,
  buildEveningShutdownSceneModel,
  eveningTomorrowPreviewFromPlan,
  type EveningTomorrowPreview,
} from './EveningFinalPresentation';
import {
  EveningRecoveryScene,
  EveningShutdownScene,
  type ShutdownSceneError,
} from './EveningShutdownScene';
import { loadEveningReviewState, type EveningReviewLoadState } from './EveningReviewLoadState';
import {
  EveningReflectionHistoryScene,
  EveningTodayHistoryScene,
} from './EveningCompletedHistoryScenes';
import { buildLateEveningOffer, tryBeginEveningStart } from './EveningStartupPresentation';

interface EveningReviewPanelProps {
  readonly getEveningReview: Pick<GetEveningReview, 'execute'>;
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
  readonly getSpheres?: Pick<GetSpheres, 'execute'>;
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
  readonly reviewDate?: DayDate;
  readonly onClose: () => void;
  readonly onCompleted: (result: CompleteCurrentDayResult) => void;
}

type LoadState = EveningReviewLoadState;

const EMPTY_GET_SPHERES: Pick<GetSpheres, 'execute'> = {
  execute: async () => ({ active: [], archived: [] }),
};

export function EveningReviewPanel({
  getEveningReview,
  completeCurrentDay,
  eveningCycle,
  resolveOpenLoop,
  reflection,
  getSpheres,
  tomorrowPlan,
  preparation,
  relaxation,
  sleepCheck,
  reviewDate,
  onClose,
  onCompleted,
}: EveningReviewPanelProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [summary, setSummary] = useState('');
  const [sphereId, setSphereId] = useState<string | null>(null);
  const spheres = useSpheres(getSpheres ?? EMPTY_GET_SPHERES);
  const [actionForms, setActionForms] = useState<EveningActionForms>({});
  const [tomorrowForms, setTomorrowForms] = useState<readonly TomorrowDecisionForm[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [shutdownError, setShutdownError] = useState<ShutdownSceneError | null>(null);
  const [tomorrowPreview, setTomorrowPreview] = useState<EveningTomorrowPreview>(
    EMPTY_EVENING_TOMORROW_PREVIEW,
  );
  const [tomorrowPreviewDateKey, setTomorrowPreviewDateKey] = useState<string | null>(null);
  const [isCompletionTransitioning, setIsCompletionTransitioning] = useState(false);
  const [openLoopNotes, setOpenLoopNotes] = useState<Readonly<Record<string, string>>>({});
  const [resolutionFeedback, setResolutionFeedback] = useState<EveningResolutionFeedback | null>(
    null,
  );
  const [pendingResolution, setPendingResolution] = useState<PendingOpenLoopResolution | null>(
    null,
  );
  const [preferredOpenLoopKey, setPreferredOpenLoopKey] = useState<string | null>(null);
  const [reflectionSession, setReflectionSession] = useState<ReflectionSession | null>(null);
  const [reflectionDraft, setReflectionDraft] = useState<ReflectionAnswerDraft>(
    EMPTY_REFLECTION_ANSWER_DRAFT,
  );
  const [lastAnsweredQuestionId, setLastAnsweredQuestionId] = useState<string | null>(null);
  const [correctionAction, setCorrectionAction] = useState('');
  const [selectedEveningView, setSelectedEveningView] = useState<SelectedEveningView | null>(null);
  const [tomorrowPrepared, setTomorrowPrepared] = useState(false);
  const [skipDialogOpen, setSkipDialogOpen] = useState(false);
  const [skipReason, setSkipReason] = useState('');
  const nextTomorrowFormId = useRef(2);
  const completionRequestRef = useRef(false);
  const startRequestRef = useRef(false);
  const resolutionRequestRef = useRef(false);
  const lastResolutionRequestRef = useRef<{
    readonly entityType: OpenLoopEntityType;
    readonly entityId: string;
    readonly resolution: OpenLoopResolutionKind;
  } | null>(null);
  const previousPresentedCycleState = useRef<string | null>(null);

  const handleTomorrowSaved = useCallback(() => setTomorrowPrepared(true), []);

  const presentedCycleState =
    loadState.status === 'ready'
      ? (reflectionSession?.cycle ?? loadState.snapshot.cycle).state
      : null;

  useEffect(() => {
    if (presentedCycleState === null) return;
    const stateChanged = previousPresentedCycleState.current !== presentedCycleState;
    previousPresentedCycleState.current = presentedCycleState;
    setSelectedEveningView((current) => {
      if (
        stateChanged ||
        current === null ||
        !isEveningViewAvailable(presentedCycleState, current)
      ) {
        return defaultEveningView(presentedCycleState);
      }
      return current;
    });
  }, [presentedCycleState]);

  async function load(silent = false): Promise<boolean> {
    if (!silent) setLoadState({ status: 'loading' });
    setSubmitError(null);
    setShutdownError(null);
    const result = await loadEveningReviewState(getEveningReview, reviewDate);
    if (result.status === 'error') {
      if (silent) {
        setSubmitError('Изменение сохранено, но не удалось обновить вечерний центр.');
        return false;
      }
      setLoadState(result);
      return false;
    }
    try {
      const snapshot = result.snapshot;
      const adaptiveSession = await loadReflectionSession(snapshot);
      setActionForms(createInitialEveningActionForms(snapshot));
      setTomorrowForms(createInitialTomorrowDecisionForms(snapshot));
      applyReflectionSession(adaptiveSession);
      setLoadState({ status: 'ready', snapshot });
      return true;
    } catch {
      if (silent) {
        setSubmitError('Изменение сохранено, но не удалось обновить вечерний центр.');
        return false;
      }
      setLoadState({
        status: 'error',
        message: 'Не удалось загрузить данные вечернего контроля',
      });
      return false;
    }
  }

  const loadReflectionSession = useCallback(
    async (snapshot: EveningReviewSnapshot): Promise<ReflectionSession | null> => {
      if (reflection === undefined) return null;
      if (
        snapshot.cycle.state !== EVENING_CYCLE_STATE.reflecting &&
        snapshot.cycle.reflectionQuestions.length === 0
      ) {
        return null;
      }
      return reflection.getSession(snapshot.cycle.id);
    },
    [reflection],
  );

  const applyReflectionSession = useCallback((session: ReflectionSession | null): void => {
    setReflectionSession(session);
    setReflectionDraft(EMPTY_REFLECTION_ANSWER_DRAFT);
    if (session?.complete === true) setSummary(buildReflectionSummary(session));
  }, []);

  useEffect(() => {
    let isCancelled = false;

    void loadEveningReviewState(getEveningReview, reviewDate).then((result) => {
      if (isCancelled) return;
      if (result.status === 'error') {
        setLoadState(result);
        return;
      }
      const snapshot = result.snapshot;
      if (isCancelled) {
        return;
      }
      void loadReflectionSession(snapshot)
        .then((adaptiveSession) => {
          if (isCancelled) return;
          setActionForms(createInitialEveningActionForms(snapshot));
          setTomorrowForms(createInitialTomorrowDecisionForms(snapshot));
          applyReflectionSession(adaptiveSession);
          setLoadState({ status: 'ready', snapshot });
        })
        .catch(() => {
          if (!isCancelled) {
            setLoadState({ status: 'error', message: 'Не удалось загрузить осмысление дня' });
          }
        });
    });

    return () => {
      isCancelled = true;
    };
  }, [applyReflectionSession, getEveningReview, loadReflectionSession, reviewDate]);

  useEffect(() => {
    let isCancelled = false;
    const snapshot = loadState.status === 'ready' ? loadState.snapshot : null;
    const isFinalScene =
      snapshot !== null &&
      (snapshot.cycle.state === EVENING_CYCLE_STATE.shutdown ||
        snapshot.cycle.state === EVENING_CYCLE_STATE.completed);

    if (!isFinalScene || tomorrowPlan === undefined) {
      return () => {
        isCancelled = true;
      };
    }

    void tomorrowPlan
      .getByTargetDate(snapshot.tomorrowDate)
      .then((plan) => {
        if (!isCancelled) {
          setTomorrowPreview(eveningTomorrowPreviewFromPlan(plan));
          setTomorrowPreviewDateKey(snapshot.tomorrowDate.toString());
        }
      })
      .catch(() => {
        // Preview is secondary: the final scene stays usable if this read fails.
      });

    return () => {
      isCancelled = true;
    };
  }, [loadState, tomorrowPlan]);

  async function handleReflectionAnswer(): Promise<void> {
    const sessionState = reflectionSession;
    const question = sessionState?.currentQuestion;
    if (
      reflection === undefined ||
      sessionState === null ||
      question === null ||
      question === undefined ||
      isSubmitting
    ) {
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const session = await submitReflectionDraft(reflection, sessionState, reflectionDraft);
      if (session === null) return;
      setLastAnsweredQuestionId(question.id);
      applyReflectionSession(session);
    } catch (error: unknown) {
      setSubmitError(error instanceof Error ? error.message : 'Не удалось сохранить ответ.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReflectionSkip(): Promise<void> {
    const sessionState = reflectionSession;
    const question = sessionState?.currentQuestion;
    if (
      reflection === undefined ||
      sessionState === null ||
      question === null ||
      question === undefined ||
      isSubmitting
    ) {
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const session = await reflection.skip({
        cycleId: sessionState.cycle.id,
        questionId: question.id,
      });
      setLastAnsweredQuestionId(null);
      applyReflectionSession(session);
    } catch (error: unknown) {
      setSubmitError(error instanceof Error ? error.message : 'Не удалось пропустить вопрос.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateCorrection(): Promise<void> {
    if (
      reflection === undefined ||
      reflectionSession === null ||
      lastAnsweredQuestionId === null ||
      correctionAction.trim().length === 0 ||
      isSubmitting
    ) {
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await reflection.createCorrection({
        cycleId: reflectionSession.cycle.id,
        questionId: lastAnsweredQuestionId,
        action: correctionAction,
      });
      setCorrectionAction('');
      setLastAnsweredQuestionId(null);
    } catch (error: unknown) {
      setSubmitError(
        error instanceof Error ? error.message : 'Не удалось сохранить корректировку.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function updateActionForm(
    actionId: string,
    patch: Parameters<typeof updateEveningActionForm>[2],
  ): void {
    setActionForms((current) => updateEveningActionForm(current, actionId, patch));
    setSubmitError(null);
  }

  function addTomorrowDecision(): void {
    const formId = `tomorrow-decision-${nextTomorrowFormId.current}`;
    nextTomorrowFormId.current += 1;
    setTomorrowForms((current) => [...current, createEmptyTomorrowDecisionForm(formId)]);
    setSubmitError(null);
  }

  function updateTomorrowDecision(
    formId: string,
    patch: Partial<Omit<TomorrowDecisionForm, 'formId'>>,
  ): void {
    setTomorrowForms((current) =>
      current.map((form) => (form.formId === formId ? { ...form, ...patch } : form)),
    );
    setSubmitError(null);
  }

  function removeTomorrowDecision(formId: string): void {
    setTomorrowForms((current) => current.filter((form) => form.formId !== formId));
    setSubmitError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSubmitting || loadState.status !== 'ready') {
      return;
    }

    const validationError = validateEveningReviewSubmission(
      loadState.snapshot,
      summary,
      actionForms,
      tomorrowForms,
    );
    if (validationError !== null) {
      setSubmitError(validationError);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await completeCurrentDay.execute(
        buildCompleteCurrentDayInput(
          loadState.snapshot,
          summary,
          actionForms,
          tomorrowForms,
          sphereId === null ? null : EntityId.create(sphereId),
        ),
        reviewDate,
      );
      if (!result.ok) {
        setSubmitError(result.error.message);
        return;
      }
      onCompleted(result.value);
    } catch {
      setSubmitError('Не удалось завершить день. Данные не были изменены.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleShutdownComplete(): Promise<void> {
    if (completionRequestRef.current || isSubmitting || loadState.status !== 'ready') return;
    completionRequestRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    setShutdownError(null);
    try {
      const result = await completeCurrentDay.execute(
        {
          summary,
          actionResolutions: [],
          tomorrowDecisions: [],
        },
        loadState.snapshot.cycle.dateKey,
      );
      if (!result.ok) {
        setShutdownError({ kind: 'blocking', message: result.error.message });
        return;
      }
      onCompleted(result.value);
      setIsCompletionTransitioning(true);
      await waitForCompletionTransition();
      await load(true);
    } catch {
      setShutdownError({
        kind: 'technical',
        message: 'Не удалось завершить день. Данные не потеряны.',
      });
    } finally {
      completionRequestRef.current = false;
      setIsCompletionTransitioning(false);
      setIsSubmitting(false);
    }
  }

  async function handleModeChange(mode: EveningCycleMode): Promise<void> {
    if (eveningCycle === undefined || loadState.status !== 'ready' || isSubmitting) return;
    if (
      mode === EVENING_CYCLE_MODE.emergency &&
      !window.confirm(
        'Перейти к позднему завершению? LifeOS сохранит спокойный минимум, остальное можно уточнить утром.',
      )
    ) {
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await eveningCycle.selectMode(
        loadState.snapshot.cycle.dateKey,
        mode,
        EVENING_MODE_REASON.userSelected,
      );
      await load();
    } catch (error: unknown) {
      setSubmitError(error instanceof Error ? error.message : 'Не удалось переключить режим.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStartEvening(choice: EveningStartChoice): Promise<void> {
    if (
      eveningCycle === undefined ||
      loadState.status !== 'ready' ||
      loadState.snapshot.cycle.state !== EVENING_CYCLE_STATE.notStarted ||
      !tryBeginEveningStart(startRequestRef)
    ) {
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await executeEveningStartChoice(eveningCycle, loadState.snapshot.currentDate, choice);
      await load();
    } catch (error: unknown) {
      setSubmitError(error instanceof Error ? error.message : 'Не удалось начать вечер.');
    } finally {
      startRequestRef.current = false;
      setIsSubmitting(false);
    }
  }

  async function handleSkipEvening(): Promise<void> {
    const input = buildEveningSkipCompletionInput('CONFIRM', skipReason);
    if (
      input === null ||
      loadState.status !== 'ready' ||
      isSubmitting ||
      completionRequestRef.current
    ) {
      return;
    }
    completionRequestRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await completeCurrentDay.execute(input, loadState.snapshot.cycle.dateKey);
      if (!result.ok) {
        setSubmitError(result.error.message);
        return;
      }
      setSkipDialogOpen(false);
      setSkipReason('');
      onCompleted(result.value);
      await load(true);
    } catch {
      setSubmitError('Не удалось пропустить вечер. Данные не были изменены.');
    } finally {
      completionRequestRef.current = false;
      setIsSubmitting(false);
    }
  }

  async function handleEmergencyPreparationSkip(): Promise<void> {
    if (eveningCycle === undefined || loadState.status !== 'ready' || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await skipEmergencyPreparation(eveningCycle, loadState.snapshot.cycle.dateKey, load);
    } catch (error: unknown) {
      setSubmitError(error instanceof Error ? error.message : 'Не удалось продолжить завершение.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleOpenLoopResolution(
    entityType: OpenLoopEntityType,
    entityId: string,
    resolution: OpenLoopResolutionKind,
  ): Promise<void> {
    if (
      resolveOpenLoop === undefined ||
      loadState.status !== 'ready' ||
      isSubmitting ||
      !tryBeginOpenLoopResolution(resolutionRequestRef)
    ) {
      return;
    }
    const request = { entityType, entityId, resolution };
    lastResolutionRequestRef.current = request;
    setPendingResolution({ key: `${entityType}:${entityId}`, resolution });
    setIsSubmitting(true);
    setSubmitError(null);
    setResolutionFeedback(null);
    try {
      const note = openLoopNotes[`${entityType}:${entityId}`] ?? '';
      const result = await resolveOpenLoop.execute({
        dateKey: loadState.snapshot.currentDate,
        entityType,
        entityId: EntityId.create(entityId),
        resolution,
        actualResult: note,
        reason: note,
      });
      if (!result.ok) {
        setResolutionFeedback(createResolutionFeedback(result.error));
        return;
      }
      if (result.value.requiresRevision) {
        setResolutionFeedback({
          kind: 'business',
          message: 'Измените элемент в его карточке, затем вернитесь к разбору.',
        });
        return;
      }
      setPreferredOpenLoopKey(null);
      const refreshed = await load(true);
      if (!refreshed) setResolutionFeedback(createTechnicalResolutionFeedback());
    } catch {
      setResolutionFeedback(createTechnicalResolutionFeedback());
    } finally {
      resolutionRequestRef.current = false;
      setPendingResolution(null);
      setIsSubmitting(false);
    }
  }

  function handleResolveOpenAction(actionIds: readonly string[]): void {
    if (loadState.status !== 'ready') return;
    const target = actionIds.find((actionId) =>
      loadState.snapshot.openLoops?.items.some(
        (item) =>
          item.entityType === 'LIFE_ACTION' &&
          item.entityId === actionId &&
          item.resolution === null,
      ),
    );
    if (target === undefined) {
      setResolutionFeedback({
        kind: 'business',
        message: 'Откройте незакрытое действие в разделе «Действия», затем вернитесь к Решению.',
      });
      return;
    }
    setPreferredOpenLoopKey(`LIFE_ACTION:${target}`);
    setResolutionFeedback(null);
  }

  function handleResolutionRetry(): void {
    const request = lastResolutionRequestRef.current;
    if (request === null) return;
    void handleOpenLoopResolution(request.entityType, request.entityId, request.resolution);
  }

  if (loadState.status === 'loading') {
    return (
      <EveningReviewFrame title="Вечерний контроль" onClose={onClose}>
        <p className="page-message" role="status">
          Проверяем день, действия и рабочие сессии…
        </p>
      </EveningReviewFrame>
    );
  }

  if (loadState.status === 'error') {
    return (
      <EveningReviewFrame title="Вечерний контроль" onClose={onClose}>
        <section className="page-message page-error" role="alert">
          <p>{loadState.message}</p>
          <button className="secondary-button" type="button" onClick={() => void load()}>
            Повторить
          </button>
        </section>
      </EveningReviewFrame>
    );
  }

  const activeCycle = reflectionSession?.cycle ?? loadState.snapshot.cycle;
  const activeCycleState = activeCycle.state;
  const activeDomainView = defaultEveningView(activeCycleState);
  const activeSelectedView = selectedEveningView ?? defaultEveningView(activeCycleState);
  const isTomorrowPreviewLoaded =
    tomorrowPreviewDateKey === loadState.snapshot.tomorrowDate.toString();
  const activeTomorrowPreview = isTomorrowPreviewLoaded
    ? tomorrowPreview
    : EMPTY_EVENING_TOMORROW_PREVIEW;
  const lateOfferTarget =
    loadState.snapshot.eveningRitualSettings?.notificationEnabled === false
      ? null
      : (loadState.snapshot.routineSummary?.targetSleepTime ?? null);
  const lateOffer = loadState.snapshot.isRecoveryReview
    ? null
    : buildLateEveningOffer(new Date(), lateOfferTarget);
  const renderScene = (scene: ReactNode) => (
    <EveningCommandCenter
      cycle={activeCycle}
      isRecoveryReview={loadState.snapshot.isRecoveryReview}
      modeChangeDisabled={
        isSubmitting ||
        eveningCycle === undefined ||
        activeCycleState === EVENING_CYCLE_STATE.completed
      }
      kpis={buildEveningKpis(loadState.snapshot, reflectionSession, tomorrowPrepared)}
      onModeChange={(mode) => void handleModeChange(mode)}
      selectedView={activeSelectedView}
      onSelectView={(requested) =>
        setSelectedEveningView((current) =>
          selectEveningView(activeCycleState, current ?? activeSelectedView, requested),
        )
      }
      onClose={onClose}
      isTransitioning={isCompletionTransitioning}
    >
      {scene}
    </EveningCommandCenter>
  );

  if (activeSelectedView !== activeDomainView) {
    if (activeSelectedView === 'today') {
      return renderScene(<EveningTodayHistoryScene snapshot={loadState.snapshot} />);
    }
    if (activeSelectedView === 'reflection') {
      return renderScene(<EveningReflectionHistoryScene session={reflectionSession} />);
    }
    if (activeSelectedView === 'tomorrow') {
      return renderScene(
        tomorrowPlan === undefined ? (
          <EveningUnavailableHistoryScene title="Завтра" />
        ) : (
          <TomorrowComposer
            cycleDate={loadState.snapshot.cycle.dateKey}
            service={tomorrowPlan}
            onPrepared={() => setSelectedEveningView(activeDomainView)}
            onClose={onClose}
            mode={activeCycle.mode}
            completedActionLabel="Вернуться к текущему этапу"
            historyView
            embedded
          />
        ),
      );
    }
    if (activeSelectedView === 'preparation') {
      return renderScene(
        preparation === undefined ? (
          <EveningUnavailableHistoryScene title="Среда" />
        ) : (
          <PreparationPanel
            cycleDate={loadState.snapshot.cycle.dateKey}
            service={preparation}
            onContinued={() => {
              setSelectedEveningView(activeDomainView);
              void load(true);
            }}
            onClose={onClose}
            mode={activeCycle.mode}
            completedReview
            embedded
          />
        ),
      );
    }
    if (activeSelectedView === 'relaxation') {
      return renderScene(
        relaxation === undefined ? (
          <EveningUnavailableHistoryScene title="Расслабление" />
        ) : (
          <EveningRelaxationScene
            cycleDate={loadState.snapshot.cycle.dateKey}
            service={relaxation}
            {...(sleepCheck === undefined ? {} : { sleepCheck })}
            onContinued={() => setSelectedEveningView(activeDomainView)}
            readOnly
          />
        ),
      );
    }
    if (activeSelectedView === 'sleep') {
      return renderScene(
        sleepCheck === undefined ? (
          <EveningUnavailableHistoryScene title="Сон" />
        ) : (
          <EveningSleepCheckScene
            cycleDate={loadState.snapshot.cycle.dateKey}
            service={sleepCheck}
            onContinued={() => setSelectedEveningView(activeDomainView)}
            readOnly
          />
        ),
      );
    }
    if (activeSelectedView === 'shutdown') {
      return renderScene(
        <EveningShutdownScene
          model={buildEveningShutdownSceneModel(
            loadState.snapshot,
            activeTomorrowPreview,
            isTomorrowPreviewLoaded,
          )}
          isSubmitting={false}
          error={null}
          readOnly
          onComplete={() => undefined}
          onResolveBlocker={onClose}
        />,
      );
    }
  }

  if (activeCycleState === EVENING_CYCLE_STATE.notStarted) {
    return renderScene(
      <EveningNotStartedScene
        snapshot={loadState.snapshot}
        busy={isSubmitting}
        error={submitError}
        startDisabled={eveningCycle === undefined}
        lateOfferMinutes={lateOffer?.minutesRemaining ?? null}
        allowConsciousSkip={loadState.snapshot.eveningRitualSettings?.allowConsciousSkip ?? true}
        onStart={() => void handleStartEvening('NORMAL')}
        onStartShort={() => void handleStartEvening('SHORT')}
        onOpenSkip={() => {
          setSubmitError(null);
          setSkipDialogOpen(true);
        }}
        skipDialog={
          skipDialogOpen ? (
            <EveningSkipDialog
              reason={skipReason}
              busy={isSubmitting}
              onReasonChange={setSkipReason}
              onConfirm={() => void handleSkipEvening()}
              onCancel={() => {
                setSkipDialogOpen(false);
                setSkipReason('');
              }}
            />
          ) : null
        }
      />,
    );
  }

  if (activeCycleState === EVENING_CYCLE_STATE.completed) {
    if (activeCycle.completion === EVENING_CYCLE_COMPLETION.skipped) {
      return renderScene(<EveningSkippedScene cycle={activeCycle} onClose={onClose} />);
    }
    return renderScene(
      <EveningRecoveryScene
        model={buildEveningRecoverySceneModel(loadState.snapshot, activeTomorrowPreview)}
        onClose={onClose}
      />,
    );
  }

  if (activeCycleState === EVENING_CYCLE_STATE.shutdown) {
    return renderScene(
      <EveningShutdownScene
        model={buildEveningShutdownSceneModel(
          loadState.snapshot,
          activeTomorrowPreview,
          isTomorrowPreviewLoaded,
        )}
        isSubmitting={isSubmitting}
        error={shutdownError}
        onComplete={() => void handleShutdownComplete()}
        onResolveBlocker={onClose}
      />,
    );
  }

  if (activeCycleState === EVENING_CYCLE_STATE.relaxing) {
    return renderScene(
      relaxation === undefined ? (
        <EveningUnavailableHistoryScene title="Расслабление" />
      ) : (
        <EveningRelaxationScene
          cycleDate={loadState.snapshot.cycle.dateKey}
          service={relaxation}
          {...(sleepCheck === undefined ? {} : { sleepCheck })}
          onContinued={() => void load(true)}
        />
      ),
    );
  }

  if (activeCycleState === EVENING_CYCLE_STATE.sleepCheck) {
    return renderScene(
      sleepCheck === undefined ? (
        <EveningUnavailableHistoryScene title="Сон" />
      ) : (
        <EveningSleepCheckScene
          cycleDate={loadState.snapshot.cycle.dateKey}
          service={sleepCheck}
          onContinued={() => void load(true)}
        />
      ),
    );
  }

  if (activeCycleState === EVENING_CYCLE_STATE.planningTomorrow && tomorrowPlan !== undefined) {
    if (activeCycle.mode === EVENING_CYCLE_MODE.emergency) {
      return renderScene(
        <EmergencyTomorrowPanel
          cycleDate={loadState.snapshot.cycle.dateKey}
          service={tomorrowPlan}
          onPrepared={() => void load()}
          onClose={onClose}
          embedded
        />,
      );
    }
    return renderScene(
      <TomorrowComposer
        cycleDate={loadState.snapshot.cycle.dateKey}
        service={tomorrowPlan}
        onPrepared={() => void load()}
        onSaved={handleTomorrowSaved}
        onClose={onClose}
        mode={activeCycle.mode}
        completedActionLabel="Перейти к подготовке →"
        embedded
      />,
    );
  }

  if (activeCycleState === EVENING_CYCLE_STATE.preparing && preparation !== undefined) {
    return renderScene(
      <EveningPreparationScene
        cycle={activeCycle}
        preparation={preparation}
        isSubmitting={isSubmitting}
        submitError={submitError}
        onEmergencyContinue={() => void handleEmergencyPreparationSkip()}
        onPreparationContinued={() => void load()}
        onClose={onClose}
        embedded
      />,
    );
  }

  return renderScene(
    <EveningReviewPanelView
      snapshot={loadState.snapshot}
      summary={summary}
      spheres={spheres}
      sphereId={sphereId}
      onSphereChange={setSphereId}
      actionForms={actionForms}
      tomorrowForms={tomorrowForms}
      isSubmitting={isSubmitting}
      error={submitError}
      onClose={onClose}
      onSummaryChange={(value) => {
        setSummary(value);
        setSubmitError(null);
      }}
      reflectionSession={reflectionSession}
      adaptiveReflectionEnabled={reflection !== undefined}
      reflectionDraft={reflectionDraft}
      correctionAction={correctionAction}
      lastAnsweredQuestionId={lastAnsweredQuestionId}
      onReflectionDraftChange={setReflectionDraft}
      onReflectionAnswer={() => void handleReflectionAnswer()}
      onReflectionSkip={() => void handleReflectionSkip()}
      onCorrectionActionChange={setCorrectionAction}
      onCreateCorrection={() => void handleCreateCorrection()}
      onActionKindChange={(actionId, kind) => updateActionForm(actionId, { kind })}
      onActionActualResultChange={(actionId, actualResult) =>
        updateActionForm(actionId, { actualResult })
      }
      onActionDateChange={(actionId, newPlannedDate) =>
        updateActionForm(actionId, { newPlannedDate })
      }
      onActionReasonChange={(actionId, reason) => updateActionForm(actionId, { reason })}
      openLoopNotes={openLoopNotes}
      resolutionFeedback={resolutionFeedback}
      pendingResolution={pendingResolution}
      preferredOpenLoopKey={preferredOpenLoopKey}
      onOpenLoopNoteChange={(key, value) =>
        setOpenLoopNotes((current) => ({ ...current, [key]: value }))
      }
      onResolveOpenLoop={(entityType, entityId, resolution) =>
        void handleOpenLoopResolution(entityType, entityId, resolution)
      }
      onResolveOpenAction={handleResolveOpenAction}
      onResolutionRetry={handleResolutionRetry}
      onAddTomorrowDecision={addTomorrowDecision}
      onUpdateTomorrowDecision={updateTomorrowDecision}
      onRemoveTomorrowDecision={removeTomorrowDecision}
      onSubmit={(event) => void handleSubmit(event)}
      onContinueResolving={() => void load(true)}
      embedded
    />,
  );
}

interface EveningNotStartedSceneProps {
  readonly snapshot: EveningReviewSnapshot;
  readonly busy: boolean;
  readonly error: string | null;
  readonly startDisabled: boolean;
  readonly lateOfferMinutes: number | null;
  readonly allowConsciousSkip?: boolean;
  readonly onStart: () => void;
  readonly onStartShort: () => void;
  readonly onOpenSkip: () => void;
  readonly skipDialog?: ReactNode;
}

export function EveningNotStartedScene({
  snapshot,
  busy,
  error,
  startDisabled,
  lateOfferMinutes,
  allowConsciousSkip = true,
  onStart,
  onStartShort,
  onOpenSkip,
  skipDialog,
}: EveningNotStartedSceneProps) {
  const model = buildEveningNotStartedSceneModel(snapshot);

  return (
    <section className="evening-e9-scene evening-not-started" aria-labelledby="evening-start-title">
      <article className="evening-not-started-card">
        <div className="evening-not-started-hero">
          <span className="evening-not-started-moon" aria-hidden="true">
            <EveningVisualIcon name="moon" size={34} />
          </span>
          <div className="evening-not-started-hero-copy">
            <h3 id="evening-start-title">{model.title}</h3>
            <p>{model.description}</p>
          </div>
        </div>

        <footer className="evening-not-started-cta-zone">
          {error === null ? null : (
            <p className="form-error evening-not-started-error" role="alert">
              {error}
            </p>
          )}
          {lateOfferMinutes === null ? (
            <button
              className="primary-button evening-not-started-primary"
              type="button"
              aria-busy={busy}
              disabled={busy || startDisabled}
              onClick={onStart}
            >
              <span>{busy ? 'Начинаем…' : 'Начать вечер'}</span>
              {busy ? (
                <span className="evening-not-started-loading-indicator" aria-hidden="true" />
              ) : (
                <EveningVisualIcon name="arrow-right" size={20} />
              )}
            </button>
          ) : (
            <aside className="evening-r7-short-offer" aria-label="Выбор режима вечера">
              <p>До сна осталось {lateOfferMinutes} минут. Перейти в короткий режим?</p>
              <div className="evening-r7-short-actions">
                <button
                  className="primary-button"
                  type="button"
                  disabled={busy || startDisabled}
                  onClick={onStartShort}
                >
                  Короткий
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={busy || startDisabled}
                  onClick={onStart}
                >
                  Обычный
                </button>
              </div>
            </aside>
          )}
          <p className="evening-not-started-duration">
            <EveningVisualIcon name="clock" size={16} />
            <span>≈ 10–15 минут</span>
          </p>
          {allowConsciousSkip ? (
            <button
              className="text-button evening-r7-skip-trigger"
              type="button"
              disabled={busy}
              onClick={onOpenSkip}
            >
              Пропустить вечерний ритуал
            </button>
          ) : null}
        </footer>
      </article>
      {skipDialog}
    </section>
  );
}

export type EveningStartChoice = 'SHORT' | 'NORMAL';

export async function executeEveningStartChoice(
  service: Pick<EveningCycleApplicationService, 'start' | 'startShort'>,
  dateKey: DayDate,
  choice: EveningStartChoice,
): Promise<void> {
  if (choice === 'SHORT') {
    await service.startShort(dateKey);
    return;
  }
  await service.start(dateKey);
}

export type EveningSkipDecision = 'CONFIRM' | 'CANCEL';

export function buildEveningSkipCompletionInput(
  decision: EveningSkipDecision,
  reason: string,
): CompleteCurrentDayInput | null {
  if (decision === 'CANCEL') return null;
  return {
    skipEvening: true,
    summary: reason.trim(),
    actionResolutions: [],
    tomorrowDecisions: [],
  };
}

export function EveningSkipDialog({
  reason,
  busy,
  onReasonChange,
  onConfirm,
  onCancel,
}: {
  readonly reason: string;
  readonly busy: boolean;
  readonly onReasonChange: (reason: string) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  return (
    <div className="evening-r7-dialog-backdrop">
      <section
        className="evening-r7-skip-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="evening-r7-skip-title"
      >
        <p className="section-kicker gold">Осознанный выбор</p>
        <h3 id="evening-r7-skip-title">Пропустить вечерний ритуал сегодня?</h3>
        <p>Пропуск сохранится в истории без ошибки и штрафа.</p>
        <VoiceField>
          <span>Причина (необязательно)</span>
          <VoiceTextArea
            value={reason}
            maxLength={500}
            rows={3}
            disabled={busy}
            onValueChange={(value) => onReasonChange(value)}
          />
        </VoiceField>
        <div className="evening-r7-dialog-actions">
          <button className="secondary-button" type="button" disabled={busy} onClick={onConfirm}>
            {busy ? 'Сохраняем…' : 'Пропустить'}
          </button>
          <button className="text-button" type="button" disabled={busy} onClick={onCancel}>
            Отмена
          </button>
        </div>
      </section>
    </div>
  );
}

export function EveningSkippedScene({
  cycle,
  onClose,
}: {
  readonly cycle: EveningCycle;
  readonly onClose: () => void;
}) {
  return (
    <section className="evening-e9-scene evening-r7-skipped-scene" data-completion="skipped">
      <article className="evening-e9-card evening-r7-skipped-card">
        <p className="section-kicker">Сегодня</p>
        <h3>Вечерний ритуал пропущен</h3>
        <p>Это осознанный пропуск, а не ошибка. LifeOS сохранила его в истории без штрафа.</p>
        {cycle.skipReason === null ? null : (
          <p className="evening-r7-skip-reason">
            <span>Причина</span>
            <strong>{cycle.skipReason}</strong>
          </p>
        )}
        <button className="secondary-button" type="button" onClick={onClose}>
          Закрыть
        </button>
      </article>
    </section>
  );
}

function EveningUnavailableHistoryScene({ title }: { readonly title: string }) {
  return (
    <section className="evening-e9-scene evening-history-scene">
      <div className="evening-e9-card evening-e9-empty-card">
        <p className="section-kicker gold">{title}</p>
        <h3>Сохранённые данные временно недоступны.</h3>
        <p>Состояние завершённого вечернего цикла не изменено.</p>
      </div>
    </section>
  );
}

type EmergencyPlanLoad =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'error'; message: string }>
  | Readonly<{ status: 'ready'; snapshot: TomorrowPlanSnapshot }>;

function EmergencyTomorrowPanel({
  cycleDate,
  service,
  onPrepared,
  onClose,
  embedded,
}: {
  readonly cycleDate: DayDate;
  readonly service: Pick<TomorrowPlanService, 'getOrCreate' | 'setFirstAttentionItem' | 'complete'>;
  readonly onPrepared: () => void;
  readonly onClose: () => void;
  readonly embedded: boolean;
}) {
  const [load, setLoad] = useState<EmergencyPlanLoad>({ status: 'loading' });
  const [attention, setAttention] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void service
      .getOrCreate(cycleDate)
      .then((snapshot) => {
        if (cancelled) return;
        setAttention(snapshot.plan.firstAttentionItem ?? '');
        setLoad({ status: 'ready', snapshot });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoad({
            status: 'error',
            message: error instanceof Error ? error.message : 'Не удалось загрузить план.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cycleDate, service]);

  async function completeMinimalPlan(): Promise<void> {
    if (load.status !== 'ready' || busy) return;
    setBusy(true);
    try {
      if (attention.trim() !== (load.snapshot.plan.firstAttentionItem ?? '')) {
        await service.setFirstAttentionItem(cycleDate, attention.trim() || null);
      }
      await service.complete(cycleDate);
      onPrepared();
    } catch (error: unknown) {
      setLoad({
        status: 'error',
        message: error instanceof Error ? error.message : 'Не удалось сохранить минимум.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <EveningReviewFrame title="Завтра" onClose={onClose} embedded={embedded}>
      <section className="evening-e9-card shutdown-panel emergency-tomorrow-scene">
        <p className="section-kicker gold">Позднее завершение · Завтра</p>
        <h3>Сохраним только необходимое.</h3>
        {load.status === 'loading' ? <p>Загружаем безопасный минимум…</p> : null}
        {load.status === 'error' ? (
          <p className="form-error" role="alert">
            {load.message}
          </p>
        ) : null}
        {load.status === 'ready' ? (
          <>
            <p>Остальной план можно уточнить утром.</p>
            {load.snapshot.primaryDecision === null ? null : (
              <div className="emergency-tomorrow-primary">
                <span>Главное</span>
                <strong>{load.snapshot.primaryDecision.title.toString()}</strong>
              </div>
            )}
            <VoiceField>
              <span>
                {load.snapshot.primaryDecision === null
                  ? 'Главное на завтра'
                  : 'Первый объект внимания — при необходимости'}
              </span>
              <VoiceTextInput
                value={attention}
                onValueChange={(value) => setAttention(value)}
                placeholder="Например, продолжить LifeOS"
              />
            </VoiceField>
            <button
              className="primary-button"
              type="button"
              disabled={
                busy || (load.snapshot.primaryDecision === null && attention.trim().length === 0)
              }
              onClick={() => void completeMinimalPlan()}
            >
              {busy ? 'Сохраняем…' : 'Сохранить и продолжить'}
            </button>
          </>
        ) : null}
      </section>
    </EveningReviewFrame>
  );
}

export async function skipEmergencyPreparation(
  eveningCycle: Pick<EveningCycleApplicationService, 'skipPreparation'>,
  cycleDate: DayDate,
  reload: () => Promise<unknown>,
): Promise<void> {
  await eveningCycle.skipPreparation(cycleDate);
  await reload();
}

export function EveningPreparationScene({
  cycle,
  preparation,
  isSubmitting,
  submitError,
  onEmergencyContinue,
  onPreparationContinued,
  onClose,
  embedded,
}: {
  readonly cycle: EveningCycle;
  readonly preparation: Pick<
    PreparationService,
    'getOrGenerate' | 'completeItem' | 'skipItem' | 'continueToRelaxation' | 'configureRequiredCore'
  >;
  readonly isSubmitting: boolean;
  readonly submitError: string | null;
  readonly onEmergencyContinue: () => void;
  readonly onPreparationContinued: () => void;
  readonly onClose: () => void;
  readonly embedded: boolean;
}) {
  if (cycle.mode === EVENING_CYCLE_MODE.emergency) {
    return (
      <EmergencyPreparationSkipPanel
        busy={isSubmitting}
        error={submitError}
        onContinue={onEmergencyContinue}
        onClose={onClose}
        embedded={embedded}
      />
    );
  }
  return (
    <PreparationPanel
      cycleDate={cycle.dateKey}
      service={preparation}
      onContinued={onPreparationContinued}
      onClose={onClose}
      mode={cycle.mode}
      embedded={embedded}
    />
  );
}

export function EmergencyPreparationSkipPanel({
  busy,
  error,
  onContinue,
  onClose,
  embedded,
}: {
  readonly busy: boolean;
  readonly error: string | null;
  readonly onContinue: () => void;
  readonly onClose: () => void;
  readonly embedded: boolean;
}) {
  return (
    <EveningReviewFrame title="Позднее завершение" onClose={onClose} embedded={embedded}>
      <section className="evening-e9-card shutdown-panel emergency-preparation-scene">
        <p className="section-kicker gold">Позднее завершение · Среда</p>
        <h3>Сохраним спокойный минимум.</h3>
        <p>Подготовка среды не будет придумана автоматически. Её можно уточнить утром.</p>
        {error === null ? null : (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button" type="button" disabled={busy} onClick={onContinue}>
          {busy ? 'Сохраняем…' : 'Перейти к расслаблению'}
        </button>
      </section>
    </EveningReviewFrame>
  );
}

interface EveningReviewPanelViewProps {
  readonly snapshot: EveningReviewSnapshot;
  readonly summary: string;
  readonly spheres?: SpheresSnapshot;
  readonly sphereId?: string | null;
  readonly onSphereChange?: (sphereId: string | null) => void;
  readonly actionForms: EveningActionForms;
  readonly tomorrowForms: readonly TomorrowDecisionForm[];
  readonly isSubmitting: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onSummaryChange: (value: string) => void;
  readonly reflectionSession?: ReflectionSession | null;
  readonly adaptiveReflectionEnabled?: boolean;
  readonly reflectionDraft?: ReflectionAnswerDraft;
  readonly correctionAction?: string;
  readonly lastAnsweredQuestionId?: string | null;
  readonly onReflectionDraftChange?: (draft: ReflectionAnswerDraft) => void;
  readonly onReflectionAnswer?: () => void;
  readonly onReflectionSkip?: () => void;
  readonly onCorrectionActionChange?: (value: string) => void;
  readonly onCreateCorrection?: () => void;
  readonly onActionKindChange: (actionId: string, kind: EveningActionResolutionKind) => void;
  readonly onActionActualResultChange: (actionId: string, value: string) => void;
  readonly onActionDateChange: (actionId: string, value: string) => void;
  readonly onActionReasonChange: (actionId: string, value: string) => void;
  readonly openLoopNotes?: Readonly<Record<string, string>>;
  readonly resolutionFeedback?: EveningResolutionFeedback | null;
  readonly pendingResolution?: PendingOpenLoopResolution | null;
  readonly preferredOpenLoopKey?: string | null;
  readonly onOpenLoopNoteChange?: (key: string, value: string) => void;
  readonly onResolveOpenLoop?: (
    entityType: OpenLoopEntityType,
    entityId: string,
    resolution: OpenLoopResolutionKind,
  ) => void;
  readonly onResolveOpenAction?: (actionIds: readonly string[]) => void;
  readonly onResolutionRetry?: () => void;
  readonly onAddTomorrowDecision: () => void;
  readonly onUpdateTomorrowDecision: (
    formId: string,
    patch: Partial<Omit<TomorrowDecisionForm, 'formId'>>,
  ) => void;
  readonly onRemoveTomorrowDecision: (formId: string) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onContinueResolving?: () => void;
  readonly embedded?: boolean;
}

export function EveningReviewPanelView({
  snapshot,
  summary,
  spheres = { active: [], archived: [] },
  sphereId = null,
  onSphereChange = () => undefined,
  actionForms,
  tomorrowForms,
  isSubmitting,
  error,
  onClose,
  onSummaryChange,
  reflectionSession,
  adaptiveReflectionEnabled = false,
  reflectionDraft = EMPTY_REFLECTION_ANSWER_DRAFT,
  correctionAction = '',
  lastAnsweredQuestionId = null,
  onReflectionDraftChange,
  onReflectionAnswer,
  onReflectionSkip,
  onCorrectionActionChange,
  onCreateCorrection,
  onActionKindChange,
  onActionActualResultChange,
  onActionDateChange,
  onActionReasonChange,
  openLoopNotes = {},
  resolutionFeedback = null,
  pendingResolution = null,
  preferredOpenLoopKey = null,
  onOpenLoopNoteChange,
  onResolveOpenLoop,
  onResolveOpenAction,
  onResolutionRetry,
  onAddTomorrowDecision,
  onUpdateTomorrowDecision,
  onRemoveTomorrowDecision,
  onSubmit,
  onContinueResolving,
  embedded = false,
}: EveningReviewPanelViewProps) {
  const unfinishedActions = snapshot.lifeActions.filter(isUnfinishedAction);
  const completedActions = snapshot.lifeActions.filter((action) => !isUnfinishedAction(action));
  const sessionBlock = snapshot.unfinishedSession;
  const readiness = getEveningReviewReadiness(snapshot, summary, actionForms, tomorrowForms);
  const hasRecordedActivity =
    snapshot.decisions.length > 0 ||
    snapshot.lifeActions.length > 0 ||
    snapshot.actionSessions.length > 0 ||
    (snapshot.routineSummary?.plannedCount ?? 0) > 0;

  if (
    embedded &&
    (snapshot.cycle.state === EVENING_CYCLE_STATE.windingDown ||
      snapshot.cycle.state === EVENING_CYCLE_STATE.resolving)
  ) {
    return (
      <EveningResolvingScene
        snapshot={snapshot}
        notes={openLoopNotes}
        disabled={isSubmitting || onResolveOpenLoop === undefined}
        error={error}
        feedback={resolutionFeedback}
        pendingResolution={pendingResolution}
        preferredKey={preferredOpenLoopKey}
        onNoteChange={(key, value) => onOpenLoopNoteChange?.(key, value)}
        onResolve={(entityType, entityId, resolution) =>
          onResolveOpenLoop?.(entityType, entityId, resolution)
        }
        onReturnToWork={onClose}
        onContinue={() => onContinueResolving?.()}
        onResolveOpenAction={(actionIds) => onResolveOpenAction?.(actionIds)}
        onRetry={() => onResolutionRetry?.()}
      />
    );
  }

  if (
    embedded &&
    reflectionSession !== undefined &&
    reflectionSession !== null &&
    reflectionSession.cycle.state === EVENING_CYCLE_STATE.reflecting
  ) {
    return (
      <EveningReflectionScene
        session={reflectionSession}
        draft={reflectionDraft}
        correctionAction={correctionAction}
        lastAnsweredQuestionId={lastAnsweredQuestionId}
        disabled={isSubmitting}
        error={error}
        onDraftChange={(draft) => onReflectionDraftChange?.(draft)}
        onAnswer={() => onReflectionAnswer?.()}
        onSkip={() => onReflectionSkip?.()}
        onCorrectionActionChange={(value) => onCorrectionActionChange?.(value)}
        onCreateCorrection={() => onCreateCorrection?.()}
      />
    );
  }

  return (
    <EveningReviewFrame
      title={
        snapshot.isRecoveryReview
          ? 'Восстановление и завершение прошлого дня'
          : 'Вечерний контроль и завершение дня'
      }
      onClose={onClose}
      embedded={embedded}
    >
      <form className="evening-review-form" onSubmit={onSubmit} noValidate>
        <div className="evening-review-scroll-region">
          {embedded ? null : (
            <EveningReviewSteps
              readiness={readiness}
              isRecoveryReview={snapshot.isRecoveryReview}
            />
          )}

          {snapshot.openLoops === undefined ? null : (
            <section className="evening-review-section" aria-labelledby="open-loop-heading">
              <div className="section-heading">
                <div>
                  <p className="section-kicker gold">Разбор дня</p>
                  <h3 id="open-loop-heading">
                    {snapshot.openLoops.remaining} элементов требуют решения
                  </h3>
                </div>
                <strong>
                  {snapshot.openLoops.resolved} / {snapshot.openLoops.total}
                </strong>
              </div>
              <div className="evening-action-review-list">
                {snapshot.openLoops.items.map((item) => {
                  const key = `${item.entityType}:${item.entityId}`;
                  return (
                    <article className="evening-action-card" key={key}>
                      <div className="evening-action-card-heading">
                        <div>
                          <strong>{item.title}</strong>
                          <p>
                            {item.requirement === 'INFORMATIONAL'
                              ? `Для сведения: ${item.status}`
                              : item.resolution === null
                                ? item.status
                                : `Разобрано: ${openLoopResolutionLabel(item.resolution, item.entityType)}`}
                          </p>
                        </div>
                      </div>
                      {item.requirement === 'INFORMATIONAL' || item.resolution !== null ? null : (
                        <>
                          <VoiceField className="evening-review-field">
                            <span>Итог или причина</span>
                            <VoiceTextInput
                              value={openLoopNotes[key] ?? ''}
                              disabled={isSubmitting}
                              onValueChange={(value) => onOpenLoopNoteChange?.(key, value)}
                            />
                          </VoiceField>
                          <div className="evening-action-choice-grid">
                            {item.allowedResolutions.map((resolution) => (
                              <button
                                className="secondary-button"
                                type="button"
                                key={resolution}
                                disabled={isSubmitting || onResolveOpenLoop === undefined}
                                onClick={() =>
                                  onResolveOpenLoop?.(item.entityType, item.entityId, resolution)
                                }
                              >
                                {openLoopResolutionLabel(resolution, item.entityType)}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          <section className="evening-review-overview" aria-labelledby="evening-overview-title">
            <div className="section-heading">
              <div>
                <p className="section-kicker gold">Проверка дня</p>
                <h3 id="evening-overview-title">Единое состояние</h3>
              </div>
            </div>
            {hasRecordedActivity ? (
              <div className="evening-review-metrics">
                <EveningMetric label="Решения" value={snapshot.decisions.length} />
                <EveningMetric label="Действия" value={snapshot.lifeActions.length} />
                <EveningMetric label="Сессии" value={snapshot.actionSessions.length} />
                <EveningMetric label="Требуют решения" value={unfinishedActions.length} />
                <EveningMetric
                  label="Блоки распорядка"
                  value={snapshot.routineSummary?.plannedCount ?? 0}
                />
              </div>
            ) : (
              <p className="evening-review-empty-summary">
                Сегодня решений, действий и рабочих сессий не зафиксировано.
              </p>
            )}
            {sessionBlock === null ? (
              <p className="evening-review-check evening-review-check-ok">
                Незавершённых рабочих сессий нет
              </p>
            ) : (
              <p className="evening-review-blocker" role="alert">
                {sessionBlock.status === ACTION_SESSION_STATUS.paused
                  ? 'Приостановленная рабочая сессия блокирует завершение дня. Сначала завершите её.'
                  : 'Активная рабочая сессия блокирует завершение дня. Сначала завершите её.'}
              </p>
            )}
            {snapshot.routineSummary === undefined ||
            snapshot.routineSummary.runningExecution === null ? (
              <p className="evening-review-check evening-review-check-ok">
                Выполняющихся блоков распорядка нет
              </p>
            ) : (
              <p className="evening-review-blocker" role="alert">
                Выполняющийся блок распорядка блокирует завершение дня. Сначала завершите или
                прервите его.
              </p>
            )}
            <p className="evening-review-check">
              Блоки распорядка: запланировано {snapshot.routineSummary?.plannedCount ?? 0}, начато{' '}
              {snapshot.routineSummary?.startedCount ?? 0}, завершено{' '}
              {snapshot.routineSummary?.completedCount ?? 0}
            </p>
          </section>

          <section className="evening-review-section" aria-labelledby="evening-decisions-title">
            <div className="section-heading">
              <div>
                <p className="section-kicker">Решения дня</p>
                <h3 id="evening-decisions-title">Проверка решений</h3>
              </div>
            </div>
            {snapshot.decisions.length === 0 ? (
              <p className="page-message">Решений на текущий день нет</p>
            ) : (
              <div className="evening-review-list">
                {snapshot.decisions.map((decision) => (
                  <article className="evening-review-row" key={decision.id.toString()}>
                    <div>
                      <strong>{decision.title.toString()}</strong>
                      <p>{decisionKindLabel(decision.kind)}</p>
                    </div>
                    <span className="entity-status-chip">
                      {decisionStatusLabel(decision.status)}
                    </span>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="evening-review-section" aria-labelledby="evening-actions-title">
            <div className="section-heading">
              <div>
                <p className="section-kicker">Остатки дня</p>
                <h3 id="evening-actions-title">Обработайте каждое действие</h3>
              </div>
            </div>
            {unfinishedActions.length === 0 ? (
              <p className="evening-review-check evening-review-check-ok">
                Все действия завершены, отменены или уже перенесены
              </p>
            ) : (
              <div className="evening-action-review-list">
                {unfinishedActions.map((lifeAction) => (
                  <EveningActionResolutionCard
                    key={lifeAction.id.toString()}
                    lifeAction={lifeAction}
                    snapshot={snapshot}
                    form={actionForms[lifeAction.id.toString()]}
                    disabled={isSubmitting}
                    onKindChange={onActionKindChange}
                    onActualResultChange={onActionActualResultChange}
                    onDateChange={onActionDateChange}
                    onReasonChange={onActionReasonChange}
                  />
                ))}
              </div>
            )}
            {completedActions.length === 0 ? null : (
              <details className="evening-completed-actions">
                <summary>Уже обработано: {completedActions.length}</summary>
                <div className="evening-review-list">
                  {completedActions.map((lifeAction) => (
                    <article className="evening-review-row" key={lifeAction.id.toString()}>
                      <strong>{lifeAction.title.toString()}</strong>
                      <span className="entity-status-chip">
                        {lifeActionStatusLabel(lifeAction.status)}
                      </span>
                    </article>
                  ))}
                </div>
              </details>
            )}
          </section>

          {adaptiveReflectionEnabled &&
          (reflectionSession === undefined || reflectionSession === null) ? (
            <section className="evening-review-section" aria-labelledby="adaptive-reflection-title">
              <div className="section-heading">
                <div>
                  <p className="section-kicker green">Осмысление дня</p>
                  <h3 id="adaptive-reflection-title">Сначала завершите разбор дня</h3>
                </div>
              </div>
              <p className="page-message">
                Вопросы появятся после обработки незавершённых элементов.
              </p>
            </section>
          ) : reflectionSession === undefined || reflectionSession === null ? (
            <section className="evening-review-section" aria-labelledby="evening-summary-title">
              <div className="section-heading">
                <div>
                  <p className="section-kicker green">Итог</p>
                  <h3 id="evening-summary-title">Что стало результатом дня?</h3>
                </div>
              </div>
              <VoiceField className="evening-review-field">
                <span>Итог дня *</span>
                <VoiceTextArea
                  value={summary}
                  rows={4}
                  maxLength={4000}
                  disabled={isSubmitting}
                  onValueChange={(value) => onSummaryChange(value)}
                />
              </VoiceField>
              <label className="evening-review-field">
                <span>Сфера результата дня</span>
                <SphereSelect
                  value={sphereId}
                  snapshot={spheres}
                  disabled={isSubmitting}
                  onChange={onSphereChange}
                />
              </label>
            </section>
          ) : (
            <AdaptiveReflectionSection
              session={reflectionSession}
              draft={reflectionDraft}
              correctionAction={correctionAction}
              lastAnsweredQuestionId={lastAnsweredQuestionId}
              disabled={isSubmitting}
              onDraftChange={onReflectionDraftChange}
              onAnswer={onReflectionAnswer}
              onSkip={onReflectionSkip}
              onCorrectionActionChange={onCorrectionActionChange}
              onCreateCorrection={onCreateCorrection}
            />
          )}

          {adaptiveReflectionEnabled && reflectionSession?.complete !== true ? null : (
            <section className="evening-review-section" aria-labelledby="tomorrow-decisions-title">
              <div className="section-heading">
                <div>
                  <p className="section-kicker gold">Следующий цикл</p>
                  <h3 id="tomorrow-decisions-title">
                    {snapshot.isRecoveryReview ? 'Решения для продолжения' : 'Решения на завтра'}
                  </h3>
                  <p>{snapshot.tomorrowDate.toString()}</p>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={isSubmitting}
                  onClick={onAddTomorrowDecision}
                >
                  Добавить решение
                </button>
              </div>

              {snapshot.tomorrowDecisions.length === 0 ? (
                <p className="page-message">
                  {snapshot.isRecoveryReview
                    ? 'Сохранённых решений на текущую дату пока нет'
                    : 'Сохранённых решений на завтра пока нет'}
                </p>
              ) : (
                <div className="evening-review-list">
                  {snapshot.tomorrowDecisions.map((decision) => (
                    <article className="evening-review-row" key={decision.id.toString()}>
                      <div>
                        <strong>{decision.title.toString()}</strong>
                        <p>{decisionKindLabel(decision.kind)}</p>
                      </div>
                      <span className="entity-status-chip">
                        {decisionStatusLabel(decision.status)}
                      </span>
                    </article>
                  ))}
                </div>
              )}

              <div className="tomorrow-decision-form-list">
                {tomorrowForms.map((form, index) => (
                  <TomorrowDecisionFormCard
                    key={form.formId}
                    index={index}
                    form={form}
                    disabled={isSubmitting}
                    onUpdate={onUpdateTomorrowDecision}
                    onRemove={onRemoveTomorrowDecision}
                  />
                ))}
              </div>
            </section>
          )}

          {error === null ? null : (
            <p className="form-error evening-review-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="evening-review-submit-bar">
          <div className="evening-review-submit-copy">
            <strong>
              {readiness.canComplete ? 'Всё готово к завершению' : 'Осталось выполнить'}
            </strong>
            <p id="evening-review-submit-reason">
              {readiness.blockingMessage ??
                (snapshot.isRecoveryReview
                  ? 'Прошлый день, остатки и решения для продолжения будут сохранены одной атомарной операцией.'
                  : 'День, действия и решения на завтра будут сохранены одной атомарной операцией.')}
            </p>
            <EveningCompletionChecklist
              readiness={readiness}
              isRecoveryReview={snapshot.isRecoveryReview}
            />
          </div>
          <button
            className="primary-button"
            type="submit"
            disabled={isSubmitting || !readiness.canComplete}
            aria-describedby="evening-review-submit-reason"
            data-completion-ready={readiness.canComplete ? 'true' : 'false'}
          >
            {isSubmitting ? 'Завершаем день…' : 'Завершить день'}
          </button>
        </div>
      </form>
    </EveningReviewFrame>
  );
}

interface AdaptiveReflectionSectionProps {
  readonly session: ReflectionSession;
  readonly draft: ReflectionAnswerDraft;
  readonly correctionAction: string;
  readonly lastAnsweredQuestionId: string | null;
  readonly disabled: boolean;
  readonly onDraftChange?: ((draft: ReflectionAnswerDraft) => void) | undefined;
  readonly onAnswer?: (() => void) | undefined;
  readonly onSkip?: (() => void) | undefined;
  readonly onCorrectionActionChange?: ((value: string) => void) | undefined;
  readonly onCreateCorrection?: (() => void) | undefined;
}

function AdaptiveReflectionSection({
  session,
  draft,
  correctionAction,
  lastAnsweredQuestionId,
  disabled,
  onDraftChange,
  onAnswer,
  onSkip,
  onCorrectionActionChange,
  onCreateCorrection,
}: AdaptiveReflectionSectionProps) {
  const question = session.currentQuestion;
  return (
    <section className="evening-review-section" aria-labelledby="adaptive-reflection-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker green">Осмысление дня</p>
          <h3 id="adaptive-reflection-title">
            {session.complete
              ? 'Осмысление завершено'
              : `Вопрос ${session.processed + 1} из ${session.total}`}
          </h3>
        </div>
        <strong>
          {session.processed} / {session.total}
        </strong>
      </div>

      {question === null ? (
        <p className="evening-review-check evening-review-check-ok">
          Ответы сохранены. Можно переходить к формированию завтра.
        </p>
      ) : (
        <ReflectionQuestionForm
          question={question}
          draft={draft}
          disabled={disabled}
          onDraftChange={onDraftChange}
          onAnswer={onAnswer}
          onSkip={onSkip}
        />
      )}

      {lastAnsweredQuestionId === null ? null : (
        <div className="evening-action-card">
          <VoiceField className="evening-review-field">
            <span>Корректировка по последнему ответу</span>
            <VoiceTextArea
              rows={2}
              value={correctionAction}
              disabled={disabled}
              placeholder="Например: перед рабочей сессией убирать телефон со стола"
              onValueChange={(value) => onCorrectionActionChange?.(value)}
            />
          </VoiceField>
          <button
            className="secondary-button"
            type="button"
            disabled={disabled || correctionAction.trim().length === 0}
            onClick={onCreateCorrection}
          >
            Сохранить корректировку
          </button>
        </div>
      )}
    </section>
  );
}

function ReflectionQuestionForm({
  question,
  draft,
  disabled,
  onDraftChange,
  onAnswer,
  onSkip,
}: {
  readonly question: ReflectionQuestion;
  readonly draft: ReflectionAnswerDraft;
  readonly disabled: boolean;
  readonly onDraftChange?: ((draft: ReflectionAnswerDraft) => void) | undefined;
  readonly onAnswer?: (() => void) | undefined;
  readonly onSkip?: (() => void) | undefined;
}) {
  const singleChoice = question.type === REFLECTION_QUESTION_TYPE.singleChoice ? draft.text : '';
  const canAnswer = reflectionAnswerFromDraft(question, draft) !== null;
  return (
    <div className="evening-action-card">
      <p>{question.context}</p>
      <h4>{question.prompt}</h4>
      {question.type === REFLECTION_QUESTION_TYPE.singleChoice ||
      question.type === REFLECTION_QUESTION_TYPE.multiChoice ? (
        <div className="evening-action-choice-grid">
          {question.options.map((option) => {
            const checked =
              question.type === REFLECTION_QUESTION_TYPE.singleChoice
                ? singleChoice === option.value
                : draft.choices.includes(option.value);
            return (
              <label key={option.value} className="evening-review-check">
                <input
                  type={
                    question.type === REFLECTION_QUESTION_TYPE.singleChoice ? 'radio' : 'checkbox'
                  }
                  name={question.id}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => {
                    if (question.type === REFLECTION_QUESTION_TYPE.singleChoice) {
                      onDraftChange?.({ ...draft, text: option.value });
                    } else {
                      onDraftChange?.({
                        ...draft,
                        choices: checked
                          ? draft.choices.filter((value) => value !== option.value)
                          : [...draft.choices, option.value],
                      });
                    }
                  }}
                />
                {option.label}
              </label>
            );
          })}
        </div>
      ) : question.type === REFLECTION_QUESTION_TYPE.yesNo ? (
        <div className="evening-action-choice-grid" role="group" aria-label="Ответ">
          {([true, false] as const).map((value) => (
            <button
              className="secondary-button"
              type="button"
              aria-pressed={draft.yesNo === value}
              disabled={disabled}
              key={String(value)}
              onClick={() => onDraftChange?.({ ...draft, yesNo: value })}
            >
              {value ? 'Да' : 'Нет'}
            </button>
          ))}
        </div>
      ) : (
        <VoiceField className="evening-review-field">
          <span>{question.required ? 'Ответ *' : 'Ответ (необязательно)'}</span>
          <VoiceTextArea
            rows={3}
            maxLength={2000}
            value={draft.text}
            disabled={disabled}
            onValueChange={(value) => onDraftChange?.({ ...draft, text: value })}
          />
        </VoiceField>
      )}
      <div className="evening-action-choice-grid">
        {!question.required ? (
          <button className="secondary-button" type="button" disabled={disabled} onClick={onSkip}>
            Пропустить
          </button>
        ) : null}
        <button
          className="primary-button"
          type="button"
          disabled={disabled || !canAnswer}
          onClick={onAnswer}
        >
          Продолжить
        </button>
      </div>
    </div>
  );
}

function buildReflectionSummary(session: ReflectionSession): string {
  const questions = new Map(session.questions.map((question) => [question.id, question]));
  const lines = session.cycle.reflectionResults.flatMap((result) => {
    if (result.answer === null) return [];
    const question = questions.get(result.questionId);
    const answer = Array.isArray(result.answer)
      ? result.answer.join(', ')
      : typeof result.answer === 'boolean'
        ? result.answer
          ? 'Да'
          : 'Нет'
        : String(result.answer);
    return [`${question?.prompt ?? 'Осмысление'}: ${answer}`];
  });
  return (lines.length === 0 ? 'Осмысление дня завершено.' : lines.join('\n')).slice(0, 4_000);
}

function EveningReviewSteps({
  readiness,
  isRecoveryReview,
}: {
  readonly readiness: ReturnType<typeof getEveningReviewReadiness>;
  readonly isRecoveryReview: boolean;
}) {
  const steps = [
    { label: 'Проверка дня', complete: readiness.sessionsComplete },
    { label: 'Остатки', complete: readiness.actionsResolved },
    { label: 'Итог', complete: readiness.summaryRecorded },
    { label: isRecoveryReview ? 'Продолжение' : 'Завтра', complete: readiness.tomorrowPrepared },
  ];
  const firstIncompleteIndex = steps.findIndex((step) => !step.complete);
  const activeIndex = firstIncompleteIndex === -1 ? steps.length : firstIncompleteIndex;

  return (
    <ol className="evening-review-steps" aria-label="Этапы вечернего контроля">
      {steps.map((step, index) => (
        <li
          key={step.label}
          className={step.complete ? 'is-complete' : index === activeIndex ? 'is-current' : ''}
          aria-current={index === activeIndex ? 'step' : undefined}
        >
          <span>{index + 1}</span>
          {step.label}
        </li>
      ))}
      <li
        className={activeIndex === steps.length ? 'is-current' : ''}
        aria-current={activeIndex === steps.length ? 'step' : undefined}
      >
        <span>5</span>
        Завершение
      </li>
    </ol>
  );
}

function EveningCompletionChecklist({
  readiness,
  isRecoveryReview,
}: {
  readonly readiness: ReturnType<typeof getEveningReviewReadiness>;
  readonly isRecoveryReview: boolean;
}) {
  const items = [
    { label: 'Сессии завершены', complete: readiness.sessionsComplete },
    { label: 'Блоки распорядка закрыты', complete: readiness.routineComplete },
    { label: 'Действия обработаны', complete: readiness.actionsResolved },
    { label: 'Итог заполнен', complete: readiness.summaryRecorded },
    {
      label: isRecoveryReview
        ? 'Главное решение для продолжения готово'
        : 'Главное решение на завтра готово',
      complete: readiness.tomorrowPrepared,
    },
  ];

  return (
    <ul className="evening-review-completion-checklist" aria-label="Условия завершения дня">
      {items.map((item) => (
        <li className={item.complete ? 'is-complete' : ''} key={item.label}>
          <span aria-hidden="true">{item.complete ? '✓' : '○'}</span>
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function EveningReviewFrame({
  title,
  onClose,
  children,
  embedded = false,
}: {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly embedded?: boolean;
}) {
  if (embedded) {
    return <div className="evening-command-center-scene-content">{children}</div>;
  }
  return (
    <div className="evening-command-center-page">
      <section
        className="evening-command-center evening-command-center-loading"
        aria-labelledby="evening-review-title"
      >
        <header className="evening-command-center-header">
          <div>
            <h2 id="evening-review-title">Вечерний центр</h2>
            <p>{title}</p>
          </div>
          <button
            className="evening-command-center-close"
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="evening-command-center-loading-content">{children}</div>
      </section>
    </div>
  );
}

function EveningMetric({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="evening-review-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EveningActionResolutionCard({
  lifeAction,
  snapshot,
  form,
  disabled,
  onKindChange,
  onActualResultChange,
  onDateChange,
  onReasonChange,
}: {
  readonly lifeAction: LifeAction;
  readonly snapshot: EveningReviewSnapshot;
  readonly form: EveningActionForms[string] | undefined;
  readonly disabled: boolean;
  readonly onKindChange: (actionId: string, kind: EveningActionResolutionKind) => void;
  readonly onActualResultChange: (actionId: string, value: string) => void;
  readonly onDateChange: (actionId: string, value: string) => void;
  readonly onReasonChange: (actionId: string, value: string) => void;
}) {
  const actionId = lifeAction.id.toString();
  const resolvedForm = form ?? {
    kind: '',
    actualResult: '',
    newPlannedDate: snapshot.tomorrowDate.toString(),
    reason: '',
  };
  const completionAllowed = canCompleteAction(lifeAction, snapshot);

  return (
    <article className="evening-action-review-card">
      <div className="evening-action-review-heading">
        <div>
          <strong>{lifeAction.title.toString()}</strong>
          <p>{lifeAction.expectedResult?.toString() ?? 'Ожидаемый результат не указан'}</p>
        </div>
        <span className="entity-status-chip">{lifeActionStatusLabel(lifeAction.status)}</span>
      </div>
      <label className="evening-review-field">
        <span>Решение по действию *</span>
        <select
          value={resolvedForm.kind}
          disabled={disabled}
          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
            onKindChange(actionId, event.target.value as EveningActionResolutionKind)
          }
        >
          <option value="">Выберите действие</option>
          <option value="complete" disabled={!completionAllowed}>
            Завершить
          </option>
          <option value="reschedule">Перенести</option>
          <option value="cancel">Отменить</option>
        </select>
      </label>
      {!completionAllowed ? (
        <p className="evening-action-hint">
          Завершение доступно только после начатого действия и завершённой рабочей сессии.
        </p>
      ) : null}
      {resolvedForm.kind === 'complete' ? (
        <VoiceField className="evening-review-field">
          <span>Фактический результат *</span>
          <VoiceTextArea
            value={resolvedForm.actualResult}
            rows={3}
            disabled={disabled}
            onValueChange={(value) => onActualResultChange(actionId, value)}
          />
        </VoiceField>
      ) : null}
      {resolvedForm.kind === 'reschedule' ? (
        <label className="evening-review-field">
          <span>Новая дата *</span>
          <input
            type="date"
            min={snapshot.tomorrowDate.toString()}
            value={resolvedForm.newPlannedDate}
            disabled={disabled}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onDateChange(actionId, event.target.value)
            }
          />
        </label>
      ) : null}
      {resolvedForm.kind === 'cancel' ? (
        <VoiceField className="evening-review-field">
          <span>Причина отмены</span>
          <VoiceTextArea
            value={resolvedForm.reason}
            rows={2}
            disabled={disabled}
            placeholder="Например: потеряло актуальность"
            onValueChange={(value) => onReasonChange(actionId, value)}
          />
        </VoiceField>
      ) : null}
    </article>
  );
}

function TomorrowDecisionFormCard({
  index,
  form,
  disabled,
  onUpdate,
  onRemove,
}: {
  readonly index: number;
  readonly form: TomorrowDecisionForm;
  readonly disabled: boolean;
  readonly onUpdate: (formId: string, patch: Partial<Omit<TomorrowDecisionForm, 'formId'>>) => void;
  readonly onRemove: (formId: string) => void;
}) {
  return (
    <article className="tomorrow-decision-form-card">
      <div className="tomorrow-decision-form-heading">
        <strong>Новое решение {index + 1}</strong>
        <button
          className="text-button danger-text-button"
          type="button"
          disabled={disabled}
          onClick={() => onRemove(form.formId)}
        >
          Убрать
        </button>
      </div>
      <label className="evening-review-field">
        <span>Вид</span>
        <select
          value={form.kind}
          disabled={disabled}
          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
            onUpdate(form.formId, { kind: event.target.value as DecisionKind })
          }
        >
          <option value={DECISION_KIND.main}>Главное</option>
          <option value={DECISION_KIND.additional}>Дополнительное</option>
        </select>
      </label>
      <VoiceField className="evening-review-field">
        <span>Название *</span>
        <VoiceTextInput
          value={form.title}
          maxLength={200}
          disabled={disabled}
          onValueChange={(value) => onUpdate(form.formId, { title: value })}
        />
      </VoiceField>
      <VoiceField className="evening-review-field">
        <span>Ожидаемый результат{form.kind === DECISION_KIND.main ? ' *' : ''}</span>
        <VoiceTextArea
          value={form.expectedResult}
          rows={2}
          maxLength={1000}
          disabled={disabled}
          onValueChange={(value) => onUpdate(form.formId, { expectedResult: value })}
        />
      </VoiceField>
    </article>
  );
}

function openLoopResolutionLabel(
  resolution: OpenLoopResolutionKind,
  entityType: OpenLoopEntityType,
): string {
  if (entityType === 'ACTION_SESSION') {
    if (resolution === 'COMPLETE') return 'Завершить сессию';
    if (resolution === 'CARRY_FORWARD') return 'Остановить / сохранить';
    if (resolution === 'REVISE') return 'Вернуться к действию';
    return 'Отказаться';
  }
  if (resolution === 'COMPLETE') return 'Завершить';
  if (resolution === 'CARRY_FORWARD') return 'Перенести';
  if (resolution === 'REVISE') return 'Изменить';
  return 'Отказаться';
}

function waitForCompletionTransition(): Promise<void> {
  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return Promise.resolve();
  return new Promise((resolve) => window.setTimeout(resolve, 280));
}
