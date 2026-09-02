import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type {
  Clock,
  GetMorningCenterOverview,
  GetMorningCompletionOverview,
  GetMorningHistory,
  GetMorningPhysicalActivationOverview,
  GetMorningPhysicalExecutionOverview,
  MorningCenterOverview,
  MorningCycleApplicationService,
  MorningExerciseCatalogService,
  TomorrowPlanService,
} from '../../application';
import {
  MORNING_CENTER_STAGE_ID,
  MORNING_CENTER_STAGE_STATUS,
  MORNING_COLD_SHOWER_PRESENTATION_STATUS,
  type MorningCenterStageId,
  type MorningCenterStageStatus,
} from '../../application';
import {
  EntityId,
  MORNING_CYCLE_STATE,
  MORNING_SHORTENED_MODE_STATE,
  type DayDate,
  type MorningStartStateInput,
  type MorningShortenedConfiguration,
} from '../../domain';
import { calculateMorningElapsedMinutes } from './MorningCenterTime';
import { MorningPhysicalActivationPage } from './MorningPhysicalActivationPage';
import { MorningPhysicalExecutionPage } from './MorningPhysicalExecutionPage';
import { exerciseCountLabel, setsCountLabel } from './MorningPhysicalCopy';
import {
  MorningMirrorPage,
  formatMorningMirrorTime,
  type MorningMirrorViewState,
} from './MorningMirrorPage';
import { MORNING_STAGE_PRESENTATION } from './MorningStagePresentation';
import { MorningMainActionPage } from './MorningMainActionPage';
import { MorningCompletionPage } from './MorningCompletionPage';
import { MorningShortenedConfigurationPanel } from './MorningShortenedConfiguration';
import { ROUTINE_MORNING_VIEW, type RoutineMorningView } from '../routine/RoutineNavigation';
import { AppIcon } from '../components/AppIcon';

export type MorningCenterViewKind =
  'center' | 'quickStart' | 'physicalActivation' | 'mirror' | 'mainAction' | 'completion';
export type MorningCenterPendingAction =
  | 'start'
  | 'startState'
  | 'water'
  | 'coldShower'
  | 'skipColdShower'
  | 'shorten'
  | 'revertShortened'
  | 'abandonPrevious'
  | 'mirror'
  | 'mainActionCandidate'
  | 'skipMainAction';

interface MorningCenterPageProps {
  readonly date: DayDate;
  readonly dateNavigation?: ReactNode;
  readonly getOverview: Pick<GetMorningCenterOverview, 'execute'>;
  readonly getPhysicalOverview: Pick<GetMorningPhysicalActivationOverview, 'execute'>;
  readonly getPhysicalExecutionOverview: Pick<GetMorningPhysicalExecutionOverview, 'execute'>;
  readonly getCompletionOverview: Pick<GetMorningCompletionOverview, 'execute'>;
  readonly getHistory: Pick<GetMorningHistory, 'execute'>;
  readonly morningView: RoutineMorningView | null;
  readonly onMorningViewChange: (view: RoutineMorningView | null) => void;
  readonly cycle: Pick<
    MorningCycleApplicationService,
    | 'start'
    | 'recordStartState'
    | 'completeWater'
    | 'completeColdShower'
    | 'skipColdShower'
    | 'shorten'
    | 'activateShortened'
    | 'revertShortened'
    | 'abandonUnfinished'
    | 'selectPhysicalExercise'
    | 'deselectPhysicalExercise'
    | 'adjustPhysicalExercise'
    | 'startPhysicalExecution'
    | 'recoverPhysicalExecution'
    | 'pausePhysicalExecution'
    | 'resumePhysicalExecution'
    | 'completePhysicalSet'
    | 'skipPhysicalSet'
    | 'advancePhysicalExecution'
    | 'completePhysicalExecution'
    | 'completeMirror'
    | 'skipMainAction'
    | 'reconcileReadyToWork'
    | 'finish'
  >;
  readonly exerciseCatalog: Pick<MorningExerciseCatalogService, 'createCustom'>;
  readonly tomorrowPlan: Pick<TomorrowPlanService, 'assignFirstActionForTargetDate'>;
  readonly onScheduleMainAction: (actionId: EntityId) => void;
  readonly onWorkBlockStarted: () => void;
  readonly clock: Pick<Clock, 'now'>;
}

interface MorningCenterViewProps {
  readonly overview: MorningCenterOverview;
  readonly dateNavigation?: ReactNode;
  readonly view: MorningCenterViewKind;
  readonly elapsedMinutes: number;
  readonly pendingAction: MorningCenterPendingAction | null;
  readonly mutationError: string | null;
  readonly onStart: () => void;
  readonly onRecordStartState: (input: MorningStartStateInput) => Promise<boolean>;
  readonly onOpenQuickStart: () => void;
  readonly onOpenPhysicalActivation: () => void;
  readonly onOpenMirror: () => void;
  readonly onOpenMainAction: () => void;
  readonly onContinuePhysicalExecution: () => void;
  readonly onOpenCompletion?: () => void;
  readonly onBackToCenter: () => void;
  readonly onAdvanceFromQuickStart: () => void;
  readonly onCompleteWater: () => void;
  readonly onCompleteColdShower: () => void;
  readonly onSkipColdShower: () => void;
  readonly onShorten: (configuration: MorningShortenedConfiguration) => void;
  readonly onRevertShortened: () => void;
  readonly onAbandonPrevious: () => void;
  readonly selectedMainActionCandidateId?: string | null;
  readonly onMainActionCandidateChange?: (candidateId: string) => void;
  readonly onSelectMainActionCandidate?: () => void;
  readonly onScheduleMainAction?: () => void;
  readonly onSkipMainAction?: () => void;
}

type MorningCenterLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly overview: MorningCenterOverview };

