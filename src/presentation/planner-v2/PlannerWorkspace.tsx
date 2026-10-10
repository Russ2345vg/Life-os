import {
  CompletionResultPrompt,
  completionSummaryTarget,
  type CompletionSummaryTarget,
} from './CompletionResult';
import { BalanceWorkspace } from './balance/BalanceWorkspace';
import { PlanningProvider } from './PlanningContext';
import { usePlanningState } from './usePlanningState';
import { usePlannerActionCompletion } from './usePlannerActionCompletion';
import {
  createCompletionLibraryTask,
  LatestPlannerRefresh,
  requireRefreshOutcome,
} from './plannerCompletionRefresh';
import type { CompletionRefreshTask } from './PlannerActionCompletion';
import { usePlannerLibraryReadModel } from './usePlannerLibraryReadModel';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { QuickAccessPanel } from './QuickAccessPanel';
import {
  QuickAccessProvider,
  QuickAccessGuardScope,
  QuickAccessTrigger,
  useQuickAccess,
  useQuickAccessGuard,
} from './QuickAccessContext';
import type { PlannerTodayOverview } from '../../application';
import { DayDate, EntityId, type Goal, type LifeAction } from '../../domain';
import { addDays } from '../../domain/planner/PlanningPeriod';
import { AppIcon, type AppIconName } from '../components/AppIcon';
import { PlannerActionForm, type PlannerOption } from './PlannerActionForm';
import { PlannerGoalForm } from './PlannerGoalForm';
import { NeedChoicesProvider } from './NeedPicker';
import { PlannerNeeds } from './PlannerNeeds';
import { buildNeedCatalog } from './needCatalogModel';
import { PlannerToday } from './PlannerToday';
import { RoutineLanding } from './RoutineLanding';
import { RoutineAutopilotPage, RoutineMorningPage } from './RoutinePages';
import { buildPlannerRoute, type PlannerRoute } from './PlannerNavigation';
import {
  emptyActionDraft,
  submitPlannerAction,
  submitPlannerActionWithScenario,
  submitPlannerGoalWithPeriod,
} from './plannerFormSubmission';
import { planPlannerAction } from './plannerTodayCommands';
import { useSyncContentChanged } from '../sync/SyncStatusContext';
import { finishPlannerSubmission } from './plannerRouteSubmission';
import './planner-v2.css';
import { PlannerLibraryWorkspace } from './PlannerLibraryWorkspace';
import { PlannerActionPanel } from './PlannerActionPanel';
import { PlannerUnsavedChangesConfirmation } from './PlannerUnsavedChangesConfirmation';
import { createPlannerActionOperations } from './plannerActionOperations';
import { usePlannerWorkTime } from './usePlannerWorkTime';
import { ActionPomodoro, type PomodoroSelection } from './ActionPomodoro';
import type { EntityMenuAction } from './EntityContextMenu';
import { DomainError } from '../../shared/errors/DomainError';
import { SleepPreparationPage } from './SleepPreparationPage';
import { PlannerSheet } from './PlannerSheet';
import './planner-master.css';
import { AccountSyncPage } from './AccountSyncPage';
import { OpenAiPanel } from './OpenAiPanel';
import { ContextualAiAssistant } from './ContextualAiAssistant';
import { aiScopeForRoute } from './aiScopeForRoute';
import {
  selectSleepTodayEntry,
  type SleepTodayEntry,
} from '../../application/sleep/SleepTodayEntry';
import './planner-premium.css';
import './diary/diary.css';
import type { LifeActionDateUndoReceipt } from '../../application/commands/SetLifeActionPlan';
import './planner-date-undo.css';
import { PlannerDiary } from './diary/PlannerDiary';
import type { MonthlyDirectionFocusView } from './MonthlyDirectionFocusCard';
import { PlannerMemory } from './memory/PlannerMemory';
import './memory/memory.css';
import { PlannerWalks } from './walks/PlannerWalks';
import { PlannerAnalytics } from './analytics/PlannerAnalytics';
import './walks/walks.css';
import type { PlannerServices } from '../../application/planner/PlannerServices';
import {
  buildTodayGoalGuidance,
  type TodayGoalGuidanceSelection,
} from '../../application/queries/GetTodayGoalGuidance';
import { PlannerGoalGuidance } from './PlannerGoalGuidance';
import { planGoalGuidanceStep } from './plannerGoalGuidanceOperations';

export type { PlannerServices } from '../../application/planner/PlannerServices';
interface PlannerData {
  readonly overview: PlannerTodayOverview;
  readonly goals: readonly PlannerOption[];
  readonly directions: readonly PlannerOption[];
  readonly spheres: readonly PlannerOption[];
  readonly actions: readonly LifeAction[];
  readonly monthlyDirectionFocus: MonthlyDirectionFocusView;
  readonly sleepEntry: SleepTodayEntry;
  readonly timeCapacity: readonly (number | null)[];
}

