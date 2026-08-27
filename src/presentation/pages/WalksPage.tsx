import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  AdvanceWalkReflectionStage,
  AbandonWalk,
  CloseWalkReentry,
  CompleteWalk,
  CompleteWalkReentry,
  CreateWalk,
  type CreateWalkCapture,
  type UpdateWalkCapture,
  type ProcessWalkCapture,
  type GetPendingWalkCaptures,
  type GetWalkCaptures,
  type GetWalkCaptureById,
  type GetWalkHistory,
  type GetWalkHistoryDetail,
  type GetWalkAnalytics,
  type GetWalkRecommendation,
  type WalkAnalyticsPeriod,
  DeleteWalk,
  DisableWalkReflectionGuidance,
  GetActiveWalk,
  GetPendingWalkReentry,
  GetWalkStatistics,
  GetWalksForDate,
  GetSpheres,
  PauseWalk,
  RecordWalkOutcome,
  ResumeWalk,
  StartWalk,
  StartRoutineWalk,
  StartDecisionWalk,
  GetDecisionById,
  UpdateWalkPhoto,
  UpdateWalkSphere,
  type SpheresSnapshot,
  WALK_STATISTICS_PERIOD,
  type WalkStatistics,
  type WalkStatisticsPeriod,
} from '../../application';
import {
  MAX_WALK_PHOTO_BYTES,
  MAX_WALK_RESULT_LENGTH,
  WALK_INTENT,
  WALK_MODE,
  WALK_STATUS,
  WALK_TYPE,
  EntityId,
  type DayDate,
  type Walk,
  type WalkIntent,
  type WalkStateSnapshot,
  type WalkMode,
  type WalkPhoto,
  type WalkType,
} from '../../domain';
import { SectionDateNavigator } from '../components/SectionDateNavigator';
import { WalkRecommendationPanel } from '../walk/WalkRecommendationPanel';
import { SphereBadge, SphereSelect } from '../components/SphereReference';
import {
  SPHERE_FILTER_ALL,
  SPHERE_FILTER_NONE,
  useSpheres,
} from '../components/sphereReferenceModel';
import { useDateQuery } from '../date/useDateQuery';
import { WalkSubmissionGuard } from '../walk/WalkSubmissionGuard';
import { WalkCaptureComposer, type WalkCaptureSaveResult } from '../walk/WalkCaptureComposer';
import { WalkCaptureInbox } from '../walk/WalkCaptureInbox';
import { WalkHistoryScreen } from '../walk/WalkHistoryScreen';
import { WalkAnalyticsScreen } from '../walk/WalkAnalyticsScreen';
import type { WalkHistoryFilter } from '../walk/WalkHistoryPresentation';
import { WalkCaptureInboxEntry, WalkCaptureSummary } from '../walk/WalkCaptureSummary';
import {
  WalkQuickCompletionPanel,
  WalkReentryPanel,
  type WalkOutcomeDraft,
} from '../walk/WalkCompletionFlow';
import {
  closeWalkReentryFlow,
  completeWalkReentryFlow,
  selectWalkSessionEntry,
  type WalkSessionEntry,
} from '../walk/WalkReentryFlow';
import {
  WalkActivePanel,
  WalkCenterPanel,
  WalkIntentSelector,
  WalkPreparationForm,
  type WalkPreparationDraft,
} from '../walk/WalkSessionFlow';
import { formatStopwatch, formatTimer, getWalkTimeSnapshot } from '../walk/WalkTimer';
import { getWalkReentryPresentation } from '../walk/WalkSessionPresentation';
import {
  WALK_TYPE_OPTIONS,
  WALK_TYPE_PRESENTATION,
  formatStatisticsDuration,
  formatActualDuration,
} from '../walk/walkPresentation';
import type { AppSection } from '../navigation/AppSection';
import {
  decisionWalkReturnId,
  loadDecisionWalkContext,
  type DecisionWalkContext,
  type DecisionWalkLaunchRequest,
} from '../decision/DecisionWalkNavigation';
import {
  routineDestinationFor,
  type RoutineWalkLaunchRequest,
  type RoutineWalkDestinationRequest,
} from '../routine/RoutineWalkNavigation';

interface WalksPageProps {
  readonly getWalkRecommendation: Pick<GetWalkRecommendation, 'execute'>;
  readonly getWalkAnalytics: Pick<GetWalkAnalytics, 'execute'>;
  readonly getWalkHistory: Pick<GetWalkHistory, 'execute'>;
  readonly getWalkHistoryDetail: Pick<GetWalkHistoryDetail, 'execute'>;
  readonly onOpenHistoryDecision: (decisionId: string) => void;
  readonly onOpenHistoryRoutine: (request: RoutineWalkDestinationRequest) => void;
  readonly createWalkCapture: Pick<CreateWalkCapture, 'execute'>;
  readonly updateWalkCapture: Pick<UpdateWalkCapture, 'execute'>;
  readonly processWalkCapture: Pick<ProcessWalkCapture, 'execute'>;
  readonly getPendingWalkCaptures: Pick<GetPendingWalkCaptures, 'execute'>;
  readonly getWalkCaptures: Pick<GetWalkCaptures, 'execute'>;
  readonly getWalkCaptureById: Pick<GetWalkCaptureById, 'execute'>;
  readonly startDecisionWalk?: Pick<StartDecisionWalk, 'execute'>;
  readonly getDecisionById?: Pick<GetDecisionById, 'execute'>;
  readonly decisionLaunchRequest?: DecisionWalkLaunchRequest | null;
  readonly onDecisionLaunchConsumed?: () => void;
  readonly onReturnToDecision?: (decisionId: string | null) => void;
  readonly startRoutineWalk: Pick<StartRoutineWalk, 'execute'>;
  readonly abandonWalk: Pick<AbandonWalk, 'execute'>;
  readonly routineLaunchRequest: RoutineWalkLaunchRequest | null;
  readonly onRoutineLaunchConsumed: () => void;
  readonly onReturnToRoutine: (request: RoutineWalkDestinationRequest) => void;
  readonly currentDate: DayDate;
  readonly selectedDate: DayDate;
  readonly onDateChange: (date: DayDate) => void;
  readonly createWalk: Pick<CreateWalk, 'execute'>;
  readonly advanceWalkReflectionStage: Pick<AdvanceWalkReflectionStage, 'execute'>;
  readonly disableWalkReflectionGuidance: Pick<DisableWalkReflectionGuidance, 'execute'>;
  readonly completeWalk: Pick<CompleteWalk, 'execute'>;
  readonly completeWalkReentry: Pick<CompleteWalkReentry, 'execute'>;
  readonly closeWalkReentry: Pick<CloseWalkReentry, 'execute'>;
  readonly deleteWalk: Pick<DeleteWalk, 'execute'>;
  readonly getWalkStatistics: Pick<GetWalkStatistics, 'execute'>;
  readonly getWalksForDate: Pick<GetWalksForDate, 'execute'>;
  readonly getActiveWalk: Pick<GetActiveWalk, 'execute'>;
  readonly getPendingWalkReentry: Pick<GetPendingWalkReentry, 'execute'>;
  readonly pauseWalk: Pick<PauseWalk, 'execute'>;
  readonly recordWalkOutcome: Pick<RecordWalkOutcome, 'execute'>;
  readonly resumeWalk: Pick<ResumeWalk, 'execute'>;
  readonly startWalk: Pick<StartWalk, 'execute'>;
  readonly updateWalkPhoto: Pick<UpdateWalkPhoto, 'execute'>;
  readonly updateWalkSphere: Pick<UpdateWalkSphere, 'execute'>;
  readonly getSpheres: Pick<GetSpheres, 'execute'>;
  readonly onReentryChanged: () => Promise<void>;
  readonly onOpenSection: (section: AppSection) => void;
}

type WalkStatisticsState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: WalkStatistics }
  | { readonly status: 'error' };

