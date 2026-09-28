import {
  CompletionResultPrompt,
  completionSummaryTarget,
  type CompletionSummaryTarget,
} from './CompletionResult';
import type { BalanceServices } from '../../application/balance/BalanceServices';
import { BalanceWorkspace } from './balance/BalanceWorkspace';
import type { PlanningServices } from '../../application/planner/PlanningServices';
import { PlanningProvider } from './PlanningContext';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { QuickAccessPanel } from './QuickAccessPanel';
import {
  QuickAccessProvider,
  QuickAccessTrigger,
  useQuickAccess,
  useQuickAccessGuard,
} from './QuickAccessContext';
import type {
  CreateGoal,
  CreateLifeActionDraft,
  CompleteLifeAction,
  AccountSync,
  GetDirections,
  GetGoals,
  GetPlannerToday,
  PlannerTodayOverview,
  SetLifeActionPlan,
  SleepScheduleService,
} from '../../application';
import { DayDate, EntityId, type Goal, type LifeAction } from '../../domain';
import { addDays } from '../../domain/planner/PlanningPeriod';
import type { DailyDirection } from '../../application/planner/DailyDirection';
import { AppIcon, type AppIconName } from '../components/AppIcon';
import { PlannerActionForm, type PlannerOption } from './PlannerActionForm';
import { PlannerGoalForm } from './PlannerGoalForm';
import { PlannerToday } from './PlannerToday';
import type { ScenarioService } from './PlannerScenariosPanel';
import { buildPlannerRoute, type PlannerRoute } from './PlannerNavigation';
import {
  emptyActionDraft,
  submitPlannerAction,
  submitPlannerGoalWithPeriod,
} from './plannerFormSubmission';
import { completePlannerAction, planPlannerAction } from './plannerTodayCommands';
import { useSyncContentChanged } from '../sync/SyncStatusContext';
import { finishPlannerSubmission } from './plannerRouteSubmission';
import './planner-v2.css';
import { PlannerLibraryWorkspace, type PlannerLibraryServices } from './PlannerLibraryWorkspace';
import { usePlannerWorkTime } from './usePlannerWorkTime';
import type { EntityMenuAction } from './EntityContextMenu';
import { DomainError } from '../../shared/errors/DomainError';
import { SleepPreparationPage } from './SleepPreparationPage';
import { PlannerSheet } from './PlannerSheet';
import './planner-master.css';
import { AccountSyncPage } from './AccountSyncPage';
import {
  selectSleepTodayEntry,
  type SleepTodayEntry,
} from '../../application/sleep/SleepTodayEntry';

import './planner-premium.css';
import type { LifeActionDateUndoReceipt } from '../../application/commands/SetLifeActionPlan';
import './planner-date-undo.css';