export function PlannerWorkspace(props: Parameters<typeof PlannerWorkspaceContent>[0]) {
  return (
    <QuickAccessProvider>
      <PlannerWorkspaceContent {...props} />
    </QuickAccessProvider>
  );
}
function PlannerWorkspaceContent({
  systemNotice,
  services,
  route,
  currentDate,
  onNavigate,
  actionPanelId,
  onOpenAction,
  onCloseAction,
  registerPanelGuard,
}: {
  readonly systemNotice?: ReactNode;
  readonly services: PlannerServices;
  readonly route: PlannerRoute;
  readonly currentDate: DayDate;
  readonly onNavigate: (route: PlannerRoute) => Promise<boolean> | void;
  readonly actionPanelId?: string | null;
  readonly onOpenAction?: (actionId: string) => Promise<boolean>;
  readonly onCloseAction?: () => Promise<boolean>;
  readonly registerPanelGuard?: (guard: {
    requestLeave(): Promise<boolean>;
    shouldBlockUnload(): boolean;
  }) => () => void;
}) {
  const actionOpener = useRef<HTMLElement | null>(null);
  const [returnToQuickAccess, setReturnToQuickAccess] = useState<{
    readonly source: string;
    readonly resultId: string;
  } | null>(null);
  const openActionFromSource = (id: string): Promise<boolean> | void => {
    if (!actionPanelId) setReturnToQuickAccess(null);
    actionOpener.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return onOpenAction?.(id) ?? onNavigate({ view: 'action', id });
  };
  const workTime = usePlannerWorkTime(services.workSessions);
  const [pomodoroSelection, setPomodoroSelection] = useState<PomodoroSelection | null>(null);
  const startFocusForAction = (action: LifeAction) =>
    setPomodoroSelection({ actionId: action.id.toString(), title: action.title.toString() });
  const startMorningFocus = (action: LifeAction, dateKey: string) =>
    setPomodoroSelection({
      actionId: action.id.toString(),
      title: action.title.toString(),
      morningDateKey: dateKey,
    });
  const [completionSummary, setCompletionSummary] = useState<{
    readonly target: CompletionSummaryTarget;
    readonly origin: 'source' | { readonly panelId: string };
  } | null>(null);
  const completionOrigin = useRef<{ readonly key: string; readonly panelId: string } | null>(null);
  const promptedCompletions = useRef(new Set<string>());
  const promptForResult = (action: LifeAction) => {
    const target = completionSummaryTarget(action);
    if (!services.planning || !target || promptedCompletions.current.has(target.completionKey))
      return;
    promptedCompletions.current.add(target.completionKey);
    const origin = completionOrigin.current;
    setCompletionSummary({
      target,
      origin: origin?.key === target.completionKey ? { panelId: origin.panelId } : 'source',
    });
  };
  if (
    completionSummary &&
    completionSummary.origin !== 'source' &&
    completionSummary.origin.panelId !== actionPanelId
  )
    setCompletionSummary(null);

  const [data, setData] = useState<PlannerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commandBusy, setBusy] = useState(false);
  const [planningRevision, setPlanningRevision] = useState(0);
  const quickAccess = useQuickAccess();
  const revision = quickAccess?.revision ?? 0;
  const refreshToken = useMemo(
    () => ({ planningRevision, revision }),
    [planningRevision, revision],
  );
  const planningContext = usePlanningState(services.planning, currentDate.toString(), refreshToken);
  const working = useRef(false);
  const [createdGoal, setCreatedGoal] = useState<Goal | null>(null);
  const [createdGoalWarning, setCreatedGoalWarning] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dateUndo, setDateUndo] = useState<{
    receipt: LifeActionDateUndoReceipt;
    title: string;
  } | null>(null);
  const changeDate = async (id: string, date: string, expectedVersion?: number) => {
    const result = await services.setLifeActionPlan.changeDate({
      lifeActionId: EntityId.create(id),
      plannedDate: date ? DayDate.create(date) : null,
      ...(expectedVersion === undefined ? {} : { expectedVersion }),
    });
    if (!result.ok) throw result.error;
    if (result.value.receipt)
      setDateUndo({ receipt: result.value.receipt, title: result.value.action.title.toString() });
    return result.value.action;
  };
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const [confirmAccountLeave, setConfirmAccountLeave] = useState(false);
  const accountLeaveDialog = useRef<HTMLDialogElement>(null);
  const accountLeaveOpener = useRef<HTMLElement | null>(null);
  const accountLeaveDecision = useRef<((allowed: boolean) => void) | null>(null);
  useEffect(() => {
    if (confirmAccountLeave && !accountLeaveDialog.current?.open) {
      accountLeaveDialog.current?.showModal();
      accountLeaveDialog.current?.querySelector('button')?.focus();
    }
  }, [confirmAccountLeave]);
  useEffect(() => {
    if (route.view === 'account' || !accountLeaveDecision.current) return;
    accountLeaveDecision.current(false);
    accountLeaveDecision.current = null;
    setConfirmAccountLeave(false);
  }, [route.view]);
  useEffect(
    () => () => {
      accountLeaveDecision.current?.(false);
      accountLeaveDecision.current = null;
    },
    [],
  );
  const answerAccountLeave = (allowed: boolean) => {
    accountLeaveDialog.current?.close();
    setConfirmAccountLeave(false);
    accountLeaveDecision.current?.(allowed);
    accountLeaveDecision.current = null;
    if (!allowed)
      requestAnimationFrame(() => {
        if (accountLeaveOpener.current?.isConnected) accountLeaveOpener.current.focus();
      });
  };
  const [accountReturnRoute, setAccountReturnRoute] = useState<PlannerRoute | null>(null);
  const previousRouteView = useRef(route.view);
  useEffect(() => {
    if (previousRouteView.current === 'account' && route.view !== 'account')
      setAccountReturnRoute(null);
    previousRouteView.current = route.view;
  }, [route.view]);
  const routeGeneration = useRef(0);
  const mainContent = useRef<HTMLElement>(null);
  const routeKey = buildPlannerRoute(route);
  const aiScope = useMemo(
    () => aiScopeForRoute(route, currentDate.toString()),
    [route, currentDate],
  );
  const validReturnTarget = returnToQuickAccess?.source === routeKey ? returnToQuickAccess : null;
  if (returnToQuickAccess && !validReturnTarget) setReturnToQuickAccess(null);
  const previousPanelId = useRef(actionPanelId);
  useEffect(() => {
    const previous = previousPanelId.current;
    previousPanelId.current = actionPanelId;
    if (!validReturnTarget) return;
    if (previous && !actionPanelId) quickAccess?.show();
    if (!previous && actionPanelId && quickAccess?.open) quickAccess.close();
  }, [actionPanelId, validReturnTarget, quickAccess]);
  const selectedDate =
    route.view === 'today' && route.day === 'tomorrow'
      ? DayDate.create(addDays(currentDate.toString(), 1))
      : currentDate;
  const selectedDateKey = selectedDate.toString();
  const guidanceScope = `${routeKey}|${selectedDateKey}`;
  const guidanceRequest = useRef(0);
  const [guidanceSession, setGuidanceSession] = useState<{
    readonly id: number;
    readonly scope: string;
    readonly selection: TodayGoalGuidanceSelection | null;
    readonly readError: string | null;
    readonly writeError: string | null;
    readonly confirmedSourceKey: string | null;
    readonly mustConfirm: boolean;
  } | null>(null);
  const [guidanceRefreshError, setGuidanceRefreshError] = useState<string | null>(null);
  const [renderedGuidanceScope, setRenderedGuidanceScope] = useState(guidanceScope);
  if (renderedGuidanceScope !== guidanceScope) {
    setRenderedGuidanceScope(guidanceScope);
    setGuidanceSession(null);
    setGuidanceRefreshError(null);
  }
  const guidanceOpen =
    route.view === 'today' && route.day !== 'tomorrow' && guidanceSession?.scope === guidanceScope
      ? guidanceSession
      : null;
  const libraryRoute = [
    'needs',
    'spheres',
    'sphere',
    'directions',
    'direction',
    'planning',
    'goal',
    'goals',
    'focus',
    'review',
    'actions',
    'action',
    'inbox',
    'kanban',
    'calendar',
    'time',
    'tree',
    'new-goal',
    'new-action',
  ].includes(route.view);
  const libraryScope = `${routeKey}|${selectedDateKey}`;
  const [activatedLibraryScope, setActivatedLibraryScope] = useState<string | null>(null);
  if (actionPanelId && activatedLibraryScope !== libraryScope)
    setActivatedLibraryScope(libraryScope);
  const libraryEnabled =
    libraryRoute || Boolean(actionPanelId) || activatedLibraryScope === libraryScope;
  const libraryReads = usePlannerLibraryReadModel(services.libraryReads, selectedDateKey, {
    scope: libraryScope,
    enabled: libraryEnabled,
  });
  const needCatalog = useMemo(
    () =>
      buildNeedCatalog(libraryReads.snapshot.data ?? { directions: [], goals: [], actions: [] }),
    [libraryReads.snapshot.data],
  );
  const refreshScope = useMemo(
    () => ({ services, selectedDateKey, routeKey, session: new LatestPlannerRefresh() }),
    [services, selectedDateKey, routeKey],
  );
  const refreshSession = refreshScope.session;
  const [renderedRoute, setRenderedRoute] = useState(routeKey);
  if (renderedRoute !== routeKey) {
    setRenderedRoute(routeKey);
    setData(null);
    setCreatedGoal(null);
    setError(null);
  }
  const load = useCallback(
    async (options?: { readonly refreshPlanning?: boolean }) => {
      if (
        route.view === 'routine' ||
        route.view === 'sleep' ||
        route.view === 'account' ||
        route.view === 'diary'
      )
        return;
      const outcome = await refreshSession.run(
        async () => {
          const date = DayDate.create(selectedDateKey);
          if (services.planning) await services.planning.recurrence.materialize(selectedDateKey);
          return Promise.all([
            services.getPlannerToday.execute(date),
            services.getGoals.execute(),
            services.getDirections.execute(),
            services.plannerCatalog.actions(),
            services.monthlyDirectionFocus.get(currentDate),
            services.getSpheres.execute(),
            services.sleepSchedule.getState(),
            services.timeCapacity?.get() ??
              Promise.resolve([null, null, null, null, null, null, null]),
          ]);
        },
        ([
          overview,
          goals,
          directions,
          actions,
          monthlyFocus,
          spheres,
          sleepState,
          timeCapacity,
        ]) => {
          const allSpheres = [...spheres.active, ...spheres.archived];
          const directionLabel = (direction: (typeof directions)[number]) =>
            `${allSpheres.find((sphere) => sphere.id.toString() === direction.sphereId?.toString())?.name ?? 'Без сферы'} → ${direction.name}`;
          const choices = directions
            .filter((direction) => direction.status === 'active')
            .map((direction) => ({
              id: direction.id.toString(),
              title: directionLabel(direction),
            }));
          const currentDirectionId = monthlyFocus.current?.directionId ?? null;
          const currentDirection = directions.find(
            (direction) => direction.id.toString() === currentDirectionId,
          );
          const suggestedDirection = directions.find(
            (direction) => direction.id.toString() === monthlyFocus.suggestion?.directionId,
          );
          setData({
            overview,
            goals: goals
              .filter((goal) => goal.status !== 'archived')
              .map((goal) => ({
                id: goal.id.toString(),
                title: goal.title,
                directionId: goal.directionId?.toString() ?? null,
                sphereId: goal.sphereId?.toString() ?? null,
              })),
            directions: directions
              .filter((direction) => direction.status !== 'archived')
              .map((direction) => ({
                id: direction.id.toString(),
                title: direction.name,
                sphereId: direction.sphereId?.toString() ?? null,
              })),
            spheres: allSpheres.map((sphere) => ({
              id: sphere.id.toString(),
              title: sphere.name,
            })),
            actions,
            monthlyDirectionFocus: {
              month: monthlyFocus.month,
              hasCurrent: monthlyFocus.current !== null,
              directionId: currentDirectionId,
              directionLabel: currentDirection ? directionLabel(currentDirection) : null,
              suggestion:
                monthlyFocus.suggestion && suggestedDirection?.status === 'active'
                  ? {
                      directionId: monthlyFocus.suggestion.directionId,
                      directionLabel: directionLabel(suggestedDirection),
                    }
                  : null,
              choices,
            },
            sleepEntry: selectSleepTodayEntry(sleepState, new Date()),
            timeCapacity,
          });
          setError(null);
          if (options?.refreshPlanning !== false) setPlanningRevision((value) => value + 1);
        },
      );
      if (outcome.status === 'failed') throw outcome.error;
    },
    [services, selectedDateKey, route.view, currentDate, refreshSession, setError],
  );
  const planningRefresh = planningContext?.refreshWithOutcome;
  const libraryTask = useMemo(
    () => createCompletionLibraryTask(libraryReads.model),
    [libraryReads.model],
  );
  const libraryCompletionState = useRef({ enabled: libraryEnabled, task: libraryTask });
  useLayoutEffect(() => {
    libraryCompletionState.current = { enabled: libraryEnabled, task: libraryTask };
  }, [libraryEnabled, libraryTask]);
  const completionTasks = useMemo<readonly CompletionRefreshTask[]>(
    () => [
      ...(route.view === 'today'
        ? [{ key: 'workspace' as const, run: () => load({ refreshPlanning: false }) }]
        : []),
      {
        key: 'planning',
        run: async () => {
          if (planningRefresh) requireRefreshOutcome(await planningRefresh());
        },
      },
      {
        key: 'library',
        run: async () => {
          const current = libraryCompletionState.current;
          if (current.enabled) await current.task.run();
        },
      },
    ],
    [route.view, load, planningRefresh],
  );
  const completion = usePlannerActionCompletion(
    services.completeLifeAction,
    `${routeKey}|${selectedDateKey}`,
    completionTasks,
    (action) => {
      setNotice('Действие выполнено');
      promptForResult(action);
    },
  );
  const busy = commandBusy || completion.busy;
  useQuickAccessGuard(() => ({ dirty: false, busy: busy || workTime.busy }));
  const visibleError = libraryRoute ? error : (completion.error ?? error);
  const report = useCallback(
    (reason: unknown) =>
      setError(
        reason instanceof Error
          ? reason.message
          : 'Не удалось загрузить данные. Попробуйте ещё раз.',
      ),
    [setError],
  );
  const refresh = useCallback(() => {
    void load().catch(report);
  }, [load, report]);
  useSyncContentChanged(
    'lifeActions|timeCapacity|goals|directions|days|monthlyDirectionFocuses',
    refresh,
  );
  useEffect(() => {
    return () => refreshSession.reset();
  }, [refreshSession]);
  useEffect(() => {
    routeGeneration.current += 1;
    void load().catch(report);
    return () => {
      routeGeneration.current += 1;
    };
  }, [load, routeKey, report, revision]);
  const run = async (work: () => Promise<unknown>, message: string | null, rethrow = false) => {
    if (working.current || completion.busy) return;
    completion.dismiss();
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      await work();
      setNotice(message);
      await load();
    } catch (reason: unknown) {
      report(reason);
      if (rethrow) throw reason;
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  const menuForAction = (action: LifeAction): EntityMenuAction[] => [
    ...(action.status === 'draft' || action.status === 'ready'
      ? [
          {
            label: 'Начать фокус',
            run: () => startFocusForAction(action),
          },
          {
            label: 'Редактировать',
            run: () => {
              void openActionFromSource(action.id.toString());
            },
          },
          ...(action.plannedDate?.toString() !== addDays(currentDate.toString(), 1)
            ? [
                {
                  label: 'Перенести на завтра',
                  run: () =>
                    run(
                      () => changeDate(action.id.toString(), addDays(currentDate.toString(), 1)),
                      'Действие перенесено на завтра',
                      true,
                    ),
                },
              ]
            : []),
        ]
      : []),
    ...(action.status === 'completed' && services.planning
      ? [
          {
            label: 'Вернуть в работу',
            run: () =>
              run(
                () => services.planning!.progress.reopen(action.id.toString()),
                'Действие возвращено в работу',
              ),
          },
        ]
      : []),
    ...(!action.isArchived()
      ? [
          {
            label: 'Архивировать',
            run: () =>
              run(async () => {
                const result = await services.archiveLifeAction.execute({
                  lifeActionId: action.id,
                });
                if (!result.ok) throw result.error;
              }, 'Действие архивировано'),
          },
        ]
      : []),
    ...(action.occurrence && services.planning
      ? [
          {
            label: 'Удалить это повторение',
            destructive: true,
            prepare: async () => ({
              message: `Удалить только это повторение «${action.title}»? Остальная серия продолжится.`,
              confirmLabel: 'Удалить повторение',
            }),
            run: () =>
              run(
                () => services.planning!.recurrence.skip(action.id.toString()),
                'Повторение удалено',
                true,
              ),
          } satisfies EntityMenuAction,
          {
            label: 'Удалить всю серию',
            destructive: true,
            prepare: async () => ({
              message: `Удалить всю серию «${action.title}»? Все незавершённые повторения исчезнут. Выполненная история сохранится.`,
              confirmLabel: 'Удалить всю серию',
            }),
            run: () =>
              run(
                () => services.planning!.recurrence.remove(action.occurrence!.ruleId),
                'Серия удалена',
                true,
              ),
          } satisfies EntityMenuAction,
        ]
      : [
          {
            label: 'Удалить',
            destructive: true,
            run: () =>
              run(
                async () => {
                  if (!(await services.deletePilotLifeAction.execute(action.id.toString())))
                    throw new DomainError(
                      'action.delete_blocked',
                      'Действие уже удалено. Обновите список.',
                    );
                },
                'Действие удалено',
                true,
              ),
          } satisfies EntityMenuAction,
        ]),
  ];
  const navigate = async (target: PlannerRoute): Promise<boolean> => {
    if (route.view === 'account' && target.view !== 'account') {
      const account = quickAccess?.inspect('account');
      if (account?.busy || accountLeaveDecision.current) return false;
      if (account?.dirty) {
        const allowed = await new Promise<boolean>((resolve) => {
          accountLeaveOpener.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
          accountLeaveDecision.current = resolve;
          setConfirmAccountLeave(true);
        });
        if (!allowed) return false;
      }
    }
    const accepted = await onNavigate(target);
    if (accepted === false) return false;
    if (route.view === 'account' && target.view !== 'account') setAccountReturnRoute(null);
    routeGeneration.current += 1;
    setNotice(null);
    setMoreOpen(false);
    if (target.view === 'new-goal') setCreatedGoal(null);
    return true;
  };
  const openDataStatus = async (): Promise<boolean> => {
    if (route.view === 'account') return true;
    const previous = accountReturnRoute;
    setAccountReturnRoute(route);
    const accepted = await navigate({ view: 'account' });
    if (!accepted) setAccountReturnRoute(previous);
    return accepted;
  };
  const returnFromDataStatus = () => navigate(accountReturnRoute ?? { view: 'today' });
  const today = () => navigate({ view: 'today' });
  const closeForm = () => {
    requestAnimationFrame(() => mainContent.current?.focus());
    if (route.view === 'new-goal')
      navigate(
        route.directionId ? { view: 'direction', id: route.directionId } : { view: 'goals' },
      );
    else if (route.view === 'new-action' && route.returnToGoals) navigate({ view: 'goals' });
    else if (route.view === 'new-action' && route.directionId)
      onNavigate({ view: 'direction', id: route.directionId });
    else if (route.view === 'new-action' && route.returnToGoal && route.goalId)
      navigate({ view: 'goal', id: route.goalId });
    else if (route.view === 'new-action' && route.date)
      navigate(
        route.date === addDays(currentDate.toString(), 1)
          ? { view: 'today', day: 'tomorrow' }
          : { view: 'today' },
      );
    else navigate({ view: 'actions' });
  };
  const navLink = (
    target: PlannerRoute,
    label: string,
    icon: AppIconName,
    mobileLabel?: string,
  ) => (
    <PlannerWorkspaceNavLink
      route={route}
      target={target}
      label={label}
      icon={icon}
      mobileLabel={mobileLabel}
      onNavigate={navigate}
    />
  );
  // This factory captures callbacks for later user events; it does not read refs during render.
  // eslint-disable-next-line react-hooks/refs
  const panelOperations = createPlannerActionOperations({
    services,
    actions: () => libraryReads.snapshot.data?.actions ?? [],
    busy: commandBusy || completion.snapshot.phase === 'saving',
    run: (work, message) => run(work, message, true),
    changeDate,
    complete: (target) => {
      if (actionPanelId)
        completionOrigin.current = { key: target.completionKey, panelId: actionPanelId };
      return completion.complete(target);
    },
    menuForAction,
    onOpenAction: (id) => void openActionFromSource(id),
  });
  if (
    guidanceOpen &&
    guidanceOpen.selection === null &&
    planningContext?.state &&
    !planningContext.refreshing &&
    !planningContext.error &&
    !guidanceOpen.readError
  ) {
    const initial = buildTodayGoalGuidance(planningContext.state, selectedDateKey);
    setGuidanceSession((previous) =>
      previous?.id === guidanceOpen.id
        ? {
            ...previous,
            selection: {
              goal: initial.goalId ? { id: initial.goalId, origin: 'default' } : null,
              action: initial.actionId ? { id: initial.actionId, origin: 'default' } : null,
            },
          }
        : previous,
    );
  }
  if (
    guidanceOpen?.selection &&
    guidanceOpen.selection.action === undefined &&
    planningContext?.state &&
    !planningContext.refreshing
  ) {
    const next = buildTodayGoalGuidance(
      planningContext.state,
      selectedDateKey,
      guidanceOpen.selection,
    );
    setGuidanceSession((previous) =>
      previous?.id === guidanceOpen.id
        ? {
            ...previous,
            selection: {
              ...guidanceOpen.selection,
              action: next.actionId ? { id: next.actionId, origin: 'default' } : null,
            },
          }
        : previous,
    );
  }
  const guidance =
    guidanceOpen?.selection && planningContext?.state
      ? buildTodayGoalGuidance(planningContext.state, selectedDateKey, guidanceOpen.selection)
      : null;
  const guidanceNeedsConfirmation = Boolean(
    guidanceOpen?.mustConfirm ||
    (guidance?.status === 'ready' &&
      (guidance.goalReason === 'source-changed' || guidance.actionReason === 'source-changed') &&
      guidanceOpen?.confirmedSourceKey !== guidance.sourceKey),
  );
  const closeGuidance = (expectedId?: number) => {
    if (expectedId !== undefined && guidanceRequest.current !== expectedId) return;
    guidanceRequest.current += 1;
    setGuidanceSession(null);
  };
  const openGuidance = async () => {
    const id = ++guidanceRequest.current;
    setGuidanceSession({
      id,
      scope: guidanceScope,
      selection: null,
      readError: null,
      writeError: null,
      confirmedSourceKey: null,
      mustConfirm: false,
    });
    if (!planningContext) {
      setGuidanceSession((previous) =>
        previous?.id === id
          ? {
              ...previous,
              readError: 'Планирование недоступно в этой сборке.',
            }
          : previous,
      );
      return;
    }
    const outcome = await planningContext.refreshWithOutcome();
    if (guidanceRequest.current !== id) return;
    if (outcome.status !== 'ready')
      setGuidanceSession((previous) =>
        previous?.id === id
          ? {
              ...previous,
              readError:
                outcome.status === 'failed'
                  ? outcome.error.message
                  : 'Данные изменились. Повторите загрузку.',
            }
          : previous,
      );
  };
  const retryGuidance = async () => {
    if (!guidanceOpen || !planningContext) return;
    const id = guidanceOpen.id;
    setGuidanceSession((previous) =>
      previous?.id === id
        ? {
            ...previous,
            readError: null,
            writeError: null,
          }
        : previous,
    );
    const outcome = await planningContext.refreshWithOutcome();
    if (guidanceRequest.current !== id) return;
    if (outcome.status !== 'ready')
      setGuidanceSession((previous) =>
        previous?.id === id
          ? {
              ...previous,
              readError:
                outcome.status === 'failed' ? outcome.error.message : 'Повторите загрузку.',
            }
          : previous,
      );
  };
  const refreshGoalGuidanceData = async (generation: number) => {
    const results = await Promise.allSettled([
      load({ refreshPlanning: false }),
      planningContext?.refreshWithOutcome() ??
        Promise.reject(new Error('Планирование недоступно.')),
    ]);
    if (generation !== routeGeneration.current)
      throw new Error('Экран изменился во время обновления.');
    const workspace = results[0];
    const planning = results[1];
    if (workspace.status === 'rejected') throw workspace.reason;
    if (planning.status === 'rejected') throw planning.reason;
    requireRefreshOutcome(planning.value);
  };
  const submitGuidance = async () => {
    if (
      guidance?.status !== 'ready' ||
      guidance.cta === 'open-action' ||
      guidanceNeedsConfirmation ||
      planningContext?.refreshing ||
      planningContext?.error ||
      guidanceOpen?.readError ||
      working.current ||
      completion.busy ||
      !guidanceOpen
    )
      return;
    const id = guidanceOpen.id;
    const generation = routeGeneration.current;
    working.current = true;
    setBusy(true);
    setGuidanceSession((previous) =>
      previous?.id === id
        ? {
            ...previous,
            writeError: null,
          }
        : previous,
    );
    try {
      const outcome = await planGoalGuidanceStep(
        async () => {
          await changeDate(guidance.actionId, selectedDateKey, guidance.actionVersion);
          closeGuidance(id);
          return { actionId: guidance.actionId, date: selectedDateKey };
        },
        () => refreshGoalGuidanceData(generation),
      );
      if (outcome.status === 'not-committed') {
        setGuidanceSession((previous) =>
          previous?.id === id
            ? {
                ...previous,
                writeError: outcome.message,
                mustConfirm: true,
                confirmedSourceKey: null,
              }
            : previous,
        );
        if (outcome.message.includes('изменилось') && planningContext) {
          void planningContext.refreshWithOutcome().then((refreshOutcome) => {
            if (refreshOutcome.status === 'failed')
              setGuidanceSession((previous) =>
                previous?.id === id
                  ? {
                      ...previous,
                      readError: refreshOutcome.error.message,
                    }
                  : previous,
              );
          });
        }
      } else if (generation === routeGeneration.current) {
        if (outcome.refresh === 'ready') {
          setGuidanceRefreshError(null);
          setNotice('Шаг добавлен на сегодня');
          requestAnimationFrame(() =>
            document
              .querySelector<HTMLElement>(
                `[data-planner-action-id="${CSS.escape(outcome.actionId)}"]`,
              )
              ?.focus(),
          );
        } else {
          setGuidanceRefreshError(outcome.message ?? 'Не удалось обновить план.');
        }
      }
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  const retryGuidanceRefresh = async () => {
    const generation = routeGeneration.current;
    try {
      await refreshGoalGuidanceData(generation);
      if (generation === routeGeneration.current) setGuidanceRefreshError(null);
    } catch (reason: unknown) {
      if (generation === routeGeneration.current)
        setGuidanceRefreshError(
          reason instanceof Error ? reason.message : 'Не удалось обновить план.',
        );
    }
  };
  return (
    <PlanningProvider value={planningContext}>
      <NeedChoicesProvider catalog={needCatalog}>
        <div
          className={`planner-v2${route.view === 'sleep' ? ' planner-v2--sleep' : ''}${route.view === 'sleep' && route.from === 'routine' ? ' planner-v2--routine-sleep' : ''}`}
        >
          <a
            className="planner-skip"
            href="#planner-main-content"
            onClick={(event) => {
              event.preventDefault();
              mainContent.current?.focus();
            }}
          >
            К содержимому
          </a>
          <aside className="planner-sidebar">
            <a
              className="planner-brand"
              href="#/v2/today"
              onClick={(event) => {
                event.preventDefault();
                today();
              }}
            >
              LifeOS
            </a>
            <QuickAccessTrigger />
            <PlannerWorkspaceNavLink
              className="planner-data-status-link"
              route={route}
              target={{ view: 'account' }}
              label="Состояние данных"
              icon="account"
              onNavigate={() => void openDataStatus()}
            />
            <nav aria-label="Рабочий интерфейс">
              {navLink({ view: 'today' }, 'Сегодня', 'today')}
              {navLink({ view: 'routine' }, 'Распорядок', 'routine', 'Ритм')}
              {navLink({ view: 'goals' }, 'Цели', 'goals')}
              {navLink({ view: 'actions' }, 'Действия', 'actions')}
              {navLink(
                {
                  view: 'diary',
                  period: 'day',
                  date: currentDate.toString(),
                },
                'Дневник',
                'history',
              )}
              <button
                ref={moreButton}
                className="planner-nav-more"
                type="button"
                aria-current={
                  [
                    'account',
                    'inbox',
                    'spheres',
                    'sphere',
                    'directions',
                    'direction',
                    'needs',
                    ...(route.view === 'sleep' && route.from === 'routine' ? [] : ['sleep']),
                    'memory',
                    'walks',
                    'analytics',
                  ].includes(route.view)
                    ? 'page'
                    : undefined
                }
                aria-expanded={moreOpen}
                aria-controls="planner-more-menu"
                onClick={() => setMoreOpen((value) => !value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setMoreOpen(false);
                }}
              >
                <AppIcon name="history" />
                <span>Ещё</span>
              </button>
            </nav>
            <div
              id="planner-more-menu"
              className="planner-more-menu"
              hidden={!moreOpen}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                setMoreOpen(false);
                moreButton.current?.focus();
              }}
            >
              <PlannerWorkspaceNavLink
                className="planner-data-status-menu-link"
                route={route}
                target={{ view: 'account' }}
                label="Состояние данных"
                icon="account"
                onNavigate={() => void openDataStatus()}
              />
              {services.memory && navLink({ view: 'memory' }, 'Память жизни', 'history')}
              {services.walks && navLink({ view: 'walks', page: 'overview' }, 'Прогулки', 'walks')}
              {navLink({ view: 'analytics' }, 'Аналитика', 'history')}
              {navLink({ view: 'spheres' }, 'Сферы', 'goals')}
              {navLink({ view: 'directions' }, 'Направления', 'goals')}
              {navLink({ view: 'needs' }, 'Потребности', 'goals')}
              {navLink({ view: 'inbox' }, 'Входящие', 'history')}
              {navLink({ view: 'sleep' }, 'Подготовка ко сну', 'today')}
            </div>
          </aside>
          <main
            ref={mainContent}
            id="planner-main-content"
            className={`planner-content${'section' in route ? ' planner-content--views' : ''}${route.view === 'sleep' ? ' planner-content--sleep' : ''}`}
            tabIndex={-1}
          >
            {systemNotice}
            {dateUndo && (
              <div className="planner-date-undo" role="status">
                <span>Дата изменена · {dateUndo.title}</span>
                <button
                  className="planner-primary"
                  type="button"
                  disabled={busy}
                  aria-label="Отменить изменение даты"
                  onClick={() =>
                    void run(async () => {
                      const result = await services.setLifeActionPlan.undoDate(dateUndo.receipt);
                      if (!result.ok)
                        throw new DomainError(
                          'life_action.undo_failed',
                          'Не удалось отменить перенос: действие уже изменилось или прежнее главное дело дня занято. Обновите список.',
                        );
                      setDateUndo(null);
                      document.getElementById('planner-main-content')?.focus();
                    }, 'Прежняя дата восстановлена')
                  }
                >
                  Отменить
                </button>
                <button
                  type="button"
                  disabled={busy}
                  aria-label="Закрыть уведомление об изменении даты"
                  onClick={() => setDateUndo(null)}
                >
                  Закрыть
                </button>
              </div>
            )}
            {route.view === 'today' && guidanceRefreshError ? (
              <div className="planner-error" role="alert">
                <p>Дата сохранена. Не удалось обновить план: {guidanceRefreshError}</p>
                <button type="button" onClick={() => void retryGuidanceRefresh()} disabled={busy}>
                  Повторить загрузку
                </button>
              </div>
            ) : null}
            {notice ? (
              <p className="planner-notice" role="status">
                {notice}
              </p>
            ) : null}
            {visibleError ? (
              <div className="planner-error" role="alert">
                <p>{visibleError}</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (
                      completion.snapshot.phase === 'saved' &&
                      completion.snapshot.refresh === 'failed'
                    )
                      void completion.retry();
                    else {
                      completion.dismiss();
                      void load().catch(report);
                    }
                  }}
                >
                  Повторить загрузку
                </button>
              </div>
            ) : null}
            {route.view === 'analytics' ? (
              <PlannerAnalytics
                service={services.analytics}
                route={route}
                onNavigate={navigate}
                onOpenAction={openActionFromSource}
              />
            ) : route.view === 'walks' ? (
              services.walks ? (
                <PlannerWalks
                  connections={services.connections}
                  spheres={data?.spheres ?? []}
                  diary={services.diary}
                  memory={services.memory}
                  services={services.walks}
                  route={route}
                  onNavigate={navigate}
                  today={currentDate.toString()}
                />
              ) : (
                <p role="alert">Прогулки недоступны в этой сборке.</p>
              )
            ) : route.view === 'diary' ? (
              <PlannerDiary
                walks={services.walks}
                service={services.diary}
                tomorrowTransfer={{
                  getPlannerToday: services.getPlannerToday,
                  setLifeActionPlan: services.setLifeActionPlan,
                }}
                route={route}
                currentDate={currentDate}
                onNavigate={navigate}
                memory={
                  services.memory
                    ? {
                        services: services.memory,
                        catalog: {
                          spheres: data?.spheres ?? [],
                          directions: data?.directions ?? [],
                          goals: data?.goals ?? [],
                        },
                      }
                    : undefined
                }
              />
            ) : route.view === 'memory' ? (
              services.memory ? (
                <PlannerMemory
                  connections={services.connections}
                  services={services.memory}
                  route={route}
                  currentDate={currentDate}
                  catalog={{
                    spheres: data?.spheres ?? [],
                    directions: data?.directions ?? [],
                    goals: data?.goals ?? [],
                  }}
                  onNavigate={navigate}
                />
              ) : (
                <p role="alert">Память жизни недоступна в этой сборке.</p>
              )
            ) : route.view === 'account' ? (
              <QuickAccessGuardScope scope="account">
                <AccountSyncPage
                  service={services.accountSync}
                  backLabel={accountReturnRoute ? 'Вернуться в предыдущий раздел' : 'К плану дня'}
                  onBack={() => void returnFromDataStatus()}
                />
                {services.aiAssistant ? <OpenAiPanel service={services.aiAssistant} /> : null}
              </QuickAccessGuardScope>
            ) : route.view === 'needs' ? (
              <PlannerNeeds
                route={route}
                catalog={needCatalog}
                snapshot={libraryReads.snapshot}
                onNavigate={navigate}
                onRetry={() => void libraryReads.refresh()}
              />
            ) : ['spheres', 'sphere', 'directions', 'direction'].includes(route.view) ? (
              services.balance ? (
                <BalanceWorkspace
                  services={services.balance}
                  route={route}
                  today={currentDate.toString()}
                  onNavigate={navigate}
                />
              ) : (
                <p role="alert">Сферы недоступны в этой сборке.</p>
              )
            ) : route.view === 'sleep' ? (
              <SleepPreparationPage
                service={services.sleepSchedule}
                observationService={services.sleepObservations}
                alarmObservations={services.sleepAlarmObservations}
                plannerServices={services}
                calendarDate={currentDate.toString()}
                backLabel={route.from === 'routine' ? 'Распорядок' : 'Сегодня'}
                onBack={() =>
                  navigate(route.from === 'routine' ? { view: 'routine' } : { view: 'today' })
                }
              />
            ) : route.view === 'routine' ? (
              <RoutineLanding onNavigate={navigate} />
            ) : route.view === 'planning' ? (
              <PlannerLibraryWorkspace
                reads={libraryReads}
                completion={completion}
                onOpenAction={openActionFromSource}
                onChangeDate={changeDate}
                services={services}
                route={{
                  view: 'goals',
                  ...(route.sphereId ? { sphereId: route.sphereId } : {}),
                  period: 'week',
                }}
                today={currentDate.toString()}
                onNavigate={navigate}
              />
            ) : [
                'goal',
                'goals',
                'focus',
                'review',
                'actions',
                'action',
                'inbox',
                'kanban',
                'calendar',
                'time',
                'tree',
              ].includes(route.view) ? (
              <PlannerLibraryWorkspace
                reads={libraryReads}
                completion={completion}
                onOpenAction={openActionFromSource}
                onChangeDate={changeDate}
                key={buildPlannerRoute(route)}
                services={services}
                route={route}
                workTime={workTime}
                onStartFocus={startFocusForAction}
                onStartWalk={
                  services.walks
                    ? async (actionId, requestId) => {
                        const walk = await services.walks!.planning.startPlanned({
                          actionId,
                          requestId,
                        });
                        await navigate({ view: 'walks', id: walk.id.toString() });
                      }
                    : undefined
                }
                today={currentDate.toString()}
                onNavigate={navigate}
              />
            ) : data === null ? (
              !error && (
                <div className="planner-loading" role="status" aria-label="Загружаем">
                  <span />
                  <span />
                  <span />
                  Загружаем…
                </div>
              )
            ) : route.view === 'morning' ? (
              <RoutineMorningPage
                date={currentDate}
                overview={data.overview}
                sessions={workTime.sessions}
                workout={services.morningWorkout}
                onStartFocus={(action) => startMorningFocus(action, currentDate.toString())}
                onOpenToday={() => void navigate({ view: 'today' })}
                onBack={() => void navigate({ view: 'routine' })}
              />
            ) : route.view === 'autopilot' ? (
              <RoutineAutopilotPage
                date={currentDate}
                service={services.dayAutopilot}
                busy={busy}
                onApplied={() => load()}
                onBack={() => void navigate({ view: 'routine' })}
              />
            ) : route.view === 'today' ? (
              <PlannerToday
                date={selectedDate}
                day={route.day === 'tomorrow' ? 'tomorrow' : 'today'}
                overview={data.overview}
                scenarios={services.plannerScenarios}
                goals={data.goals}
                directions={data.directions}
                spheres={data.spheres}
                availableActions={data.actions}
                capacityMinutes={
                  data.timeCapacity[
                    (new Date(`${selectedDate.toString()}T12:00:00Z`).getUTCDay() + 6) % 7
                  ] ?? null
                }
                monthlyDirectionFocus={data.monthlyDirectionFocus}
                busy={busy}
                menuForAction={menuForAction}
                onSelectDay={(day) =>
                  navigate(day === 'tomorrow' ? { view: 'today', day } : { view: 'today' })
                }
                onOpenAction={openActionFromSource}
                onMonthlyDirectionChange={(id) => {
                  void run(
                    () =>
                      services.monthlyDirectionFocus.set(
                        currentDate,
                        id ? EntityId.create(id) : null,
                      ),
                    'Главное направление месяца сохранено',
                  );
                }}
                onNewAction={() =>
                  onNavigate({
                    view: 'new-action',
                    goalId: null,
                    title: null,
                    date: selectedDate.toString(),
                  })
                }
                onOpenSleep={() => navigate({ view: 'sleep' })}
                onOpenGoalGuidance={() => void openGuidance()}
                sleepEntry={data.sleepEntry}
                onComplete={(id) => {
                  if (working.current) return;
                  const action = data.actions.find((candidate) => candidate.id.toString() === id);
                  if (!action) {
                    report(new Error('Действие изменилось. Обновите список перед выполнением.'));
                    return;
                  }
                  setError(null);
                  void completion.complete({ actionId: id, completionKey: action.completionKey });
                }}
                onSelectAction={(selection) => {
                  void run(async () => {
                    if (selection.kind === 'action')
                      return planPlannerAction(
                        services.setLifeActionPlan,
                        selection.actionId,
                        selectedDate.toString(),
                      );
                    const action = await services.planning?.recurrence.selectForDate(
                      selection.ruleId,
                      selectedDate.toString(),
                    );
                    if (!action)
                      throw new Error(
                        'На эту дату повторение не запланировано. Измените расписание серии.',
                      );
                    if (action.plannedDate?.toString() !== selectedDate.toString())
                      return planPlannerAction(
                        services.setLifeActionPlan,
                        action.id.toString(),
                        selectedDate.toString(),
                      );
                    return action;
                  }, 'Действие выбрано');
                }}
                onPlan={(id, main) => {
                  void run(
                    () =>
                      planPlannerAction(
                        services.setLifeActionPlan,
                        id,
                        selectedDate.toString(),
                        main,
                      ),
                    main ? 'Главное действие выбрано' : 'План сохранён',
                  );
                }}
                onReschedule={(id, date) => run(() => changeDate(id, date), null, true)}
                onQuickAdd={async (title) => {
                  setBusy(true);
                  try {
                    await submitPlannerAction(services.createLifeActionDraft, {
                      ...emptyActionDraft(),
                      title,
                      date: selectedDate.toString(),
                    });
                    setNotice(
                      route.day === 'tomorrow'
                        ? 'Действие добавлено на завтра'
                        : 'Действие добавлено на сегодня',
                    );
                    await load().catch(report);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            ) : route.view === 'new-action' ? (
              <>
                <PlannerLibraryWorkspace
                  reads={libraryReads}
                  completion={completion}
                  onOpenAction={openActionFromSource}
                  onChangeDate={changeDate}
                  services={services}
                  route={{ view: 'actions' }}
                  today={currentDate.toString()}
                  onNavigate={navigate}
                />
                <PlannerSheet title="Новое действие" onClose={closeForm}>
                  <PlannerActionForm
                    key={buildPlannerRoute(route)}
                    directions={data.directions}
                    goals={
                      route.directionId
                        ? data.goals.filter((g) => g.directionId === route.directionId)
                        : data.goals
                    }
                    initialGoalId={route.goalId}
                    initialDirectionId={route.directionId ?? null}
                    contextLabel={
                      data.directions.find((d) => d.id === route.directionId)?.title ?? null
                    }
                    lockGoal={route.returnToGoal === true || route.returnToGoals === true}
                    initialTitle={route.title}
                    initialDate={route.date ?? null}
                    initialParentActionId={route.parentActionId ?? null}
                    currentDate={currentDate.toString()}
                    scenarios={services.plannerScenarios}
                    onCancel={closeForm}
                    onSubmit={async (draft) => {
                      const generation = routeGeneration.current;
                      await finishPlannerSubmission(
                        () =>
                          submitPlannerActionWithScenario(
                            services.createLifeActionDraft,
                            draft,
                            services.plannerScenarios,
                          ),
                        () => generation === routeGeneration.current,
                        (saved) => {
                          if (saved.warning) {
                            void navigate({ view: 'action', id: saved.action.id.toString() }).then(
                              (accepted) => {
                                if (accepted) setNotice(saved.warning);
                              },
                            );
                            return;
                          }
                          setNotice(
                            draft.scenarioId
                              ? 'Действие добавлено в сценарий'
                              : draft.date === currentDate.toString()
                                ? 'Действие добавлено на сегодня'
                                : draft.date
                                  ? `Действие сохранено на ${draft.date}`
                                  : 'Действие сохранено в блоке «Без даты»',
                          );
                          if (route.returnToGoals) {
                            onNavigate({ view: 'goals' });
                          } else if (route.parentActionId) {
                            onNavigate({ view: 'action', id: route.parentActionId });
                          } else if (
                            route.returnToGoal &&
                            route.goalId &&
                            route.goalId === draft.goalId
                          ) {
                            onNavigate({ view: 'goal', id: route.goalId });
                          } else if (route.directionId) {
                            onNavigate({ view: 'direction', id: route.directionId });
                          } else if (route.date === addDays(currentDate.toString(), 1)) {
                            onNavigate({ view: 'today', day: 'tomorrow' });
                          } else {
                            today();
                          }
                        },
                      );
                    }}
                  />
                </PlannerSheet>
              </>
            ) : createdGoal ? (
              <section className="planner-goal-success">
                <p className="planner-eyebrow" role="status">
                  Цель создана
                </p>
                <h1>{createdGoal.title}</h1>
                {createdGoalWarning && (
                  <p role="alert" className="planner-error">
                    {createdGoalWarning}
                  </p>
                )}
                {createdGoal.achievementCriteria ? <p>{createdGoal.achievementCriteria}</p> : null}
                <p className="planner-muted">
                  {createdGoal.directionId === null
                    ? 'Направление можно выбрать позже.'
                    : 'Направление сохранено.'}
                </p>
                {createdGoal.nextProgress ? <p>Первый шаг: {createdGoal.nextProgress}</p> : null}
                <div className="planner-form-actions">
                  <button
                    className="planner-primary"
                    type="button"
                    onClick={() =>
                      onNavigate({
                        view: 'new-action',
                        goalId: createdGoal.id.toString(),
                        title: createdGoal.nextProgress,
                      })
                    }
                  >
                    Добавить действие
                  </button>
                  <a href={`#/v2/goals/${encodeURIComponent(createdGoal.id.toString())}`}>
                    Открыть цель
                  </a>
                </div>
              </section>
            ) : (
              <>
                <PlannerLibraryWorkspace
                  reads={libraryReads}
                  completion={completion}
                  onOpenAction={openActionFromSource}
                  onChangeDate={changeDate}
                  services={services}
                  route={{ view: 'goals' }}
                  today={currentDate.toString()}
                  onNavigate={navigate}
                />
                <PlannerSheet title="Новая цель" onClose={closeForm}>
                  <PlannerGoalForm
                    directions={data.directions}
                    allowPeriod={Boolean(services.planning)}
                    initialDirectionId={route.view === 'new-goal' ? (route.directionId ?? '') : ''}
                    onCancel={closeForm}
                    onSubmit={async (draft) => {
                      const generation = routeGeneration.current;
                      await finishPlannerSubmission(
                        () =>
                          submitPlannerGoalWithPeriod(
                            services.createGoal,
                            draft,
                            services.planning?.periods,
                            currentDate.toString(),
                          ),
                        () => generation === routeGeneration.current,
                        ({ goal, warning }) => {
                          if (route.view === 'new-goal' && route.directionId && !warning) {
                            onNavigate({ view: 'direction', id: route.directionId });
                            return;
                          }
                          setCreatedGoal(goal);
                          setCreatedGoalWarning(warning);
                          setNotice(null);
                        },
                      );
                    }}
                  />
                </PlannerSheet>
              </>
            )}
            {route.view !== 'account' && services.aiAssistant && services.aiContext && (
              <ContextualAiAssistant
                scopeKey={routeKey}
                service={services.aiAssistant}
                reader={services.aiContext}
                scope={aiScope}
                onNavigate={navigate}
                onCapture={async (title, note) => {
                  await services.plannerInbox.capture({ title, note });
                  await load();
                  quickAccess?.changed();
                }}
              />
            )}
            {guidanceOpen && route.view === 'today' && (
              <PlannerSheet title="Шаг к цели" onClose={() => closeGuidance()} lockScroll>
                <PlannerGoalGuidance
                  guidance={guidance}
                  loading={planningContext?.refreshing ?? true}
                  error={guidanceOpen.readError ?? planningContext?.error ?? null}
                  writeError={guidanceOpen.writeError}
                  busy={busy}
                  needsConfirmation={guidanceNeedsConfirmation}
                  onSelectGoal={(goalId) =>
                    setGuidanceSession((previous) =>
                      previous?.id === guidanceOpen.id
                        ? {
                            ...previous,
                            selection: {
                              goal: goalId ? { id: goalId, origin: 'user' } : null,
                            },
                            writeError: null,
                            confirmedSourceKey: null,
                            mustConfirm: false,
                          }
                        : previous,
                    )
                  }
                  onSelectAction={(actionId) =>
                    setGuidanceSession((previous) =>
                      previous?.id === guidanceOpen.id
                        ? {
                            ...previous,
                            selection: {
                              ...previous.selection,
                              action: actionId ? { id: actionId, origin: 'user' } : null,
                            },
                            writeError: null,
                            confirmedSourceKey: null,
                            mustConfirm: false,
                          }
                        : previous,
                    )
                  }
                  onConfirm={() =>
                    setGuidanceSession((previous) =>
                      previous?.id === guidanceOpen.id
                        ? {
                            ...previous,
                            confirmedSourceKey:
                              guidance?.status === 'ready' ? guidance.sourceKey : null,
                            mustConfirm: false,
                            writeError: null,
                          }
                        : previous,
                    )
                  }
                  onPlan={() => void submitGuidance()}
                  onOpenAction={(id) => {
                    closeGuidance();
                    requestAnimationFrame(() => void openActionFromSource(id));
                  }}
                  onOpenGoal={(id) => {
                    closeGuidance();
                    void navigate({ view: 'goal', id });
                  }}
                  onCreateAction={(goalId, title) => {
                    closeGuidance();
                    void navigate({ view: 'new-action', goalId, title, date: selectedDateKey });
                  }}
                  onCreateGoal={() => {
                    closeGuidance();
                    void navigate({ view: 'new-goal' });
                  }}
                  onRetry={() => void retryGuidance()}
                  onClose={() => closeGuidance()}
                />
              </PlannerSheet>
            )}
          </main>
          {confirmAccountLeave && (
            <dialog
              ref={accountLeaveDialog}
              className="planner-account-leave-dialog"
              aria-label="Подтверждение ухода"
              onKeyDown={(event) => {
                if (event.key !== 'Tab') return;
                const controls = accountLeaveDialog.current?.querySelectorAll('button');
                const first = controls?.[0];
                const last = controls?.[controls.length - 1];
                if (!first || !last) return;
                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault();
                  last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first.focus();
                }
              }}
              onCancel={(event) => {
                event.preventDefault();
                answerAccountLeave(false);
              }}
            >
              <PlannerUnsavedChangesConfirmation
                onContinue={() => answerAccountLeave(false)}
                onDiscard={() => answerAccountLeave(true)}
                continueLabel="Остаться"
                discardLabel="Перейти без сохранения"
              />
            </dialog>
          )}
          {completionSummary && (
            <QuickAccessGuardScope
              scope={
                completionSummary.origin === 'source' ? 'completion-summary' : 'action-summary'
              }
            >
              <CompletionResultPrompt
                guardScope={
                  completionSummary.origin === 'source' ? 'completion-summary' : 'action-summary'
                }
                key={completionSummary.target.completionKey}
                target={completionSummary.target}
                onSaved={() =>
                  setNotice(
                    'Итог сохранён в выполненной задаче. Найдите её в «Действия» → «Выполненные».',
                  )
                }
                onClose={() =>
                  setCompletionSummary((current) =>
                    current?.target.completionKey === completionSummary.target.completionKey
                      ? null
                      : current,
                  )
                }
              />
            </QuickAccessGuardScope>
          )}
          {actionPanelId && onCloseAction && registerPanelGuard && (
            <PlannerActionPanel
              actionId={actionPanelId}
              connections={services.connections}
              onNavigate={(target) => void navigate(target)}
              today={selectedDateKey}
              reads={libraryReads}
              operations={panelOperations}
              onSetTime={panelOperations.onSetTime}
              onClose={() => void onCloseAction()}
              onRetry={libraryReads.refresh}
              onReturnFocus={() =>
                actionOpener.current?.isConnected ? actionOpener.current : mainContent.current
              }
              registerGuard={registerPanelGuard}
              feedback={completion.error}
              onRetryCompletion={() => {
                if (
                  completion.snapshot.phase === 'saved' &&
                  completion.snapshot.refresh === 'failed'
                )
                  void completion.retry();
                else {
                  completion.dismiss();
                  void load().catch(report);
                }
              }}
              commandError={error}
              onDismissCommandError={() => setError(null)}
              onStartWalk={
                services.walks
                  ? async (actionId, requestId) => {
                      const walk = await services.walks!.planning.startPlanned({
                        actionId,
                        requestId,
                      });
                      await onCloseAction();
                      await navigate({ view: 'walks', id: walk.id.toString() });
                    }
                  : undefined
              }
            />
          )}
          <QuickAccessPanel
            services={services}
            today={currentDate.toString()}
            onNavigate={navigate}
            {...(onOpenAction
              ? {
                  onOpenAction: async (id: string) => {
                    if (!actionPanelId) setReturnToQuickAccess({ source: routeKey, resultId: id });
                    return onOpenAction(id);
                  },
                }
              : {})}
            returnFocusId={validReturnTarget?.resultId ?? null}
          />
          <ActionPomodoro
            selection={pomodoroSelection}
            onCloseSelection={() => setPomodoroSelection(null)}
            workTime={workTime}
            service={services.workSessions}
            preferences={services.pomodoroPreferences}
            desktopWindow={services.desktopFocusWindow}
            onOpenWorkTime={() => void navigate({ view: 'time' })}
          />
        </div>
      </NeedChoicesProvider>
    </PlanningProvider>
  );
}