type ActiveWalkState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: Walk | null }
  | { readonly status: 'error' };

type WalkSessionPhase =
  'center' | 'intent' | 'preparation' | 'completion' | 'reentryError' | 'reentry';

const WALK_STATISTICS_PERIOD_OPTIONS: readonly {
  readonly period: WalkStatisticsPeriod;
  readonly label: string;
}[] = [
  { period: WALK_STATISTICS_PERIOD.last7Days, label: '7 дней' },
  { period: WALK_STATISTICS_PERIOD.last30Days, label: '30 дней' },
  { period: WALK_STATISTICS_PERIOD.allTime, label: 'Всё время' },
];

export function WalksPage(props: WalksPageProps) {
  const { decisionLaunchRequest, onDecisionLaunchConsumed } = props;
  const { state, reload } = useDateQuery(props.selectedDate, props.getWalksForDate);
  const spheres = useSpheres(props.getSpheres);
  const [activeWalkState, setActiveWalkState] = useState<ActiveWalkState>({ status: 'loading' });
  const [sessionPhase, setSessionPhase] = useState<WalkSessionPhase>('center');
  const [selectedIntent, setSelectedIntent] = useState<WalkIntent>(WALK_INTENT.free);
  const [currentWalkState, setCurrentWalkState] = useState<WalkStateSnapshot | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<WalkType>(WALK_TYPE.restorative);
  const [selectedSphereId, setSelectedSphereId] = useState<string | null>(null);
  const [finishConfirmationOpen, setFinishConfirmationOpen] = useState(false);
  const [abandonConfirmationOpen, setAbandonConfirmationOpen] = useState(false);
  const [completedWalk, setCompletedWalk] = useState<Walk | null>(null);
  const [sphereFilter, setSphereFilter] = useState(SPHERE_FILTER_ALL);
  const [startTarget, setStartTarget] = useState<Walk | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statisticsPeriod, setStatisticsPeriod] = useState<WalkStatisticsPeriod>(
    WALK_STATISTICS_PERIOD.last7Days,
  );
  const [statisticsState, setStatisticsState] = useState<WalkStatisticsState>({
    status: 'loading',
  });
  const submissionGuard = useRef(new WalkSubmissionGuard());
  const [captureView, setCaptureView] = useState<EntityId | null | undefined>(undefined);
  const [walkView, setWalkView] = useState<'session' | 'history' | 'analytics'>('session');
  const [historyOrigin, setHistoryOrigin] = useState<'session' | 'analytics'>('session');
  const [historyFilter, setHistoryFilter] = useState<WalkHistoryFilter>('all');
  const [analyticsPeriod, setAnalyticsPeriod] = useState<WalkAnalyticsPeriod>('last30Days');
  const historyEntry = useRef<HTMLButtonElement>(null);
  const analyticsEntry = useRef<HTMLButtonElement>(null);
  const restoreEntryFocus = useRef<'history' | 'analytics' | null>(null);
  const [captureRevision, setCaptureRevision] = useState(0);
  const sessionLoadToken = useRef(0);
  useEffect(() => {
    if (walkView !== 'session' || restoreEntryFocus.current === null) return;
    const target = restoreEntryFocus.current === 'history' ? historyEntry : analyticsEntry;
    // Restore after the remounted session panel's initial focus, including StrictMode replay.
    const frame = requestAnimationFrame(() => {
      if (target.current === null) return;
      target.current.focus();
      restoreEntryFocus.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [walkView]);
  const [loadedDecisionContext, setLoadedDecisionContext] = useState<{
    readonly walkId: string;
    readonly context: DecisionWalkContext;
  } | null>(null);
  const contextWalk =
    (activeWalkState.status === 'ready' ? activeWalkState.value : null) ?? completedWalk;
  const hasDecisionContext =
    contextWalk !== null &&
    (decisionWalkReturnId(contextWalk) !== null || contextWalk.linkedEntity?.type === 'decision');
  const decisionContext: DecisionWalkContext = !hasDecisionContext
    ? { status: 'not-linked' }
    : loadedDecisionContext?.walkId === contextWalk?.id.toString()
      ? loadedDecisionContext.context
      : { status: 'loading' };

  useEffect(() => {
    if (contextWalk === null || !hasDecisionContext) return;
    let active = true;
    const query = props.getDecisionById;
    const load =
      query === undefined
        ? Promise.resolve<DecisionWalkContext>({ status: 'unavailable' })
        : loadDecisionWalkContext(contextWalk, query);
    void load.then((context) => {
      if (active) setLoadedDecisionContext({ walkId: contextWalk.id.toString(), context });
    });
    return () => {
      active = false;
    };
  }, [contextWalk, hasDecisionContext, props.getDecisionById]);

  const applySessionEntry = useCallback(
    (entry: WalkSessionEntry): void => {
      if (
        (entry.phase === 'active' || entry.phase === 'reentry') &&
        decisionLaunchRequest != null
      ) {
        onDecisionLaunchConsumed?.();
      }
      if (entry.phase === 'active') {
        setActiveWalkState({ status: 'ready', value: entry.walk });
        setCompletedWalk(null);
        setSessionPhase('center');
        return;
      }
      setActiveWalkState({ status: 'ready', value: null });
      if (entry.phase === 'reentry') {
        setCompletedWalk(entry.walk);
        setSessionPhase('reentry');
        return;
      }
      setCompletedWalk(null);
      if (entry.phase === 'decisionLaunch') {
        setSelectedIntent(WALK_INTENT.reflection);
        setSessionPhase('preparation');
        return;
      }
      setSessionPhase(
        entry.phase === 'reentryError'
          ? 'reentryError'
          : entry.phase === 'routineLaunch'
            ? 'intent'
            : 'center',
      );
    },
    [decisionLaunchRequest, onDecisionLaunchConsumed],
  );

  const readSessionEntry = useCallback(async (): Promise<WalkSessionEntry> => {
    const activeWalk = await props.getActiveWalk.execute();
    if (activeWalk !== null) {
      return selectWalkSessionEntry({
        activeWalk,
        pendingReentry: null,
        pendingLoadFailed: false,
      });
    }
    try {
      return selectWalkSessionEntry({
        activeWalk: null,
        pendingReentry: await props.getPendingWalkReentry.execute(),
        pendingLoadFailed: false,
        routineLaunchRequest: props.routineLaunchRequest,
        decisionLaunchRequest: props.decisionLaunchRequest ?? null,
      });
    } catch {
      return selectWalkSessionEntry({
        activeWalk: null,
        pendingReentry: null,
        pendingLoadFailed: true,
      });
    }
  }, [
    props.getActiveWalk,
    props.getPendingWalkReentry,
    props.routineLaunchRequest,
    props.decisionLaunchRequest,
  ]);

  const reloadActive = useCallback(async (): Promise<void> => {
    const loadToken = sessionLoadToken.current + 1;
    sessionLoadToken.current = loadToken;
    try {
      const entry = await readSessionEntry();
      if (sessionLoadToken.current !== loadToken) return;
      applySessionEntry(entry);
    } catch {
      if (sessionLoadToken.current !== loadToken) return;
      setActiveWalkState({ status: 'error' });
    }
  }, [applySessionEntry, readSessionEntry]);

  const reloadStatistics = useCallback(async (): Promise<void> => {
    try {
      setStatisticsState({
        status: 'ready',
        value: await props.getWalkStatistics.execute(statisticsPeriod),
      });
    } catch {
      setStatisticsState({ status: 'error' });
    }
  }, [props.getWalkStatistics, statisticsPeriod]);

  useEffect(() => {
    let active = true;
    void readSessionEntry()
      .then((entry) => {
        if (active) applySessionEntry(entry);
      })
      .catch(() => {
        if (active) setActiveWalkState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [applySessionEntry, readSessionEntry]);

  useEffect(() => {
    let active = true;
    void props.getWalkStatistics
      .execute(statisticsPeriod)
      .then((statistics) => {
        if (active) setStatisticsState({ status: 'ready', value: statistics });
      })
      .catch(() => {
        if (active) setStatisticsState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [props.getWalkStatistics, statisticsPeriod]);

  function changeStatisticsPeriod(period: WalkStatisticsPeriod): void {
    if (period === statisticsPeriod) return;
    setStatisticsState({ status: 'loading' });
    setStatisticsPeriod(period);
  }

  function changeDate(date: DayDate): void {
    setFormOpen(false);
    setStartTarget(null);
    setMessage(null);
    setError(null);
    props.onDateChange(date);
  }

  async function createPlannedWalk(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!submissionGuard.current.tryAcquire()) return;
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const result = await props.createWalk.execute({
        date: props.selectedDate,
        type: selectedType,
        sphereId: selectedSphereId === null ? null : EntityId.create(selectedSphereId),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setFormOpen(false);
      setMessage('Прогулка запланирована.');
      await Promise.all([reload(), reloadStatistics()]);
    } catch {
      setError('Не удалось запланировать прогулку. Повторите попытку.');
    } finally {
      setIsSaving(false);
      submissionGuard.current.release();
    }
  }

  async function startPreparedWalk(draft: WalkPreparationDraft): Promise<void> {
    if (!submissionGuard.current.tryAcquire()) return;
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const existing = await props.getActiveWalk.execute();
      if (existing !== null) {
        setActiveWalkState({ status: 'ready', value: existing });
        setSessionPhase('center');
        setMessage('У вас уже есть активная прогулка. Возвращаемся к ней.');
        props.onDecisionLaunchConsumed?.();
        return;
      }

      if (props.decisionLaunchRequest != null && props.startDecisionWalk !== undefined) {
        const started = await props.startDecisionWalk.execute({
          decisionId: props.decisionLaunchRequest.decisionId,
          timerTargetMinutes: draft.durationMinutes,
          reflectionQuestion: draft.reflectionQuestion,
          beforeState: draft.beforeState,
          ...(draft.reflectionTemplate === null
            ? {}
            : { reflectionTemplate: draft.reflectionTemplate }),
        });
        if (!started.ok) {
          setError(started.error.message);
          if (started.error.code === 'walk.another_running') await reloadActive();
          return;
        }
        setActiveWalkState({ status: 'ready', value: started.value });
        setCurrentWalkState(null);
        setSessionPhase('center');
        setFinishConfirmationOpen(false);
        setAbandonConfirmationOpen(false);
        props.onDecisionLaunchConsumed?.();
        await Promise.all([reload(), reloadStatistics()]);
        return;
      }

      if (props.routineLaunchRequest !== null) {
        const started = await props.startRoutineWalk.execute({
          source: props.routineLaunchRequest.source,
          intent: draft.intent,
          beforeState: draft.beforeState,
          ...(draft.reflectionTemplate === null
            ? {}
            : { reflectionTemplate: draft.reflectionTemplate }),
          mode: WALK_MODE.timer,
          timerTargetMinutes: draft.durationMinutes,
          reflectionQuestion: draft.reflectionQuestion,
        });
        if (!started.ok) {
          setError(started.error.message);
          return;
        }
        setActiveWalkState({ status: 'ready', value: started.value });
        setCurrentWalkState(null);
        setSessionPhase('center');
        setFinishConfirmationOpen(false);
        setAbandonConfirmationOpen(false);
        props.onRoutineLaunchConsumed();
        await Promise.all([reload(), reloadStatistics()]);
        return;
      }

      const created = await props.createWalk.execute({
        date: props.currentDate,
        intent: draft.intent,
        beforeState: draft.beforeState,
        ...(draft.reflectionTemplate === null
          ? {}
          : { reflectionTemplate: draft.reflectionTemplate }),
      });
      if (!created.ok) {
        setError(created.error.message);
        return;
      }

      const started = await props.startWalk.execute({
        walkId: created.value.id,
        mode: WALK_MODE.timer,
        timerTargetMinutes: draft.durationMinutes,
        reflectionQuestion: draft.reflectionQuestion,
      });
      if (!started.ok) {
        setError(started.error.message);
        await reload();
        return;
      }

      setActiveWalkState({ status: 'ready', value: started.value });
      setCurrentWalkState(null);
      setSessionPhase('center');
      setFinishConfirmationOpen(false);
      setMessage('Прогулка началась. Хорошей дороги.');
      await Promise.all([reload(), reloadStatistics()]);
    } catch {
      setError('Не удалось начать прогулку. Повторите попытку.');
    } finally {
      setIsSaving(false);
      submissionGuard.current.release();
    }
  }

  async function start(walk: Walk, mode: WalkMode, timerTargetMinutes?: number): Promise<void> {
    if (!submissionGuard.current.tryAcquire()) return;
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const result = await props.startWalk.execute(
        mode === WALK_MODE.timer
          ? { walkId: walk.id, mode, timerTargetMinutes: timerTargetMinutes ?? Number.NaN }
          : { walkId: walk.id, mode },
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setStartTarget(null);
      setMessage('Прогулка началась.');
      await Promise.all([reload(), reloadActive(), reloadStatistics()]);
    } catch {
      setError('Не удалось начать прогулку. Повторите попытку.');
    } finally {
      setIsSaving(false);
      submissionGuard.current.release();
    }
  }

  async function remove(walk: Walk): Promise<void> {
    if (!submissionGuard.current.tryAcquire()) return;
    setDeletingId(walk.id.toString());
    setMessage(null);
    setError(null);
    try {
      const result = await props.deleteWalk.execute({ id: walk.id, expectedVersion: walk.version });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setMessage('Прогулка удалена.');
      await Promise.all([reload(), reloadStatistics()]);
    } catch {
      setError('Не удалось удалить прогулку. Повторите попытку.');
    } finally {
      setDeletingId(null);
      submissionGuard.current.release();
    }
  }

  async function pauseActiveWalk(walk: Walk): Promise<void> {
    if (!submissionGuard.current.tryAcquire()) return;
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const paused = await props.pauseWalk.execute({ walkId: walk.id });
      if (!paused.ok) {
        setError(paused.error.message);
        return;
      }
      setActiveWalkState({ status: 'ready', value: paused.value });
      setMessage('Прогулка на паузе.');
    } catch {
      setError('Не удалось поставить прогулку на паузу. Повторите попытку.');
    } finally {
      setIsSaving(false);
      submissionGuard.current.release();
    }
  }

  async function resumeActiveWalk(walk: Walk): Promise<void> {
    if (!submissionGuard.current.tryAcquire()) return;
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const resumed = await props.resumeWalk.execute({ walkId: walk.id });
      if (!resumed.ok) {
        setError(resumed.error.message);
        return;
      }
      setActiveWalkState({ status: 'ready', value: resumed.value });
      setMessage('Прогулка продолжается.');
    } catch {
      setError('Не удалось продолжить прогулку. Повторите попытку.');
    } finally {
      setIsSaving(false);
      submissionGuard.current.release();
    }
  }

  async function advanceReflectionStage(walk: Walk): Promise<void> {
    if (!submissionGuard.current.tryAcquire()) return;
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const advanced = await props.advanceWalkReflectionStage.execute({ walkId: walk.id });
      if (!advanced.ok) {
        setError(advanced.error.message);
        return;
      }
      setActiveWalkState({ status: 'ready', value: advanced.value });
    } catch {
      setError('Не удалось перейти к следующему этапу. Повторите попытку.');
    } finally {
      setIsSaving(false);
      submissionGuard.current.release();
    }
  }

  async function disableReflectionGuidance(walk: Walk): Promise<void> {
    if (!submissionGuard.current.tryAcquire()) return;
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const disabled = await props.disableWalkReflectionGuidance.execute({ walkId: walk.id });
      if (!disabled.ok) {
        setError(disabled.error.message);
        return;
      }
      setActiveWalkState({ status: 'ready', value: disabled.value });
      setMessage('Сопровождение отключено. Вопрос прогулки остаётся с вами.');
    } catch {
      setError('Не удалось отключить сопровождение. Повторите попытку.');
    } finally {
      setIsSaving(false);
      submissionGuard.current.release();
    }
  }

  async function finishActiveWalk(walk: Walk): Promise<void> {
    if (!submissionGuard.current.tryAcquire()) return;
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const completed = await props.completeWalk.execute({ walkId: walk.id });
      if (!completed.ok) {
        setError(completed.error.message);
        return;
      }
      setFinishConfirmationOpen(false);
      setActiveWalkState({ status: 'ready', value: null });
      setCompletedWalk(completed.value);
      setSessionPhase('completion');
      await Promise.all([props.onReentryChanged(), reload(), reloadStatistics()]);
    } catch {
      setError('Не удалось завершить прогулку. Повторите попытку.');
    } finally {
      setIsSaving(false);
      submissionGuard.current.release();
    }
  }

  async function saveWalkOutcome(walk: Walk, draft: WalkOutcomeDraft): Promise<void> {
    if (!submissionGuard.current.tryAcquire()) return;
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const recorded = await props.recordWalkOutcome.execute({
        walkId: walk.id,
        afterState: draft.afterState,
        impact: draft.impact,
        reflection: draft.reflection,
      });
      if (!recorded.ok) {
        setError(recorded.error.message);
        return;
      }
      await props.onReentryChanged();
      setCompletedWalk(recorded.value);
      setSessionPhase('reentry');
      await Promise.all([reload(), reloadStatistics()]);
    } catch {
      setError('Не удалось сохранить итог прогулки. Повторите попытку.');
    } finally {
      setIsSaving(false);
      submissionGuard.current.release();
    }
  }

  function returnToWalkCenter(): void {
    setCompletedWalk(null);
    setSessionPhase(props.routineLaunchRequest === null ? 'center' : 'intent');
    setMessage(null);
    setError(null);
  }

  function cancelRoutineLaunch(): void {
    const request = props.routineLaunchRequest;
    if (request === null) {
      setSessionPhase('center');
      return;
    }
    props.onRoutineLaunchConsumed();
    props.onReturnToRoutine({ date: request.source.effectiveDate, focus: request.source });
  }

  function cancelDecisionLaunch(): void {
    const request = props.decisionLaunchRequest;
    props.onDecisionLaunchConsumed?.();
    if (request != null) props.onReturnToDecision?.(request.decisionId.toString());
  }

  async function abandonActiveWalk(walk: Walk): Promise<void> {
    if (!submissionGuard.current.tryAcquire()) return;
    setIsSaving(true);
    setError(null);
    try {
      const result = await props.abandonWalk.execute({ walkId: walk.id });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setAbandonConfirmationOpen(false);
      await Promise.all([props.onReentryChanged(), reloadActive(), reload(), reloadStatistics()]);
    } catch {
      setError('Не удалось прервать прогулку. Повторите попытку.');
    } finally {
      setIsSaving(false);
      submissionGuard.current.release();
    }
  }

  async function followPrimaryReturn(walk: Walk): Promise<void> {
    if (!submissionGuard.current.tryAcquire()) return;
    setIsSaving(true);
    setError(null);
    try {
      const returnsToDecision = decisionWalkReturnId(walk) !== null;
      const destination =
        returnsToDecision && props.getDecisionById !== undefined
          ? await loadDecisionWalkContext(walk, props.getDecisionById)
          : null;
      const resolved = await completeWalkReentryFlow({
        walk,
        command: props.completeWalkReentry,
        onReentryChanged: props.onReentryChanged,
        onNavigate: (action) => {
          if (returnsToDecision && props.onReturnToDecision !== undefined) {
            props.onReturnToDecision(
              destination?.status === 'ready' ? destination.decisionId.toString() : null,
            );
            return;
          }
          const routineDestination = routineDestinationFor(action);
          if (routineDestination !== null) props.onReturnToRoutine(routineDestination);
          else props.onOpenSection(getWalkReentryPresentation(action).destination);
        },
      });
      if (!resolved.ok) {
        setError(resolved.error.message);
        return;
      }
      setCompletedWalk(null);
      setSessionPhase('center');
      await Promise.all([reload(), reloadStatistics()]);
    } catch {
      setError('Не удалось завершить возвращение. Повторите попытку.');
    } finally {
      setIsSaving(false);
      submissionGuard.current.release();
    }
  }

  async function followSecondaryReturn(walk: Walk): Promise<void> {
    if (!submissionGuard.current.tryAcquire()) return;
    setIsSaving(true);
    setError(null);
    try {
      const resolved = await closeWalkReentryFlow({
        walk,
        command: props.closeWalkReentry,
        onReentryChanged: props.onReentryChanged,
        onReturnToCenter: returnToWalkCenter,
      });
      if (!resolved.ok) {
        setError(resolved.error.message);
        return;
      }
      await Promise.all([reload(), reloadStatistics()]);
    } catch {
      setError('Не удалось закрыть возвращение. Повторите попытку.');
    } finally {
      setIsSaving(false);
      submissionGuard.current.release();
    }
  }

  async function updatePhoto(walk: Walk, photo: WalkPhoto | null): Promise<void> {
    if (!submissionGuard.current.tryAcquire()) return;
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const updated = await props.updateWalkPhoto.execute({ walkId: walk.id, photo });
      if (!updated.ok) {
        setError(updated.error.message);
        return;
      }
      setMessage(photo === null ? 'Фото удалено.' : 'Фото сохранено.');
      await Promise.all([reload(), reloadStatistics()]);
    } catch {
      setError('Не удалось изменить фото. Повторите попытку.');
    } finally {
      setIsSaving(false);
      submissionGuard.current.release();
    }
  }

  async function updateSphere(walk: Walk, sphereId: string | null): Promise<void> {
    const result = await props.updateWalkSphere.execute({
      walkId: walk.id,
      expectedVersion: walk.version,
      sphereId: sphereId === null ? null : EntityId.create(sphereId),
    });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    await reload();
  }

  async function saveCapture(walk: Walk, content: string): Promise<WalkCaptureSaveResult> {
    if (!submissionGuard.current.tryAcquire())
      return { ok: false, error: 'Дождитесь завершения предыдущего действия.' };
    setIsSaving(true);
    try {
      const result = await props.createWalkCapture.execute({ walkId: walk.id, content });
      if (!result.ok) return { ok: false, error: result.error.message };
      setCaptureRevision((revision) => revision + 1);
      return { ok: true };
    } catch {
      return {
        ok: false,
        error: 'Не удалось сохранить мысль. Текст остался здесь — повторите попытку.',
      };
    } finally {
      setIsSaving(false);
      submissionGuard.current.release();
    }
  }

  const activeWalk = activeWalkState.status === 'ready' ? activeWalkState.value : null;

  function startFromReadOnlyView() {
    setWalkView('session');
    setFormOpen(false);
    setMessage(null);
    setError(null);
    setSessionPhase('intent');
  }

  if (walkView === 'analytics')
    return (
      <main className="section-page walks-page">
        <WalkAnalyticsScreen
          getWalkAnalytics={props.getWalkAnalytics}
          currentDate={props.currentDate}
          period={analyticsPeriod}
          onPeriodChange={setAnalyticsPeriod}
          onBack={() => {
            restoreEntryFocus.current = 'analytics';
            setWalkView('session');
          }}
          onStart={startFromReadOnlyView}
          onOpenHistory={(intent) => {
            setHistoryOrigin('analytics');
            setHistoryFilter(intent ?? 'all');
            setWalkView('history');
          }}
        />
      </main>
    );

  if (walkView === 'history')
    return (
      <main className="section-page walks-page">
        <WalkHistoryScreen
          getWalkHistory={props.getWalkHistory}
          getWalkHistoryDetail={props.getWalkHistoryDetail}
          initialFilter={historyFilter}
          closeLabel={historyOrigin === 'analytics' ? '← К аналитике' : '← К прогулкам'}
          onOpenDecision={props.onOpenHistoryDecision}
          onOpenRoutine={props.onOpenHistoryRoutine}
          onClose={() => {
            if (historyOrigin === 'session') restoreEntryFocus.current = 'history';
            setWalkView(historyOrigin);
          }}
          onStart={startFromReadOnlyView}
        />
      </main>
    );

  if (captureView !== undefined)
    return (
      <main className="section-page walks-page">
        <WalkCaptureInbox
          getPendingWalkCaptures={props.getPendingWalkCaptures}
          getWalkCaptures={props.getWalkCaptures}
          getWalkCaptureById={props.getWalkCaptureById}
          updateWalkCapture={props.updateWalkCapture}
          processWalkCapture={props.processWalkCapture}
          walkId={captureView}
          onClose={() => setCaptureView(undefined)}
        />
      </main>
    );

  return (
    <main className="section-page walks-page">
      {activeWalkState.status === 'ready' && (activeWalk !== null || sessionPhase === 'center') ? (
        <div className="walk-history-entry">
          <button
            ref={historyEntry}
            className="secondary-button"
            type="button"
            onClick={() => {
              setHistoryOrigin('session');
              setHistoryFilter('all');
              setWalkView('history');
            }}
          >
            История прогулок
          </button>
          <button
            ref={analyticsEntry}
            className="secondary-button"
            type="button"
            onClick={() => setWalkView('analytics')}
          >
            Аналитика прогулок
          </button>
        </div>
      ) : null}
      {activeWalkState.status === 'loading' ? (
        <section className="walk-session-loading" aria-live="polite">
          <span className="walk-active-status-dot" aria-hidden="true" />
          <p>Восстанавливаем прогулку и возвращение…</p>
        </section>
      ) : null}
      {activeWalkState.status === 'error' ? (
        <section className="section-page-message section-page-error" role="alert">
          <p>Не удалось восстановить текущую прогулку.</p>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setActiveWalkState({ status: 'loading' });
              void reloadActive();
            }}
          >
            Повторить
          </button>
        </section>
      ) : null}
      {activeWalkState.status === 'ready' &&
      activeWalkState.value === null &&
      sessionPhase === 'reentryError' ? (
        <section className="section-page-message section-page-error" role="alert">
          <p>Не удалось восстановить возвращение после прогулки.</p>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setActiveWalkState({ status: 'loading' });
              void reloadActive();
            }}
          >
            Повторить
          </button>
        </section>
      ) : null}
      {activeWalk === null ? null : (
        <div className="walk-active-shell">
          <WalkActivePanel
            captureControls={
              <div className="walk-capture-controls">
                <WalkCaptureComposer
                  key={activeWalk.id.toString()}
                  isSaving={isSaving}
                  onSave={(content) => saveCapture(activeWalk, content)}
                />
                <WalkCaptureSummary
                  query={props.getWalkCaptures}
                  walkId={activeWalk.id}
                  revision={captureRevision}
                />
              </div>
            }
            decisionTitle={
              decisionContext.status === 'ready'
                ? decisionContext.title
                : decisionContext.status === 'unavailable'
                  ? 'Связанное решение больше недоступно'
                  : null
            }
            walk={activeWalk}
            isSaving={isSaving}
            finishConfirmationOpen={finishConfirmationOpen}
            abandonConfirmationOpen={abandonConfirmationOpen}
            onRequestAbandon={() => setAbandonConfirmationOpen(true)}
            onConfirmAbandon={() => void abandonActiveWalk(activeWalk)}
            onPause={() => void pauseActiveWalk(activeWalk)}
            onResume={() => void resumeActiveWalk(activeWalk)}
            onRequestFinish={() => setFinishConfirmationOpen(true)}
            onConfirmFinish={() => void finishActiveWalk(activeWalk)}
            onCancelFinish={() => {
              setFinishConfirmationOpen(false);
              setAbandonConfirmationOpen(false);
            }}
            onAdvanceReflection={() => void advanceReflectionStage(activeWalk)}
            onDisableReflectionGuidance={() => void disableReflectionGuidance(activeWalk)}
          />
          {message === null ? null : (
            <p className="walks-message walk-active-message" role="status">
              {message}
            </p>
          )}
          {error === null ? null : (
            <p className="walks-message walk-active-message error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
      {activeWalkState.status === 'ready' &&
      activeWalkState.value === null &&
      sessionPhase === 'center' ? (
        <WalkCenterPanel
          recommendationEntry={
            <WalkRecommendationPanel
              key={props.currentDate.toString()}
              query={props.getWalkRecommendation}
              currentState={currentWalkState}
              onStateChange={setCurrentWalkState}
              onChoose={(intent) => {
                setFormOpen(false);
                setSelectedIntent(intent);
                setMessage(null);
                setError(null);
                setSessionPhase('preparation');
              }}
              onOrdinary={() => {
                setFormOpen(false);
                setMessage(null);
                setError(null);
                setSessionPhase('intent');
              }}
            />
          }
          captureEntry={
            <WalkCaptureInboxEntry
              query={props.getPendingWalkCaptures}
              onOpen={() => setCaptureView(null)}
            />
          }
          hasActiveWalk={false}
          onBegin={() => {
            setFormOpen(false);
            setMessage(null);
            setError(null);
            setSessionPhase('intent');
          }}
          onQuickStart={(intent) => {
            setFormOpen(false);
            setSelectedIntent(intent);
            setMessage(null);
            setError(null);
            setSessionPhase('preparation');
          }}
        />
      ) : null}
      {activeWalkState.status === 'ready' &&
      activeWalkState.value === null &&
      sessionPhase === 'intent' ? (
        <WalkIntentSelector
          selectedIntent={selectedIntent}
          onSelect={setSelectedIntent}
          onBack={cancelRoutineLaunch}
          onContinue={() => setSessionPhase('preparation')}
        />
      ) : null}
      {activeWalkState.status === 'ready' &&
      activeWalkState.value === null &&
      sessionPhase === 'preparation' ? (
        <WalkPreparationForm
          currentState={currentWalkState}
          onStateChange={setCurrentWalkState}
          decisionLaunchRequest={props.decisionLaunchRequest ?? null}
          routineLaunchRequest={props.routineLaunchRequest}
          intent={selectedIntent}
          isSaving={isSaving}
          onBack={
            props.decisionLaunchRequest == null
              ? () => setSessionPhase('intent')
              : cancelDecisionLaunch
          }
          onStart={(draft) => void startPreparedWalk(draft)}
        />
      ) : null}

      {sessionPhase === 'preparation' && error !== null && props.routineLaunchRequest !== null ? (
        <button
          className="secondary-button"
          type="button"
          disabled={isSaving}
          onClick={cancelRoutineLaunch}
        >
          Вернуться к распорядку
        </button>
      ) : null}

      {activeWalkState.status === 'ready' &&
      activeWalkState.value === null &&
      sessionPhase === 'completion' &&
      completedWalk !== null ? (
        <WalkQuickCompletionPanel
          walk={completedWalk}
          isSaving={isSaving}
          error={error}
          onSave={(draft) => void saveWalkOutcome(completedWalk, draft)}
        />
      ) : null}

      {activeWalkState.status === 'ready' &&
      activeWalkState.value === null &&
      sessionPhase === 'reentry' &&
      completedWalk !== null ? (
        <WalkReentryPanel
          decisionContext={decisionContext}
          walk={completedWalk}
          isSaving={isSaving}
          error={error}
          onPrimary={() => void followPrimaryReturn(completedWalk)}
          onCloseWithoutContinuation={() => void followSecondaryReturn(completedWalk)}
        />
      ) : null}

      {activeWalk !== null ||
      sessionPhase === 'completion' ||
      sessionPhase === 'reentry' ||
      message === null ? null : (
        <p className="walks-message" role="status">
          {message}
        </p>
      )}
      {activeWalk !== null ||
      sessionPhase === 'completion' ||
      sessionPhase === 'reentry' ||
      error === null ? null : (
        <p className="walks-message error" role="alert">
          {error}
        </p>
      )}

      {activeWalkState.status === 'ready' &&
      activeWalkState.value === null &&
      sessionPhase === 'center' ? (
        <section className="walk-session-library" aria-labelledby="walk-session-library-title">
          <div className="walk-session-library-heading">
            <div>
              <p className="section-page-eyebrow">Локальная история</p>
              <h2 id="walk-session-library-title">Планы и завершённые прогулки</h2>
            </div>
            <div className="walk-session-library-controls">
              <button
                className="secondary-button"
                type="button"
                aria-expanded={formOpen}
                onClick={() => setFormOpen(true)}
              >
                Запланировать прогулку
              </button>
              <SectionDateNavigator
                currentDate={props.currentDate}
                selectedDate={props.selectedDate}
                onDateChange={changeDate}
              />
            </div>
          </div>
          {formOpen ? (
            <WalkTypeForm
              selectedType={selectedType}
              isSaving={isSaving}
              spheres={spheres}
              sphereId={selectedSphereId}
              onSphereChange={setSelectedSphereId}
              onSelectType={setSelectedType}
              onCancel={() => setFormOpen(false)}
              onSubmit={createPlannedWalk}
            />
          ) : null}
          {startTarget === null ? null : (
            <WalkStartForm
              walk={startTarget}
              isSaving={isSaving}
              onCancel={() => setStartTarget(null)}
              onStart={start}
            />
          )}
          {state.status === 'loading' ? (
            <p className="section-page-message">Загружаем прогулки…</p>
          ) : null}
          {state.status === 'error' ? (
            <section className="section-page-message section-page-error" role="alert">
              <p>Не удалось загрузить прогулки.</p>
              <button className="secondary-button" type="button" onClick={() => void reload()}>
                Повторить
              </button>
            </section>
          ) : null}
          {state.status === 'ready' ? (
            <>
              <label className="walk-sphere-filter action-filter-field">
                <span>Сфера</span>
                <select
                  value={sphereFilter}
                  onChange={(event) => setSphereFilter(event.currentTarget.value)}
                >
                  <option value={SPHERE_FILTER_ALL}>Все сферы</option>
                  <option value={SPHERE_FILTER_NONE}>Без сферы</option>
                  {[...spheres.active, ...spheres.archived].map((sphere) => (
                    <option key={sphere.id.toString()} value={sphere.id.toString()}>
                      {sphere.name}
                      {sphere.status === 'archived' ? ' · Архивная' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <WalkList
                walks={state.value.filter(
                  (walk) =>
                    walk.status === WALK_STATUS.planned && matchesSphereFilter(walk, sphereFilter),
                )}
                spheres={spheres}
                currentDate={props.currentDate}
                selectedDate={props.selectedDate}
                deletingId={deletingId}
                onDelete={remove}
                onStart={setStartTarget}
                onSphereChange={(walk, sphereId) => void updateSphere(walk, sphereId)}
              />
              <WalkResultList
                renderCaptureSummary={(walk) => (
                  <WalkCaptureSummary
                    query={props.getWalkCaptures}
                    walkId={walk.id}
                    onOpen={() => setCaptureView(walk.id)}
                  />
                )}
                walks={state.value.filter(
                  (walk) =>
                    (walk.status === WALK_STATUS.completed ||
                      walk.status === WALK_STATUS.abandoned) &&
                    matchesSphereFilter(walk, sphereFilter),
                )}
                spheres={spheres}
                onSphereChange={(walk, sphereId) => void updateSphere(walk, sphereId)}
                isSaving={isSaving}
                onPhotoChange={updatePhoto}
                onError={setError}
              />
            </>
          ) : null}
          <WalkStatisticsPanel
            state={statisticsState}
            period={statisticsPeriod}
            onPeriodChange={changeStatisticsPeriod}
            onRetry={() => void reloadStatistics()}
          />
        </section>
      ) : null}
    </main>
  );
}

interface WalkStatisticsPanelProps {
  readonly state: WalkStatisticsState;
  readonly period: WalkStatisticsPeriod;
  readonly onPeriodChange: (period: WalkStatisticsPeriod) => void;
  readonly onRetry: () => void;
}

export function WalkStatisticsPanel(props: WalkStatisticsPanelProps) {
  const statistics = props.state.status === 'ready' ? props.state.value : null;

  return (
    <section className="walk-statistics" aria-labelledby="walk-statistics-title">
      <div className="walk-statistics-heading">
        <h2 id="walk-statistics-title">Сводка прогулок</h2>
        <div className="walk-statistics-period" aria-label="Период сводки">
          {WALK_STATISTICS_PERIOD_OPTIONS.map(({ period, label }) => (
            <button
              className="walk-statistics-period-button"
              type="button"
              key={period}
              aria-pressed={props.period === period}
              onClick={() => props.onPeriodChange(period)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {props.state.status === 'loading' ? (
        <p className="walk-statistics-message" role="status">
          Считаем сводку…
        </p>
      ) : null}
      {props.state.status === 'error' ? (
        <div className="walk-statistics-message" role="alert">
          <span>Не удалось загрузить сводку.</span>
          <button className="secondary-button" type="button" onClick={props.onRetry}>
            Повторить
          </button>
        </div>
      ) : null}
      {statistics === null ? null : (
        <>
          <dl className="walk-statistics-metrics">
            <div>
              <dt>Прогулок</dt>
              <dd>{statistics.completedCount}</dd>
            </div>
            <div>
              <dt>Всего времени</dt>
              <dd>{formatStatisticsDuration(statistics.totalDurationMilliseconds)}</dd>
            </div>
            <div>
              <dt>Средняя</dt>
              <dd>
                {statistics.averageDurationMilliseconds === null
                  ? '—'
                  : formatStatisticsDuration(statistics.averageDurationMilliseconds)}
              </dd>
            </div>
          </dl>
          {statistics.completedCount === 0 ? (
            <p className="walk-statistics-empty">Пока нет завершённых прогулок за этот период.</p>
          ) : (
            <div className="walk-statistics-types">
              <h3>По типам</h3>
              <ul>
                {WALK_TYPE_OPTIONS.map((type) => (
                  <li key={type}>
                    <span>{WALK_TYPE_PRESENTATION[type].statisticsLabel}</span>
                    <strong>{statistics.completedByType[type]}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="walk-statistics-abandoned">
            Прервано <strong>{statistics.abandonedCount}</strong>
          </p>
        </>
      )}
    </section>
  );
}

interface WalkTypeFormProps {
  readonly selectedType: WalkType;
  readonly isSaving: boolean;
  readonly spheres?: SpheresSnapshot;
  readonly sphereId?: string | null;
  readonly onSphereChange?: (sphereId: string | null) => void;
  readonly onSelectType: (type: WalkType) => void;
  readonly onCancel: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function WalkTypeForm(props: WalkTypeFormProps) {
  const spheres = props.spheres ?? { active: [], archived: [] };
  const sphereId = props.sphereId ?? null;
  const onSphereChange = props.onSphereChange ?? (() => undefined);
  return (
    <form className="walk-type-form" onSubmit={props.onSubmit}>
      <fieldset disabled={props.isSaving}>
        <legend>Тип прогулки</legend>
        <div className="walk-type-grid">
          {WALK_TYPE_OPTIONS.map((type) => {
            const presentation = WALK_TYPE_PRESENTATION[type];
            return (
              <label className="walk-type-option" key={type}>
                <input
                  type="radio"
                  name="walk-type"
                  value={type}
                  checked={props.selectedType === type}
                  onChange={() => props.onSelectType(type)}
                />
                <span>
                  <strong>{presentation.label}</strong>
                  <small>{presentation.description}</small>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <label className="walk-sphere-field">
        <span>Сфера</span>
        <SphereSelect
          value={sphereId}
          snapshot={spheres}
          disabled={props.isSaving}
          onChange={onSphereChange}
        />
      </label>
      <div className="walk-form-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={props.isSaving}
          onClick={props.onCancel}
        >
          Отмена
        </button>
        <button className="primary-button" type="submit" disabled={props.isSaving}>
          {props.isSaving ? 'Сохраняем…' : 'Запланировать'}
        </button>
      </div>
    </form>
  );
}

interface WalkStartFormProps {
  readonly walk: Walk;
  readonly isSaving: boolean;
  readonly onCancel: () => void;
  readonly onStart: (walk: Walk, mode: WalkMode, timerTargetMinutes?: number) => void;
}

export function WalkStartForm(props: WalkStartFormProps) {
  const [mode, setMode] = useState<WalkMode>(WALK_MODE.stopwatch);
  const [duration, setDuration] = useState('20');
  const numericDuration = Number(duration);
  const durationValid =
    Number.isInteger(numericDuration) && numericDuration >= 1 && numericDuration <= 1440;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (mode === WALK_MODE.timer && !durationValid) return;
    props.onStart(props.walk, mode, mode === WALK_MODE.timer ? numericDuration : undefined);
  }

  return (
    <form className="walk-start-form" onSubmit={submit}>
      <div>
        <p className="section-page-eyebrow">Запуск прогулки</p>
        <h2>{WALK_TYPE_PRESENTATION[props.walk.type].label}</h2>
      </div>
      <fieldset disabled={props.isSaving}>
        <legend>Режим</legend>
        <label>
          <input
            type="radio"
            name="walk-mode"
            checked={mode === WALK_MODE.stopwatch}
            onChange={() => setMode(WALK_MODE.stopwatch)}
          />{' '}
          Секундомер
        </label>
        <label>
          <input
            type="radio"
            name="walk-mode"
            checked={mode === WALK_MODE.timer}
            onChange={() => setMode(WALK_MODE.timer)}
          />{' '}
          Таймер
        </label>
      </fieldset>
      {mode === WALK_MODE.timer ? (
        <div className="walk-duration-field">
          <span>Продолжительность, минут</span>
          <div className="walk-duration-presets">
            {[10, 20, 30, 45, 60].map((minutes) => (
              <button
                className="secondary-button"
                type="button"
                key={minutes}
                onClick={() => setDuration(String(minutes))}
              >
                {minutes}
              </button>
            ))}
          </div>
          <input
            type="number"
            min="1"
            max="1440"
            step="1"
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            aria-invalid={!durationValid}
          />
          {durationValid ? null : <small role="alert">Укажите целое число от 1 до 1440.</small>}
        </div>
      ) : null}
      <div className="walk-form-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={props.isSaving}
          onClick={props.onCancel}
        >
          Отмена
        </button>
        <button
          className="primary-button"
          type="submit"
          disabled={props.isSaving || (mode === WALK_MODE.timer && !durationValid)}
        >
          {props.isSaving ? 'Запускаем…' : 'Начать прогулку'}
        </button>
      </div>
    </form>
  );
}

interface WalkRunningPanelProps {
  readonly walk: Walk;
  readonly now?: Date;
  readonly isSaving?: boolean;
  readonly onComplete?: () => void;
  readonly onAbandon?: () => void;
}

export function WalkRunningPanel({
  walk,
  now: fixedNow,
  isSaving = false,
  onComplete,
  onAbandon,
}: WalkRunningPanelProps) {
  const now = useLiveNow(fixedNow);
  const snapshot = getWalkTimeSnapshot(walk, now);
  const stopwatch = walk.mode === WALK_MODE.stopwatch;
  return (
    <section className="walk-running-panel" aria-label="Текущая прогулка">
      <p className="section-page-eyebrow">Идёт</p>
      <h2>{WALK_TYPE_PRESENTATION[walk.type].label}</h2>
      <p className="walk-running-mode">Режим: {stopwatch ? 'Секундомер' : 'Таймер'}</p>
      <p className="walk-running-time" aria-live="off">
        {stopwatch
          ? formatStopwatch(snapshot.seconds)
          : `осталось ${formatTimer(snapshot.seconds)}`}
      </p>
      {!snapshot.expired ? null : (
        <p className="walk-timer-expired" role="status">
          Время прогулки истекло
        </p>
      )}
      <blockquote>{walk.reflectionQuestion}</blockquote>
      <p>
        Начало:{' '}
        <time dateTime={walk.startedAt?.toISOString()}>{formatStartedAt(walk.startedAt)}</time>
      </p>
      {onComplete === undefined || onAbandon === undefined ? null : (
        <div className="walk-form-actions walk-running-actions">
          <button className="primary-button" type="button" disabled={isSaving} onClick={onComplete}>
            Завершить прогулку
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={isSaving}
            onClick={onAbandon}
          >
            Прервать прогулку
          </button>
        </div>
      )}
    </section>
  );
}

interface WalkCompletionFormProps {
  readonly walk: Walk;
  readonly isSaving: boolean;
  readonly onCancel: () => void;
  readonly onComplete: (walk: Walk, result: string, photo: WalkPhoto | null) => void;
}

export function WalkCompletionForm(props: WalkCompletionFormProps) {
  const [result, setResult] = useState('');
  const [photo, setPhoto] = useState<WalkPhoto | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  async function selectPhoto(file: File | undefined): Promise<void> {
    if (file === undefined) return;
    try {
      setPhoto(await readWalkPhoto(file));
      setPhotoError(null);
    } catch (error: unknown) {
      setPhoto(null);
      setPhotoError(error instanceof Error ? error.message : 'Не удалось прочитать фото.');
    }
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    props.onComplete(props.walk, result, photo);
  }

  return (
    <form className="walk-completion-form" onSubmit={submit}>
      <label>
        <span>Что дала эта прогулка?</span>
        <textarea
          value={result}
          maxLength={MAX_WALK_RESULT_LENGTH}
          rows={4}
          disabled={props.isSaving}
          onChange={(event) => setResult(event.target.value)}
        />
      </label>
      <label className="walk-photo-field">
        <span>Фото (необязательно)</span>
        <input
          type="file"
          accept="image/*"
          disabled={props.isSaving}
          onChange={(event) => void selectPhoto(event.target.files?.[0])}
        />
      </label>
      {photo === null ? null : (
        <div className="walk-photo-preview">
          <img src={photo.dataUrl} alt="Выбранное фото прогулки" />
          <button className="secondary-button" type="button" onClick={() => setPhoto(null)}>
            Удалить фото
          </button>
        </div>
      )}
      {photoError === null ? null : <small role="alert">{photoError}</small>}
      <div className="walk-form-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={props.isSaving}
          onClick={props.onCancel}
        >
          Отмена
        </button>
        <button className="primary-button" type="submit" disabled={props.isSaving}>
          {props.isSaving ? 'Завершаем…' : 'Завершить'}
        </button>
      </div>
    </form>
  );
}

interface WalkResultListProps {
  readonly renderCaptureSummary?: (walk: Walk) => ReactNode;
  readonly walks: readonly Walk[];
  readonly isSaving: boolean;
  readonly onPhotoChange: (walk: Walk, photo: WalkPhoto | null) => void;
  readonly onError: (message: string) => void;
  readonly spheres?: SpheresSnapshot;
  readonly onSphereChange?: (walk: Walk, sphereId: string | null) => void;
}

export function WalkResultList(props: WalkResultListProps) {
  if (props.walks.length === 0) return null;
  const spheres = props.spheres ?? { active: [], archived: [] };
  const onSphereChange = props.onSphereChange ?? (() => undefined);
  return (
    <section className="walk-result-list" aria-label="Завершённые прогулки">
      {props.walks.map((walk) => (
        <WalkResultCard
          captureSummary={props.renderCaptureSummary?.(walk)}
          key={walk.id.toString()}
          walk={walk}
          isSaving={props.isSaving}
          onPhotoChange={props.onPhotoChange}
          onError={props.onError}
          spheres={spheres}
          onSphereChange={onSphereChange}
        />
      ))}
    </section>
  );
}

interface WalkResultCardProps {
  readonly captureSummary?: ReactNode;
  readonly walk: Walk;
  readonly isSaving: boolean;
  readonly onPhotoChange: (walk: Walk, photo: WalkPhoto | null) => void;
  readonly onError: (message: string) => void;
  readonly spheres?: SpheresSnapshot;
  readonly onSphereChange?: (walk: Walk, sphereId: string | null) => void;
}

export function WalkResultCard(props: WalkResultCardProps) {
  const { walk } = props;
  const spheres = props.spheres ?? { active: [], archived: [] };
  const onSphereChange = props.onSphereChange ?? (() => undefined);
  const completed = walk.status === WALK_STATUS.completed;

  async function replacePhoto(file: File | undefined): Promise<void> {
    if (file === undefined) return;
    try {
      props.onPhotoChange(walk, await readWalkPhoto(file));
    } catch (error: unknown) {
      props.onError(error instanceof Error ? error.message : 'Не удалось прочитать фото.');
    }
  }

  return (
    <article className="walk-result-card">
      {props.captureSummary}
      <div className="walk-result-heading">
        <div>
          <p className="section-page-eyebrow">{completed ? 'Завершена' : 'Прервана'}</p>
          <h2>{WALK_TYPE_PRESENTATION[walk.type].label}</h2>
        </div>
        <span className={`walk-status-badge ${completed ? 'completed' : 'abandoned'}`}>
          {completed ? 'Завершена' : 'Прервана'}
        </span>
      </div>
      <dl className="walk-result-details">
        <div>
          <dt>Сфера</dt>
          <dd>
            <SphereBadge sphereId={walk.sphereId?.toString() ?? null} snapshot={spheres} />
          </dd>
        </div>
        <div>
          <dt>Дата</dt>
          <dd>{walk.date.toString()}</dd>
        </div>
        <div>
          <dt>Начало</dt>
          <dd>{formatDateTime(walk.startedAt)}</dd>
        </div>
        <div>
          <dt>Завершение</dt>
          <dd>{formatDateTime(walk.endedAt)}</dd>
        </div>
        <div>
          <dt>Фактическая длительность</dt>
          <dd>{formatActualDuration(walk.actualDurationMilliseconds)}</dd>
        </div>
        <div>
          <dt>Режим</dt>
          <dd>{walk.mode === WALK_MODE.timer ? 'Таймер' : 'Секундомер'}</dd>
        </div>
      </dl>
      <SphereSelect
        value={walk.sphereId?.toString() ?? null}
        snapshot={spheres}
        disabled={props.isSaving}
        onChange={(sphereId) => onSphereChange(walk, sphereId)}
      />
      <div className="walk-result-question">
        <strong>Вопрос</strong>
        <blockquote>{walk.reflectionQuestion}</blockquote>
      </div>
      {walk.result === null ? null : (
        <p className="walk-result-text">
          <strong>Итог:</strong> {walk.result}
        </p>
      )}
      {walk.photo === null ? null : (
        <img
          className="walk-result-photo"
          src={walk.photo.dataUrl}
          alt="Фото завершённой прогулки"
        />
      )}
      {!completed ? null : (
        <div className="walk-photo-actions">
          <label className="secondary-button">
            {walk.photo === null ? 'Добавить фото' : 'Заменить фото'}
            <input
              className="visually-hidden"
              type="file"
              accept="image/*"
              disabled={props.isSaving}
              onChange={(event) => void replacePhoto(event.target.files?.[0])}
            />
          </label>
          {walk.photo === null ? null : (
            <button
              className="secondary-button"
              type="button"
              disabled={props.isSaving}
              onClick={() => props.onPhotoChange(walk, null)}
            >
              Удалить фото
            </button>
          )}
        </div>
      )}
    </article>
  );
}

interface WalkListProps {
  readonly walks: readonly Walk[];
  readonly currentDate?: DayDate;
  readonly selectedDate?: DayDate;
  readonly deletingId: string | null;
  readonly onDelete: (walk: Walk) => void;
  readonly onStart?: (walk: Walk) => void;
  readonly spheres?: SpheresSnapshot;
  readonly onSphereChange?: (walk: Walk, sphereId: string | null) => void;
}

export function WalkList({
  walks,
  currentDate,
  selectedDate,
  deletingId,
  onDelete,
  onStart,
  spheres = { active: [], archived: [] },
  onSphereChange = () => undefined,
}: WalkListProps) {
  if (walks.length === 0)
    return <p className="section-page-message">На эту дату прогулки пока не запланированы.</p>;
  const startAvailable = currentDate !== undefined && selectedDate?.equals(currentDate) === true;
  return (
    <section className="walk-list" aria-label="Прогулки выбранной даты">
      {walks.map((walk) => {
        const presentation = WALK_TYPE_PRESENTATION[walk.type];
        const deleting = deletingId === walk.id.toString();
        return (
          <article className="walk-card" key={walk.id.toString()}>
            <div>
              <p className="section-page-eyebrow">Запланирована</p>
              <h2>{presentation.label}</h2>
              <p>{presentation.description}</p>
              <SphereBadge sphereId={walk.sphereId?.toString() ?? null} snapshot={spheres} />
              <SphereSelect
                value={walk.sphereId?.toString() ?? null}
                snapshot={spheres}
                onChange={(sphereId) => onSphereChange(walk, sphereId)}
              />
              {startAvailable ? null : <p>Начать можно только в запланированную дату.</p>}
            </div>
            <div className="walk-card-actions">
              {onStart === undefined ? null : (
                <button
                  className="primary-button"
                  type="button"
                  disabled={!startAvailable}
                  onClick={() => onStart(walk)}
                >
                  Начать прогулку
                </button>
              )}
              <button
                className="secondary-button walk-delete-button"
                type="button"
                disabled={deleting}
                onClick={() => onDelete(walk)}
              >
                {deleting ? 'Удаляем…' : 'Удалить'}
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function matchesSphereFilter(walk: Walk, filter: string): boolean {
  if (filter === SPHERE_FILTER_ALL) return true;
  if (filter === SPHERE_FILTER_NONE) return walk.sphereId === null;
  return walk.sphereId?.toString() === filter;
}

function useLiveNow(fixedNow: Date | undefined): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (fixedNow !== undefined) return undefined;
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [fixedNow]);
  return fixedNow ?? now;
}

function formatStartedAt(startedAt: Date | null): string {
  return startedAt === null
    ? '—'
    : new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'medium' }).format(
        startedAt,
      );
}

function formatDateTime(value: Date | null): string {
  return value === null
    ? '—'
    : new Intl.DateTimeFormat('ru-RU', {
        dateStyle: 'medium',
        timeStyle: 'medium',
      }).format(value);
}

async function readWalkPhoto(file: File): Promise<WalkPhoto> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Можно прикрепить только изображение.');
  }
  if (file.size < 1 || file.size > MAX_WALK_PHOTO_BYTES) {
    throw new Error(`Размер фото не должен превышать ${MAX_WALK_PHOTO_BYTES / 1024 / 1024} МБ.`);
  }
  const dataUrl = await readFileAsDataUrl(file);
  return { dataUrl, mimeType: file.type, sizeBytes: file.size };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Не удалось прочитать фото.'));
    });
    reader.addEventListener('error', () => reject(new Error('Не удалось прочитать фото.')));
    reader.readAsDataURL(file);
  });
}