export function MorningCenterPage(props: MorningCenterPageProps) {
  const [loadState, setLoadState] = useState<MorningCenterLoadState>({ status: 'loading' });
  const [view, setView] = useState<MorningCenterViewKind>('center');
  const [pendingAction, setPendingAction] = useState<MorningCenterPendingAction | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [mirrorSuccess, setMirrorSuccess] = useState(false);
  const [selectedMainActionCandidateId, setSelectedMainActionCandidateId] = useState<string | null>(
    null,
  );
  const [now, setNow] = useState(() => props.clock.now());
  const restoreQuickStartFocus = useRef(false);
  const restorePhysicalFocus = useRef(false);
  const restoreMirrorFocus = useRef(false);
  const focusNextStage = useRef(false);

  useEffect(() => {
    let active = true;
    void props.getOverview.execute(props.date).then(
      async (loaded) => {
        const overview =
          loaded.mutable && loaded.cycleState === MORNING_CYCLE_STATE.inProgress
            ? await props.cycle
                .reconcileReadyToWork(props.date)
                .then(() => props.getOverview.execute(props.date))
            : loaded;
        if (active) setLoadState({ status: 'ready', overview });
      },
      (error: unknown) => {
        if (active) setLoadState({ status: 'error', message: errorMessage(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [props.cycle, props.date, props.getOverview]);

  useEffect(() => {
    if (
      loadState.status !== 'ready' ||
      loadState.overview.startedAt === null ||
      loadState.overview.finishedAt !== null
    ) {
      return;
    }
    const timer = window.setInterval(() => setNow(props.clock.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [loadState, props.clock]);

  useEffect(() => {
    if (loadState.status !== 'ready') return;
    if (view === 'quickStart') {
      document.getElementById('morning-quick-start-heading')?.focus();
      return;
    }
    if (view === 'physicalActivation') {
      document.getElementById('morning-physical-heading')?.focus();
      return;
    }
    if (view === 'mirror') {
      document.getElementById('morning-mirror-heading')?.focus();
      return;
    }
    if (view === 'mainAction') {
      document.getElementById('morning-main-action-heading')?.focus();
      return;
    }
    if (restoreQuickStartFocus.current) {
      restoreQuickStartFocus.current = false;
      document.getElementById('morning-quick-start-trigger')?.focus();
      return;
    }
    if (restorePhysicalFocus.current) {
      restorePhysicalFocus.current = false;
      document.getElementById('morning-physical-trigger')?.focus();
      return;
    }
    if (restoreMirrorFocus.current) {
      restoreMirrorFocus.current = false;
      document.getElementById('morning-mirror-trigger')?.focus();
      return;
    }
    if (focusNextStage.current) {
      focusNextStage.current = false;
      document.getElementById('morning-current-stage')?.focus();
    }
  }, [loadState.status, props.morningView, view]);

  useEffect(() => {
    if (
      !mirrorSuccess ||
      view !== 'mirror' ||
      loadState.status !== 'ready' ||
      loadState.overview.mirror.status !== 'completed'
    ) {
      return;
    }
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    const timer = window.setTimeout(() => {
      focusNextStage.current = true;
      setMirrorSuccess(false);
      setView('center');
    }, mirrorSuccessDelay(reducedMotion));
    return () => window.clearTimeout(timer);
  }, [loadState, mirrorSuccess, view]);

  async function reload(): Promise<void> {
    setLoadState({ status: 'loading' });
    setMutationError(null);
    try {
      const overview = await props.getOverview.execute(props.date);
      setLoadState({ status: 'ready', overview });
    } catch (error: unknown) {
      setLoadState({ status: 'error', message: errorMessage(error) });
    }
  }

  async function mutate(
    action: MorningCenterPendingAction,
    command: () => Promise<unknown>,
    nextView?: MorningCenterViewKind,
  ): Promise<boolean> {
    if (pendingAction !== null) return false;
    setPendingAction(action);
    setMutationError(null);
    try {
      await command();
      const overview = await props.getOverview.execute(props.date);
      setLoadState({ status: 'ready', overview });
      if (nextView !== undefined) setView(nextView);
      setNow(props.clock.now());
      return true;
    } catch (error: unknown) {
      setMutationError(errorMessage(error));
      return false;
    } finally {
      setPendingAction(null);
    }
  }

  async function completeMirror(): Promise<void> {
    if (pendingAction !== null) return;
    setPendingAction('mirror');
    setMutationError(null);
    setMirrorSuccess(false);
    try {
      await props.cycle.completeMirror(props.date);
      const overview = await props.getOverview.execute(props.date);
      setLoadState({ status: 'ready', overview });
      setMirrorSuccess(true);
      setNow(props.clock.now());
    } catch (error: unknown) {
      setMutationError(errorMessage(error));
    } finally {
      setPendingAction(null);
    }
  }

  function openMainAction(): void {
    setMutationError(null);
    if (loadState.status === 'ready') {
      setSelectedMainActionCandidateId(
        loadState.overview.mainAction.firstStepId?.toString() ??
          loadState.overview.mainAction.candidates[0]?.id.toString() ??
          null,
      );
    }
    setView('mainAction');
  }

  function selectMainActionCandidate(): void {
    if (selectedMainActionCandidateId === null) return;
    void mutate(
      'mainActionCandidate',
      () =>
        props.tomorrowPlan.assignFirstActionForTargetDate(
          props.date,
          EntityId.create(selectedMainActionCandidateId),
        ),
      'mainAction',
    );
  }

  if (props.morningView === ROUTINE_MORNING_VIEW.physicalExecution) {
    return (
      <>
        {props.dateNavigation}
        <MorningPhysicalExecutionPage
          date={props.date}
          getOverview={props.getPhysicalExecutionOverview}
          cycle={props.cycle}
          clock={props.clock}
          onBack={() => {
            restorePhysicalFocus.current = true;
            setLoadState({ status: 'loading' });
            props.onMorningViewChange(null);
            void props.getOverview.execute(props.date).then(
              (overview) => setLoadState({ status: 'ready', overview }),
              (error: unknown) => setLoadState({ status: 'error', message: errorMessage(error) }),
            );
          }}
          onCompleted={() => {
            focusNextStage.current = true;
            void finishMorningPhysicalExecutionView(async () => {
              const overview = await props.getOverview.execute(props.date);
              setLoadState({ status: 'ready', overview });
            }, props.onMorningViewChange).catch((error: unknown) =>
              setLoadState({ status: 'error', message: errorMessage(error) }),
            );
          }}
        />
      </>
    );
  }

  if (loadState.status === 'loading') {
    return (
      <>
        {props.dateNavigation}
        <section className="morning-center-state" aria-live="polite">
          <p>Загружаем утренний центр…</p>
        </section>
      </>
    );
  }

  if (loadState.status === 'error') {
    return (
      <>
        {props.dateNavigation}
        <MorningCenterLoadErrorView message={loadState.message} onRetry={() => void reload()} />
      </>
    );
  }

  const elapsedMinutes = calculateMorningElapsedMinutes(loadState.overview, now);
  const previousDate = loadState.overview.previousUnfinished?.date;

  if (view === 'completion' || loadState.overview.cycleState === MORNING_CYCLE_STATE.finished) {
    return (
      <>
        {props.dateNavigation}
        <MorningCompletionPage
          date={props.date}
          getOverview={props.getCompletionOverview}
          getHistory={props.getHistory}
          cycle={props.cycle}
          onBack={
            loadState.overview.cycleState === MORNING_CYCLE_STATE.finished
              ? undefined
              : () => setView('center')
          }
          onWorkBlockStarted={props.onWorkBlockStarted}
        />
      </>
    );
  }

  if (view === 'physicalActivation') {
    return (
      <>
        {props.dateNavigation}
        <MorningPhysicalActivationPage
          date={props.date}
          getOverview={props.getPhysicalOverview}
          cycle={props.cycle}
          exerciseCatalog={props.exerciseCatalog}
          onExecutionStarted={() => {
            setView('center');
            openMorningPhysicalExecution(props.onMorningViewChange);
          }}
          onBack={() => {
            restorePhysicalFocus.current = true;
            void props.getOverview.execute(props.date).then(
              (overview) => {
                setLoadState({ status: 'ready', overview });
                setView('center');
              },
              (error: unknown) => setMutationError(errorMessage(error)),
            );
          }}
        />
      </>
    );
  }

  if (view === 'mirror') {
    const mirrorStage = loadState.overview.stages.find(
      (stage) => stage.id === MORNING_CENTER_STAGE_ID.mirror,
    );
    return (
      <>
        {props.dateNavigation}
        <MorningMirrorPage
          stages={loadState.overview.stages}
          estimatedMinutes={mirrorStage?.estimatedMinutes ?? 0}
          completedAt={loadState.overview.mirror.completedAt}
          state={resolveMirrorViewState(
            loadState.overview,
            pendingAction,
            mutationError,
            mirrorSuccess,
          )}
          onBack={() => {
            restoreMirrorFocus.current = true;
            setMutationError(null);
            setMirrorSuccess(false);
            setView('center');
          }}
          onComplete={() => void completeMirror()}
          onRetry={() => void completeMirror()}
        />
      </>
    );
  }

  return (
    <MorningCenterView
      overview={loadState.overview}
      dateNavigation={props.dateNavigation}
      view={view}
      elapsedMinutes={elapsedMinutes}
      pendingAction={pendingAction}
      mutationError={mutationError}
      onStart={() => void mutate('start', () => props.cycle.start(props.date), 'quickStart')}
      onRecordStartState={(input) =>
        mutate('startState', () => props.cycle.recordStartState(props.date, input))
      }
      onOpenQuickStart={() => setView('quickStart')}
      onOpenPhysicalActivation={() => setView('physicalActivation')}
      onOpenMirror={() => {
        setMutationError(null);
        setMirrorSuccess(false);
        setView('mirror');
      }}
      onOpenMainAction={openMainAction}
      onContinuePhysicalExecution={() => openMorningPhysicalExecution(props.onMorningViewChange)}
      onOpenCompletion={() => setView('completion')}
      onBackToCenter={() => {
        restoreQuickStartFocus.current = true;
        setView('center');
      }}
      onAdvanceFromQuickStart={() => {
        focusNextStage.current = true;
        setView('center');
      }}
      onCompleteWater={() => void mutate('water', () => props.cycle.completeWater(props.date))}
      onCompleteColdShower={() =>
        void mutate('coldShower', () => props.cycle.completeColdShower(props.date))
      }
      onSkipColdShower={() =>
        void mutate('skipColdShower', () => props.cycle.skipColdShower(props.date))
      }
      onShorten={(configuration) =>
        void mutate('shorten', () => props.cycle.activateShortened(props.date, configuration))
      }
      onRevertShortened={() =>
        void mutate('revertShortened', () => props.cycle.revertShortened(props.date))
      }
      selectedMainActionCandidateId={selectedMainActionCandidateId}
      onMainActionCandidateChange={setSelectedMainActionCandidateId}
      onSelectMainActionCandidate={selectMainActionCandidate}
      onScheduleMainAction={() => {
        const actionId = loadState.overview.mainAction.firstStepId;
        if (actionId !== null) props.onScheduleMainAction(actionId);
      }}
      onSkipMainAction={() =>
        void mutate('skipMainAction', () => props.cycle.skipMainAction(props.date), 'center')
      }
      onAbandonPrevious={() => {
        if (previousDate !== undefined) {
          void mutate('abandonPrevious', () => props.cycle.abandonUnfinished(previousDate));
        }
      }}
    />
  );
}

export function MorningCenterLoadErrorView(props: {
  readonly message: string;
  readonly onRetry: () => void;
}) {
  return (
    <section className="morning-center-state morning-center-error" role="alert">
      <h2>Утренний центр недоступен</h2>
      <p>{props.message}</p>
      <button className="secondary-button" type="button" onClick={props.onRetry}>
        Повторить загрузку
      </button>
    </section>
  );
}

export function MorningCenterView(props: MorningCenterViewProps) {
  const [shortenedConfigurationOpen, setShortenedConfigurationOpen] = useState(false);
  if (props.view === 'quickStart') {
    return (
      <>
        {props.dateNavigation}
        <QuickStartView {...props} />
      </>
    );
  }
  if (props.view === 'mainAction') {
    return (
      <>
        {props.dateNavigation}
        <MorningMainActionPage
          overview={props.overview.mainAction}
          mutable={props.overview.mutable}
          busy={props.pendingAction !== null}
          error={props.mutationError}
          selectedCandidateId={props.selectedMainActionCandidateId ?? null}
          onBack={props.onBackToCenter}
          onCandidateChange={props.onMainActionCandidateChange ?? (() => undefined)}
          onSelectCandidate={props.onSelectMainActionCandidate ?? (() => undefined)}
          onSchedule={props.onScheduleMainAction ?? (() => undefined)}
          onSkip={props.onSkipMainAction ?? (() => undefined)}
        />
      </>
    );
  }
  const busy = props.pendingAction !== null;
  const canOpenQuickStart = props.overview.cycleState !== null;
  const stageEntries = props.overview.stages.map((stage, index) => ({ stage, index }));
  const quickStartEntries = stageEntries.filter(
    ({ stage }) => stage.id === MORNING_CENTER_STAGE_ID.quickStart,
  );
  const laterEntries = stageEntries.filter(
    ({ stage }) => stage.id !== MORNING_CENTER_STAGE_ID.quickStart,
  );
  const prepared = props.overview.cycleState === MORNING_CYCLE_STATE.readyToWork;

  return (
    <section className="morning-center" aria-busy={busy}>
      <header className="morning-center-hero">
        <div className="morning-center-status-panel">
          {prepared ? <span className="visually-hidden">Утро подготовлено</span> : null}
          <div
            className="morning-center-progress-ring"
            role="progressbar"
            aria-label="Общий прогресс утра"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={props.overview.overallProgressPercent}
            style={
              {
                '--morning-progress': `${props.overview.overallProgressPercent * 3.6}deg`,
              } as CSSProperties
            }
          >
            <div className="morning-center-progress">
              <strong>{props.overview.overallProgressPercent}%</strong>
              <span>готово</span>
            </div>
          </div>
          <div className="morning-center-metric-divider" aria-hidden="true" />
          <div className="morning-center-time" aria-label="Оставшееся время">
            <strong>◷&nbsp; ≈ {props.overview.remainingMinutes} мин</strong>
            <span>осталось ориентировочно</span>
          </div>
          {props.overview.shortenedMode ? null : (
            <button
              className="morning-shorten-button"
              type="button"
              disabled={busy || !props.overview.canShorten}
              onClick={() => setShortenedConfigurationOpen(true)}
            >
              ⚡︎&nbsp; Сократить утро
            </button>
          )}
        </div>
      </header>

      {props.dateNavigation}

      {props.overview.previousUnfinished === null ? null : (
        <aside className="morning-recovery-card" aria-label="Незавершённое прошлое утро">
          <div>
            <strong>
              Незавершённое утро за {formatDate(props.overview.previousUnfinished.date)}
            </strong>
            <p>Закройте прошлый запуск, чтобы начать новое утро с чистого состояния.</p>
          </div>
          {props.overview.canAbandonPrevious ? (
            <button
              className="morning-destructive-button"
              type="button"
              disabled={busy}
              onClick={props.onAbandonPrevious}
            >
              {props.pendingAction === 'abandonPrevious' ? 'Закрываем…' : 'Закрыть прошлый запуск'}
            </button>
          ) : null}
        </aside>
      )}

      {props.mutationError === null ? null : (
        <p className="morning-center-message error" role="alert">
          {props.mutationError}
        </p>
      )}

      {shortenedConfigurationOpen && !props.overview.shortenedMode ? (
        <MorningShortenedConfigurationPanel
          busy={busy}
          onApply={(configuration) => {
            props.onShorten(configuration);
            setShortenedConfigurationOpen(false);
          }}
          onCancel={() => setShortenedConfigurationOpen(false)}
        />
      ) : null}

      {props.overview.shortenedMode ? (
        <div className="morning-shortened-state" role="status" aria-live="polite">
          <div>
            <strong>Сокращённый режим</strong>
            <span>Оставшаяся часть обновлена. Текущий подход не изменится посередине.</span>
          </div>
          {props.overview.canRevertShortened ? (
            <button
              className="secondary-button"
              type="button"
              disabled={busy}
              onClick={props.onRevertShortened}
            >
              {props.pendingAction === 'revertShortened'
                ? 'Возвращаем…'
                : 'Вернуться к обычному режиму'}
            </button>
          ) : null}
        </div>
      ) : null}

      {props.overview.shortenedModeState === MORNING_SHORTENED_MODE_STATE.revertedToNormal ? (
        <p className="morning-restored-state" role="status" aria-live="polite">
          Обычный режим восстановлен. Уже завершённые и пропущенные действия сохранены.
        </p>
      ) : null}

      {!props.overview.mutable ? (
        <p className="morning-readonly-note" role="status">
          Режим просмотра: изменить утро можно только для текущей даты.
        </p>
      ) : null}

      <div className="morning-stage-flow" aria-label="Этапы утреннего распорядка">
        <div className="morning-stage-primary">
          <MorningStageGroup
            label="Сейчас"
            tone="current"
            entries={quickStartEntries}
            overview={props.overview}
            canOpenQuickStart={canOpenQuickStart}
            busy={busy}
            pendingAction={props.pendingAction}
            onStart={props.onStart}
            onOpenQuickStart={props.onOpenQuickStart}
            onOpenPhysicalActivation={props.onOpenPhysicalActivation}
            onOpenMirror={props.onOpenMirror}
            onOpenMainAction={props.onOpenMainAction}
            onContinuePhysicalExecution={props.onContinuePhysicalExecution}
            onOpenCompletion={props.onOpenCompletion ?? (() => undefined)}
          />
          <MorningStartStatePanel
            overview={props.overview}
            busy={busy}
            pending={props.pendingAction === 'startState'}
            error={props.mutationError}
            onRecord={props.onRecordStartState}
          />
        </div>
        <MorningStageGroup
          label="Дальше"
          tone="upcoming"
          entries={laterEntries}
          overview={props.overview}
          canOpenQuickStart={canOpenQuickStart}
          busy={busy}
          pendingAction={props.pendingAction}
          onStart={props.onStart}
          onOpenQuickStart={props.onOpenQuickStart}
          onOpenPhysicalActivation={props.onOpenPhysicalActivation}
          onOpenMirror={props.onOpenMirror}
          onOpenMainAction={props.onOpenMainAction}
          onContinuePhysicalExecution={props.onContinuePhysicalExecution}
          onOpenCompletion={props.onOpenCompletion ?? (() => undefined)}
        />
      </div>

      <aside className="morning-center-support" aria-label="Утренний ориентир">
        <span className="morning-center-support-icon" aria-hidden="true">
          ☼
        </span>
        <div>
          <strong>Утро задаёт тон всему дню</strong>
          <p>Держи фокус на следующем шаге и двигайся спокойно.</p>
        </div>
      </aside>
    </section>
  );
}

function MorningStartStatePanel(props: {
  readonly overview: MorningCenterOverview;
  readonly busy: boolean;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onRecord: (input: MorningStartStateInput) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [energy, setEnergy] = useState(props.overview.startState?.energy ?? 5);
  const [clarity, setClarity] = useState(props.overview.startState?.clarity ?? 5);
  const [mood, setMood] = useState(props.overview.startState?.mood ?? '');
  const state = props.overview.startState;

  return (
    <section
      className="morning-start-state"
      aria-label="Состояние перед стартом"
      data-morning-start-state-tone="neutral"
    >
      <p className="morning-start-state-heading">Состояние перед стартом</p>
      <div className="morning-start-state-content">
        <dl className="morning-start-state-metrics">
          <div>
            <dt>
              <span aria-hidden="true">⚡︎</span> Энергия
            </dt>
            <dd>{state === null ? '—/10' : `${state.energy}/10`}</dd>
          </div>
          <div>
            <dt>
              <span aria-hidden="true">◎</span> Ясность
            </dt>
            <dd>{state === null ? '—/10' : `${state.clarity}/10`}</dd>
          </div>
          <div>
            <dt>
              <span aria-hidden="true">◉</span> Настрой:
            </dt>
            <dd>{state?.mood ?? 'не отмечен'}</dd>
          </div>
        </dl>
        {props.overview.canRecordStartState ? (
          <button
            className="morning-start-state-action"
            type="button"
            disabled={props.busy}
            aria-expanded={editing}
            onClick={() => setEditing((current) => !current)}
          >
            Отметить состояние →
          </button>
        ) : null}
      </div>
      {editing ? (
        <form
          className="morning-start-state-form"
          onSubmit={(event) => {
            event.preventDefault();
            void props.onRecord({ energy, clarity, mood }).then((saved) => {
              if (saved) setEditing(false);
            });
          }}
        >
          <label>
            <span>Энергия</span>
            <input
              type="number"
              min={1}
              max={10}
              required
              value={energy}
              disabled={props.busy}
              onChange={(event) => setEnergy(Number(event.currentTarget.value))}
            />
          </label>
          <label>
            <span>Ясность</span>
            <input
              type="number"
              min={1}
              max={10}
              required
              value={clarity}
              disabled={props.busy}
              onChange={(event) => setClarity(Number(event.currentTarget.value))}
            />
          </label>
          <label className="morning-start-state-mood">
            <span>Настрой</span>
            <input
              type="text"
              required
              value={mood}
              disabled={props.busy}
              onChange={(event) => setMood(event.currentTarget.value)}
            />
          </label>
          <div className="morning-start-state-buttons">
            <button className="primary-button" type="submit" disabled={props.busy}>
              {props.pending ? 'Сохраняем…' : 'Сохранить'}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={props.busy}
              onClick={() => setEditing(false)}
            >
              Отмена
            </button>
          </div>
          {props.error === null ? null : <p role="alert">{props.error}</p>}
        </form>
      ) : null}
    </section>
  );
}

function QuickStartView(props: MorningCenterViewProps) {
  const busy = props.pendingAction !== null;
  const waterCompleted = props.overview.quickStart.water === 'completed';
  const showerPending =
    props.overview.quickStart.coldShower === MORNING_COLD_SHOWER_PRESENTATION_STATUS.pending;
  const showerCompleted =
    props.overview.quickStart.coldShower === MORNING_COLD_SHOWER_PRESENTATION_STATUS.completed;
  const showerSkipped =
    props.overview.quickStart.coldShower === MORNING_COLD_SHOWER_PRESENTATION_STATUS.skipped;
  const showerCurrent = waterCompleted && showerPending;
  const showerStepStatus = showerCompleted
    ? 'completed'
    : showerSkipped
      ? 'skipped'
      : showerCurrent
        ? 'current'
        : 'future';

  return (
    <section className="morning-center morning-quick-start" aria-busy={busy}>
      <div className="morning-quick-start-navigation">
        <button
          className="morning-back-button"
          type="button"
          disabled={busy}
          onClick={props.onBackToCenter}
        >
          ← Утренний центр
        </button>
        <span>Этап 01</span>
      </div>
      <header className="morning-quick-start-header">
        <div>
          <p className="morning-center-eyebrow">Вода · холодный душ</p>
          <h2 id="morning-quick-start-heading" tabIndex={-1}>
            Быстрый старт
          </h2>
          <p>Вода и холодный душ — быстрый переход от сна к активности.</p>
        </div>
        <div className="morning-quick-start-count" aria-label="Сводка быстрого старта">
          <strong>
            {props.overview.quickStart.resolvedCount} из {props.overview.quickStart.total}
          </strong>
          <span>Прошло {props.elapsedMinutes} мин</span>
        </div>
      </header>

      <ol
        className={`morning-quick-start-steps morning-quick-start-steps-${props.overview.quickStart.resolvedCount}`}
        aria-label="Шаги быстрого старта"
      >
        <li data-quick-start-step-status={waterCompleted ? 'completed' : 'current'}>
          <span className="morning-quick-start-step-index" aria-hidden="true">
            {waterCompleted ? <AppIcon name="completed" /> : '1'}
          </span>
          <span>Вода</span>
          <span className="visually-hidden">{waterCompleted ? 'выполнено' : 'текущий шаг'}</span>
        </li>
        <li data-quick-start-step-status={showerStepStatus}>
          <span className="morning-quick-start-step-index" aria-hidden="true">
            {showerCompleted ? <AppIcon name="completed" /> : '2'}
          </span>
          <span>Душ</span>
          <span className="visually-hidden">
            {showerCompleted
              ? 'выполнено'
              : showerSkipped
                ? 'пропущено'
                : showerCurrent
                  ? 'текущий шаг'
                  : 'будущий шаг'}
          </span>
        </li>
      </ol>

      {!props.overview.mutable ? (
        <p className="morning-readonly-note" role="status">
          Режим просмотра: факты этого утра доступны только для чтения.
        </p>
      ) : null}
      {props.mutationError === null ? null : (
        <p className="morning-center-message error" role="alert">
          {props.mutationError}
        </p>
      )}

      <div className="morning-quick-start-grid">
        <article
          className={`morning-action-card morning-action-card-${waterCompleted ? 'completed morning-action-card-compact' : 'current'}`}
          data-morning-action-status={waterCompleted ? 'completed' : 'current'}
        >
          <div className="morning-action-icon" aria-hidden="true">
            <AppIcon name={waterCompleted ? 'completed' : 'water'} />
          </div>
          <div className="morning-action-copy">
            <span className="morning-action-index">01</span>
            <h3>Стакан воды</h3>
            <p className="morning-action-description">250 мл после пробуждения</p>
            <span className="morning-action-duration">≈ 1 мин</span>
            {waterCompleted ? null : (
              <p className="morning-action-guidance">
                Восстановите воду после сна перед следующим этапом.
              </p>
            )}
          </div>
          {waterCompleted ? (
            <strong className="morning-success-label">✓ Выполнено</strong>
          ) : props.overview.canUseQuickStart ? (
            <button
              className="primary-button"
              type="button"
              disabled={busy}
              onClick={props.onCompleteWater}
            >
              {props.pendingAction === 'water' ? 'Сохраняем…' : 'Выпил воду'}
            </button>
          ) : (
            <span className="morning-stage-status">Не выполнено</span>
          )}
        </article>

        <article
          className={`morning-action-card morning-action-card-${
            showerCompleted
              ? 'completed morning-action-card-compact'
              : showerSkipped
                ? 'skipped morning-action-card-compact'
                : waterCompleted
                  ? 'current'
                  : 'upcoming'
          }`}
          data-morning-action-status={
            showerCompleted
              ? 'completed'
              : showerSkipped
                ? 'skipped'
                : waterCompleted
                  ? 'current'
                  : 'upcoming'
          }
        >
          <div className="morning-action-icon" aria-hidden="true">
            <AppIcon name={showerCompleted ? 'completed' : 'shower'} />
          </div>
          <div className="morning-action-copy">
            <span className="morning-action-index">02</span>
            <h3>Холодный душ</h3>
            <p className="morning-action-description">Короткий холодный душ для бодрого старта</p>
            <span className="morning-action-duration">≈ 3 мин</span>
          </div>
          {showerCompleted ? (
            <strong className="morning-success-label">✓ Выполнено</strong>
          ) : showerSkipped ? (
            <strong className="morning-neutral-label">Пропущен сегодня</strong>
          ) : props.overview.canUseQuickStart && showerCurrent ? (
            <div className="morning-action-buttons">
              <button
                className="primary-button"
                type="button"
                disabled={busy}
                onClick={props.onCompleteColdShower}
              >
                {props.pendingAction === 'coldShower' ? 'Сохраняем…' : 'Холодный душ выполнен'}
              </button>
              <button
                className="secondary-button morning-skip-button"
                type="button"
                disabled={busy}
                onClick={props.onSkipColdShower}
              >
                {props.pendingAction === 'skipColdShower' ? 'Пропускаем…' : 'Пропустить сегодня'}
              </button>
            </div>
          ) : (
            <span className="morning-stage-status">
              {props.overview.canUseQuickStart && !waterCompleted
                ? 'Следующий шаг'
                : 'Не выполнено'}
            </span>
          )}
        </article>
      </div>

      {props.overview.quickStart.completed ? (
        <section className="morning-quick-start-success" role="status">
          <div>
            <div className="morning-quick-start-success-heading">
              <strong>✓ Быстрый старт завершён</strong>
              <span>≈ 5 мин</span>
            </div>
            <p>Следующий этап — физическая активность</p>
          </div>
          <button
            className="secondary-button"
            type="button"
            disabled={busy}
            onClick={props.onAdvanceFromQuickStart}
          >
            К обзору утра
          </button>
        </section>
      ) : null}
    </section>
  );
}

type MorningStageEntry = {
  readonly stage: MorningCenterOverview['stages'][number];
  readonly index: number;
};

function MorningStageGroup(props: {
  readonly label: string;
  readonly tone: 'completed' | 'current' | 'upcoming';
  readonly entries: readonly MorningStageEntry[];
  readonly overview: MorningCenterOverview;
  readonly canOpenQuickStart: boolean;
  readonly busy: boolean;
  readonly pendingAction: MorningCenterPendingAction | null;
  readonly onStart: () => void;
  readonly onOpenQuickStart: () => void;
  readonly onOpenPhysicalActivation: () => void;
  readonly onOpenMirror: () => void;
  readonly onOpenMainAction: () => void;
  readonly onContinuePhysicalExecution: () => void;
  readonly onOpenCompletion: () => void;
}) {
  if (props.entries.length === 0) return null;

  return (
    <section className={`morning-stage-group morning-stage-group-${props.tone}`}>
      <p className="morning-stage-group-label">{props.label}</p>
      <ol className="morning-stage-list">
        {props.entries.map(({ stage, index }) => (
          <MorningStageCard
            key={stage.id}
            id={stage.id}
            index={String(index + 1).padStart(2, '0')}
            status={stage.status}
            scenarioStatus={stage.scenarioStatus}
            estimatedMinutes={stage.estimatedMinutes}
            canStart={props.overview.canStart}
            canOpenQuickStart={props.canOpenQuickStart}
            quickStartMutable={props.overview.canUseQuickStart}
            physicalMutable={props.overview.mutable}
            quickStartColdShower={props.overview.quickStart.coldShower}
            busy={props.busy}
            pendingAction={props.pendingAction}
            onStart={props.onStart}
            onOpenQuickStart={props.onOpenQuickStart}
            onOpenPhysicalActivation={props.onOpenPhysicalActivation}
            onOpenMirror={props.onOpenMirror}
            onOpenMainAction={props.onOpenMainAction}
            physicalPlan={props.overview.physicalPlan}
            physicalExecution={props.overview.physicalExecution}
            mirror={props.overview.mirror}
            mainAction={props.overview.mainAction}
            onContinuePhysicalExecution={props.onContinuePhysicalExecution}
            onOpenCompletion={props.onOpenCompletion}
          />
        ))}
      </ol>
    </section>
  );
}

function MorningStageCard(props: {
  readonly id: MorningCenterStageId;
  readonly index: string;
  readonly status: MorningCenterStageStatus;
  readonly scenarioStatus: MorningCenterOverview['stages'][number]['scenarioStatus'];
  readonly estimatedMinutes: number;
  readonly canStart: boolean;
  readonly canOpenQuickStart: boolean;
  readonly quickStartMutable: boolean;
  readonly physicalMutable: boolean;
  readonly quickStartColdShower: MorningCenterOverview['quickStart']['coldShower'];
  readonly busy: boolean;
  readonly pendingAction: MorningCenterPendingAction | null;
  readonly onStart: () => void;
  readonly onOpenQuickStart: () => void;
  readonly onOpenPhysicalActivation: () => void;
  readonly onOpenMirror: () => void;
  readonly onOpenMainAction: () => void;
  readonly onContinuePhysicalExecution: () => void;
  readonly onOpenCompletion: () => void;
  readonly physicalPlan: MorningCenterOverview['physicalPlan'];
  readonly physicalExecution: MorningCenterOverview['physicalExecution'];
  readonly mirror: MorningCenterOverview['mirror'];
  readonly mainAction: MorningCenterOverview['mainAction'];
}) {
  const copy = MORNING_STAGE_PRESENTATION[props.id];
  const current = props.status === MORNING_CENTER_STAGE_STATUS.current;
  const semanticTone =
    props.status === MORNING_CENTER_STAGE_STATUS.completed
      ? 'completed'
      : current
        ? 'current'
        : 'neutral';
  const quickStart = props.id === MORNING_CENTER_STAGE_ID.quickStart;
  const physicalActivation = props.id === MORNING_CENTER_STAGE_ID.physicalActivation;
  const mirror = props.id === MORNING_CENTER_STAGE_ID.mirror;
  const mainAction = props.id === MORNING_CENTER_STAGE_ID.mainAction;
  const workBlock = props.id === MORNING_CENTER_STAGE_ID.workBlock;
  const canOpenPhysicalActivation =
    physicalActivation &&
    ((current && props.canOpenQuickStart && props.physicalMutable) ||
      (!props.physicalMutable && props.physicalPlan.selectedCount > 0));
  const hasCompletedExecutionDetails =
    physicalActivation &&
    props.physicalExecution.totalSets > 0 &&
    props.physicalExecution.resolvedSets === props.physicalExecution.totalSets;
  const statusLabel =
    props.scenarioStatus === 'skipped'
      ? 'Пропущен в этом сценарии'
      : props.scenarioStatus === 'shortened'
        ? 'Сокращённый вариант'
        : props.status === MORNING_CENTER_STAGE_STATUS.optional
          ? 'Необязательный этап'
          : props.status === MORNING_CENTER_STAGE_STATUS.completed
            ? 'Завершён'
            : current
              ? 'Текущий этап'
              : 'Будущий этап';
  return (
    <li
      id={current ? 'morning-current-stage' : undefined}
      className={`morning-stage-card morning-stage-card-${props.status} morning-stage-scenario-${props.scenarioStatus}`}
      data-morning-stage={props.id}
      data-morning-stage-status={props.status}
      data-morning-stage-tone={semanticTone}
      data-morning-stage-scenario={props.scenarioStatus}
      tabIndex={current ? -1 : undefined}
    >
      <span className="morning-stage-index">{props.index}</span>
      <span className="morning-stage-icon" aria-hidden="true">
        {copy.icon}
      </span>
      <div className="morning-stage-copy">
        <h3>{copy.title}</h3>
        <p>
          {physicalActivation
            ? props.physicalExecution.statusText !== null
              ? props.physicalExecution.statusText
              : props.physicalPlan.totalSets === 0
                ? 'Упражнения не выбраны'
                : `${exerciseCountLabel(props.physicalPlan.selectedCount)} · ${setsCountLabel(props.physicalPlan.totalSets)}`
            : mirror && props.mirror.completedAt !== null
              ? `Настрой завершён · ${formatMorningMirrorTime(props.mirror.completedAt)}`
              : mainAction && props.mainAction.decisionTitle !== null
                ? props.mainAction.ready
                  ? `Проверено · ${props.mainAction.firstStepTitle ?? props.mainAction.decisionTitle}`
                  : props.mainAction.decisionTitle
                : workBlock && current
                  ? 'Утро подготовлено · откройте итог'
                  : copy.description}
        </p>
        {quickStart && props.status === MORNING_CENTER_STAGE_STATUS.completed ? (
          <div className="morning-stage-facts">
            <span>✓ Вода</span>
            <span
              className={
                props.quickStartColdShower === MORNING_COLD_SHOWER_PRESENTATION_STATUS.skipped
                  ? 'is-skipped'
                  : undefined
              }
            >
              {props.quickStartColdShower === MORNING_COLD_SHOWER_PRESENTATION_STATUS.skipped
                ? 'Пропущен сегодня'
                : '✓ Холодный душ'}
            </span>
          </div>
        ) : null}
      </div>
      <div className="morning-stage-meta">
        <span className="morning-stage-status">{statusLabel}</span>
        <span className="morning-stage-duration">≈ {props.estimatedMinutes} мин</span>
      </div>
      {quickStart && current && props.canStart ? (
        <button
          className="primary-button morning-stage-action"
          type="button"
          disabled={props.busy}
          onClick={props.onStart}
        >
          {props.pendingAction === 'start' ? 'Начинаем…' : 'Начать утро'}
        </button>
      ) : quickStart && props.canOpenQuickStart ? (
        <button
          id="morning-quick-start-trigger"
          className={`${current ? 'primary-button' : 'secondary-button'} morning-stage-action`}
          type="button"
          disabled={props.busy}
          onClick={props.onOpenQuickStart}
        >
          {props.quickStartMutable ? 'Открыть' : 'Просмотреть'}
        </button>
      ) : physicalActivation && props.physicalExecution.canContinue ? (
        <button
          id="morning-physical-trigger"
          className="primary-button morning-stage-action"
          type="button"
          disabled={props.busy}
          onClick={props.onContinuePhysicalExecution}
        >
          Продолжить
        </button>
      ) : hasCompletedExecutionDetails ? (
        <button
          id="morning-physical-trigger"
          className="secondary-button morning-stage-action"
          type="button"
          disabled={props.busy}
          onClick={props.onContinuePhysicalExecution}
        >
          Результаты
        </button>
      ) : canOpenPhysicalActivation ? (
        <button
          id="morning-physical-trigger"
          className={`${current ? 'primary-button' : 'secondary-button'} morning-stage-action`}
          type="button"
          disabled={props.busy}
          onClick={props.onOpenPhysicalActivation}
        >
          {props.physicalMutable ? 'Открыть' : 'Просмотреть'}
        </button>
      ) : mirror && props.mirror.canOpen ? (
        <button
          id="morning-mirror-trigger"
          className={`${current ? 'primary-button' : 'secondary-button'} morning-stage-action`}
          type="button"
          disabled={props.busy}
          onClick={props.onOpenMirror}
        >
          {props.mirror.canComplete ? 'Открыть' : 'Просмотреть'}
        </button>
      ) : mainAction && (current || props.status === MORNING_CENTER_STAGE_STATUS.completed) ? (
        <button
          id="morning-main-action-trigger"
          className={`${current ? 'primary-button' : 'secondary-button'} morning-stage-action`}
          type="button"
          disabled={props.busy}
          onClick={props.onOpenMainAction}
        >
          {current ? 'Проверить' : 'Просмотреть'}
        </button>
      ) : workBlock && current ? (
        <button
          id="morning-completion-trigger"
          className="primary-button morning-stage-action"
          type="button"
          disabled={props.busy}
          onClick={props.onOpenCompletion}
        >
          Открыть итог
        </button>
      ) : null}
    </li>
  );
}

export function openMorningPhysicalExecution(
  onMorningViewChange: (view: RoutineMorningView | null) => void,
): void {
  onMorningViewChange(ROUTINE_MORNING_VIEW.physicalExecution);
}

export async function finishMorningPhysicalExecutionView(
  reloadCenter: () => Promise<unknown>,
  onMorningViewChange: (view: RoutineMorningView | null) => void,
): Promise<void> {
  await reloadCenter();
  onMorningViewChange(null);
}

export const MORNING_MIRROR_SUCCESS_DELAY_MS = 600;

export function mirrorSuccessDelay(reducedMotion: boolean): number {
  return reducedMotion ? 0 : MORNING_MIRROR_SUCCESS_DELAY_MS;
}

export function resolveMirrorViewState(
  overview: MorningCenterOverview,
  pendingAction: MorningCenterPendingAction | null,
  mutationError: string | null,
  success: boolean,
): MorningMirrorViewState {
  if (success) return 'success';
  if (pendingAction === 'mirror') return 'pending';
  if (mutationError !== null) return 'error';
  if (!overview.mirror.canComplete) return 'readonly';
  return 'current';
}

function formatDate(date: DayDate): string {
  const [year, month, day] = date.toString().split('-');
  return `${day}.${month}.${year}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось обновить утренний распорядок.';
}