function PlannerWorkspaceNavLink({
  className,
  route,
  target,
  label,
  icon,
  mobileLabel,
  onNavigate,
}: {
  readonly className?: string;
  readonly route: PlannerRoute;
  readonly target: PlannerRoute;
  readonly label: string;
  readonly icon: AppIconName;
  readonly mobileLabel?: string | undefined;
  readonly onNavigate: (route: PlannerRoute) => void;
}) {
  return (
    <a
      className={className}
      href={buildPlannerRoute(target)}
      aria-label={mobileLabel ? label : undefined}
      aria-current={
        route.view === target.view ||
        (target.view === 'routine' &&
          (route.view === 'morning' ||
            route.view === 'autopilot' ||
            (route.view === 'sleep' && route.from === 'routine'))) ||
        (target.view === 'spheres' && route.view === 'sphere') ||
        (target.view === 'directions' && route.view === 'direction') ||
        ('section' in route && route.section === target.view) ||
        (target.view === 'goals' &&
          ['focus', 'review', 'new-goal', 'goal', 'planning'].includes(route.view)) ||
        (target.view === 'actions' && ['action', 'new-action', 'time'].includes(route.view))
          ? 'page'
          : undefined
      }
      onClick={(event) => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
          return;
        event.preventDefault();
        onNavigate(target);
      }}
    >
      <AppIcon name={icon} />
      <span className={mobileLabel ? 'planner-nav-full-label' : undefined}>{label}</span>
      {mobileLabel ? (
        <span className="planner-nav-mobile-label" aria-hidden="true">
          {mobileLabel}
        </span>
      ) : null}
    </a>
  );
}