export interface PlannerServices extends PlannerLibraryServices {
  readonly plannerScenarios?: ScenarioService;
  readonly balance?: BalanceServices;
  readonly planning?: PlanningServices;
  readonly createLifeActionDraft: Pick<CreateLifeActionDraft, 'execute'>;
  readonly createGoal: Pick<CreateGoal, 'execute'>;
  readonly completeLifeAction: Pick<CompleteLifeAction, 'execute'>;
  readonly setLifeActionPlan: Pick<SetLifeActionPlan, 'execute' | 'changeDate' | 'undoDate'>;
  readonly getPlannerToday: Pick<GetPlannerToday, 'execute'>;
  readonly getGoals: Pick<GetGoals, 'execute'>;
  readonly getDirections: Pick<GetDirections, 'execute'>;
  readonly dailyDirection: Pick<DailyDirection, 'get' | 'set'>;
  readonly sleepSchedule: SleepScheduleService;
  readonly accountSync: AccountSync;
}
interface PlannerData {
  readonly overview: PlannerTodayOverview;
  readonly goals: readonly PlannerOption[];
  readonly directions: readonly PlannerOption[];
  readonly actions: readonly LifeAction[];
  readonly mainDirectionId: string | null;
  readonly directionChoices: readonly PlannerOption[];
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
}: {
  readonly systemNotice?: ReactNode;
  readonly services: PlannerServices;
  readonly route: PlannerRoute;
  readonly currentDate: DayDate;
  readonly onNavigate: (route: PlannerRoute) => void;
}) {
  const workTime = usePlannerWorkTime(services.workSessions);
  const [completionSummary, setCompletionSummary] = useState<CompletionSummaryTarget | null>(null);
  const promptedCompletions = useRef(new Set<string>());
  const promptForResult = (action: LifeAction) => {
    const target = completionSummaryTarget(action);
    if (!services.planning || !target || promptedCompletions.current.has(target.completionKey))
      return;
    promptedCompletions.current.add(target.completionKey);
    setCompletionSummary(target);
  };

  const [data, setData] = useState<PlannerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const revision = useQuickAccess()?.revision ?? 0;
  const refreshToken = useMemo(() => ({ data, revision }), [data, revision]);
  useQuickAccessGuard(() => ({ dirty: false, busy: busy || workTime.busy }));
  const working = useRef(false);
  const [createdGoal, setCreatedGoal] = useState<Goal | null>(null);
  const [createdGoalWarning, setCreatedGoalWarning] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dateUndo, setDateUndo] = useState<{
    receipt: LifeActionDateUndoReceipt;
    title: string;
  } | null>(null);
  const [dateRevision, setDateRevision] = useState(0);
  const changeDate = async (id: string, date: string) => {
    const result = await services.setLifeActionPlan.changeDate({
      lifeActionId: EntityId.create(id),
      plannedDate: date ? DayDate.create(date) : null,
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
  const request = useRef(0);
  const routeGeneration = useRef(0);
  const mainContent = useRef<HTMLElement>(null);
  const routeKey = buildPlannerRoute(route);
  const selectedDate =
    route.view === 'today' && route.day === 'tomorrow'
      ? DayDate.create(addDays(currentDate.toString(), 1))
      : currentDate;
  const selectedDateKey = selectedDate.toString();
  const [renderedRoute, setRenderedRoute] = useState(routeKey);
  if (renderedRoute !== routeKey) {
    setRenderedRoute(routeKey);
    setData(null);
    setCreatedGoal(null);
    setError(null);
  }
  const load = useCallback(async () => {
    if (route.view === 'sleep' || route.view === 'account') return;
    const sequence = ++request.current;
    const date = DayDate.create(selectedDateKey);
    if (services.planning) await services.planning.recurrence.materialize(selectedDateKey);
    return Promise.all([
      services.getPlannerToday.execute(date),
      services.getGoals.execute(),
      services.getDirections.execute(),
      services.plannerCatalog.actions(),
      services.dailyDirection.get(date),
      services.getSpheres.execute(),
      services.sleepSchedule.getState(),
      services.timeCapacity?.get() ?? Promise.resolve([null, null, null, null, null, null, null]),
    ])
      .then(([overview, goals, directions, actions, day, spheres, sleepState, timeCapacity]) => {
        if (sequence !== request.current) return;
        setData({
          overview,
          goals: goals
            .filter((goal) => goal.status !== 'archived')
            .map((goal) => ({
              id: goal.id.toString(),
              title: goal.title,
              directionId: goal.directionId?.toString() ?? null,
            })),
          directions: directions
            .filter((direction) => direction.status !== 'archived')
            .map((direction) => ({ id: direction.id.toString(), title: direction.name })),
          actions,
          mainDirectionId: day?.mainDirectionId?.toString() ?? null,
          directionChoices: directions
            .filter((direction) => direction.status === 'active')
            .map((direction) => ({
              id: direction.id.toString(),
              title: `${spheres.active.find((sphere) => sphere.id.toString() === direction.sphereId?.toString())?.name ?? 'Без сферы'} → ${direction.name}`,
            })),
          sleepEntry: selectSleepTodayEntry(sleepState, new Date()),
          timeCapacity,
        });
        setError(null);
      })
      .catch((reason: unknown) => {
        if (sequence === request.current) throw reason;
      });
  }, [services, selectedDateKey, route.view]);
  const report = useCallback(
    (reason: unknown) =>
      setError(
        reason instanceof Error
          ? reason.message
          : 'Не удалось загрузить данные. Попробуйте ещё раз.',
      ),
    [],
  );
  const refresh = useCallback(() => {
    void load().catch(report);
  }, [load, report]);
  useSyncContentChanged('lifeActions|timeCapacity|goals|directions|days', refresh);
  useEffect(() => {
    routeGeneration.current += 1;
    void load().catch(report);
    return () => {
      request.current += 1;
      routeGeneration.current += 1;
    };
  }, [load, routeKey, report, revision]);
  const run = async (work: () => Promise<unknown>, message: string | null, rethrow = false) => {
    if (working.current) return;
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
            label: 'Редактировать',
            run: () => navigate({ view: 'action', id: action.id.toString() }),
          },
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
  const navigate = (target: PlannerRoute) => {
    routeGeneration.current += 1;
    setNotice(null);
    setMoreOpen(false);
    if (target.view === 'new-goal') setCreatedGoal(null);
    onNavigate(target);
  };
  const today = () => onNavigate({ view: 'today' });
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
  const navLink = (target: PlannerRoute, label: string, icon: AppIconName) => (
    <a
      href={buildPlannerRoute(target)}
      aria-current={
        route.view === target.view ||
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
        navigate(target);
      }}
    >
      <AppIcon name={icon} />
      <span>{label}</span>
    </a>
  );
  return (
    <PlanningProvider
      services={services.planning}
      refreshToken={refreshToken}
      today={currentDate.toString()}
    >
      <div className={`planner-v2${route.view === 'sleep' ? ' planner-v2--sleep' : ''}`}>
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
          <nav aria-label="Рабочий интерфейс">
            {navLink({ view: 'today' }, 'Сегодня', 'today')}
            <span className="planner-nav-secondary">
              {navLink({ view: 'spheres' }, 'Сферы', 'goals')}
            </span>
            {navLink({ view: 'directions' }, 'Направления', 'goals')}
            {navLink({ view: 'goals' }, 'Цели', 'goals')}
            {navLink({ view: 'actions' }, 'Действия', 'actions')}
            <span className="planner-nav-secondary">
              {navLink({ view: 'inbox' }, 'Входящие', 'history')}
            </span>
            <button
              className="planner-nav-more"
              type="button"
              aria-current={
                ['account', 'inbox', 'spheres', 'sphere', 'sleep'].includes(route.view)
                  ? 'page'
                  : undefined
              }
              aria-expanded={moreOpen}
              aria-controls="planner-more-menu"
              onClick={() => setMoreOpen((value) => !value)}
            >
              <AppIcon name="history" />
              <span>Ещё</span>
            </button>
          </nav>
          <div id="planner-more-menu" className="planner-more-menu" hidden={!moreOpen}>
            {navLink({ view: 'spheres' }, 'Сферы', 'goals')}
            {navLink({ view: 'inbox' }, 'Входящие', 'history')}
            {navLink({ view: 'sleep' }, 'Подготовка ко сну', 'today')}
            {navLink({ view: 'account' }, 'Аккаунт и синхронизация', 'account')}
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
                    setDateRevision((value) => value + 1);
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
          {notice ? (
            <p className="planner-notice" role="status">
              {notice}
            </p>
          ) : null}
          {error ? (
            <div className="planner-error" role="alert">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => {
                  void load().catch(report);
                }}
              >
                Повторить загрузку
              </button>
            </div>
          ) : null}
          {route.view === 'account' ? (
            <AccountSyncPage
              service={services.accountSync}
              onBack={() => navigate({ view: 'today' })}
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
              plannerServices={services}
              calendarDate={currentDate.toString()}
              onBack={() => navigate({ view: 'today' })}
            />
          ) : route.view === 'planning' ? (
            <PlannerLibraryWorkspace
              onActionCompleted={promptForResult}
              onChangeDate={changeDate}
              dateRevision={dateRevision}
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
              onActionCompleted={promptForResult}
              onChangeDate={changeDate}
              dateRevision={dateRevision}
              key={buildPlannerRoute(route)}
              services={services}
              route={route}
              workTime={workTime}
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
          ) : route.view === 'today' ? (
            <PlannerToday
              date={selectedDate}
              day={route.day === 'tomorrow' ? 'tomorrow' : 'today'}
              overview={data.overview}
              scenarios={services.plannerScenarios}
              goals={data.goals}
              availableActions={data.actions}
              capacityMinutes={
                data.timeCapacity[
                  (new Date(`${selectedDate.toString()}T12:00:00Z`).getUTCDay() + 6) % 7
                ] ?? null
              }
              mainDirectionId={data.mainDirectionId}
              directionChoices={data.directionChoices}
              busy={busy}
              menuForAction={menuForAction}
              onSelectDay={(day) =>
                navigate(day === 'tomorrow' ? { view: 'today', day } : { view: 'today' })
              }
              onOpenAction={(id) => navigate({ view: 'action', id })}
              onMainDirection={(id) => {
                void run(
                  () => services.dailyDirection.set(selectedDate, id ? EntityId.create(id) : null),
                  'Главное направление сохранено',
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
              sleepEntry={data.sleepEntry}
              onComplete={(id) => {
                void run(async () => {
                  const action = await completePlannerAction(services.completeLifeAction, id);
                  promptForResult(action);
                }, 'Действие выполнено');
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
                onActionCompleted={promptForResult}
                onChangeDate={changeDate}
                dateRevision={dateRevision}
                services={services}
                route={{ view: 'actions' }}
                today={currentDate.toString()}
                onNavigate={navigate}
              />
              <PlannerSheet title="Новое действие" onClose={closeForm}>
                <PlannerActionForm
                  key={buildPlannerRoute(route)}
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
                  onCancel={closeForm}
                  onSubmit={async (draft) => {
                    const generation = routeGeneration.current;
                    await finishPlannerSubmission(
                      () => submitPlannerAction(services.createLifeActionDraft, draft),
                      () => generation === routeGeneration.current,
                      () => {
                        setNotice(
                          draft.date === currentDate.toString()
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
                onActionCompleted={promptForResult}
                onChangeDate={changeDate}
                dateRevision={dateRevision}
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
        </main>
        {completionSummary && (
          <CompletionResultPrompt
            key={completionSummary.completionKey}
            target={completionSummary}
            onClose={() =>
              setCompletionSummary((current) =>
                current?.completionKey === completionSummary.completionKey ? null : current,
              )
            }
          />
        )}
        <QuickAccessPanel
          services={services}
          today={currentDate.toString()}
          onNavigate={navigate}
        />
      </div>
    </PlanningProvider>
  );
}
