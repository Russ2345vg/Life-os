import type { BalanceServices } from '../../application/balance/BalanceServices';
import { BalanceWorkspace } from './balance/BalanceWorkspace';
import type { PlanningServices } from '../../application/planner/PlanningServices';
import { PlanningProvider } from './PlanningContext';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CreateGoal,
  CreateLifeActionDraft,
  CompleteLifeAction,
  GetDirections,
  GetGoals,
  GetPlannerToday,
  PlannerTodayOverview,
  SetLifeActionPlan,
} from '../../application';
import { DayDate, EntityId, type Goal, type LifeAction } from '../../domain';
import { addDays } from '../../domain/planner/PlanningPeriod';
import type { DailyDirection } from '../../application/planner/DailyDirection';
import { AppIcon } from '../components/AppIcon';
import { PlannerActionForm, type PlannerOption } from './PlannerActionForm';
import { PlannerGoalForm } from './PlannerGoalForm';
import { PlannerToday } from './PlannerToday';
import { buildPlannerV2Route, type PlannerV2Route } from './PlannerV2Navigation';
import { emptyActionDraft, submitPlannerAction, submitPlannerGoal } from './plannerFormSubmission';
import { completePlannerAction, planPlannerAction } from './plannerTodayCommands';
import { useSyncContentChanged } from '../sync/SyncStatusContext';
import { finishPlannerSubmission } from './plannerRouteSubmission';
import './planner-v2.css';
import { PlannerLibraryWorkspace, type PlannerLibraryServices } from './PlannerLibraryWorkspace';
import type { EntityMenuAction } from './EntityContextMenu';
import { DomainError } from '../../shared/errors/DomainError';

export interface PlannerV2Services extends PlannerLibraryServices {
  readonly balance?: BalanceServices;
  readonly planning?: PlanningServices;
  readonly createLifeActionDraft: Pick<CreateLifeActionDraft, 'execute'>;
  readonly createGoal: Pick<CreateGoal, 'execute'>;
  readonly completeLifeAction: Pick<CompleteLifeAction, 'execute'>;
  readonly setLifeActionPlan: Pick<SetLifeActionPlan, 'execute'>;
  readonly getPlannerToday: Pick<GetPlannerToday, 'execute'>;
  readonly getGoals: Pick<GetGoals, 'execute'>;
  readonly getDirections: Pick<GetDirections, 'execute'>;
  readonly dailyDirection: Pick<DailyDirection, 'get' | 'set'>;
}
interface PlannerData {
  readonly overview: PlannerTodayOverview;
  readonly goals: readonly PlannerOption[];
  readonly directions: readonly PlannerOption[];
  readonly actions: readonly LifeAction[];
  readonly mainDirectionId: string | null;
  readonly directionChoices: readonly PlannerOption[];
}

export function PlannerV2Workspace({
  services,
  route,
  currentDate,
  onNavigate,
  onExit,
}: {
  readonly services: PlannerV2Services;
  readonly route: PlannerV2Route;
  readonly currentDate: DayDate;
  readonly onNavigate: (route: PlannerV2Route) => void;
  readonly onExit: () => void;
}) {
  const [data, setData] = useState<PlannerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [createdGoal, setCreatedGoal] = useState<Goal | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const request = useRef(0);
  const routeGeneration = useRef(0);
  const mainContent = useRef<HTMLElement>(null);
  const routeKey = buildPlannerV2Route(route);
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
    ])
      .then(([overview, goals, directions, actions, day, spheres]) => {
        if (sequence !== request.current) return;
        setData({
          overview,
          goals: goals
            .filter((goal) => goal.status !== 'archived')
            .map((goal) => ({ id: goal.id.toString(), title: goal.title })),
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
        });
        setError(null);
      })
      .catch((reason: unknown) => {
        if (sequence === request.current) throw reason;
      });
  }, [services, selectedDateKey]);
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
  useSyncContentChanged('lifeActions|goals|directions|days', refresh);
  useEffect(() => {
    routeGeneration.current += 1;
    void load().catch(report);
    return () => {
      request.current += 1;
      routeGeneration.current += 1;
    };
  }, [load, routeKey, report]);
  const run = async (work: () => Promise<unknown>, message: string) => {
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
    {
      label: 'Удалить',
      destructive: true,
      run: () =>
        run(async () => {
          if (!(await services.deletePilotLifeAction.execute(action.id.toString())))
            throw new DomainError(
              'action.delete_blocked',
              'Действие связано с историей, повторением или поддействиями. Сначала уберите связи либо архивируйте его.',
            );
        }, 'Действие удалено'),
    },
  ];
  const navigate = (target: PlannerV2Route) => {
    routeGeneration.current += 1;
    setNotice(null);
    setMoreOpen(false);
    if (target.view === 'new-goal') setCreatedGoal(null);
    onNavigate(target);
  };
  const today = () => onNavigate({ view: 'today' });
  const navLink = (
    target: PlannerV2Route,
    label: string,
    icon: 'today' | 'goals' | 'create' | 'actions' | 'history',
  ) => (
    <a
      href={buildPlannerV2Route(target)}
      aria-current={
        route.view === target.view ||
        (target.view === 'spheres' && route.view === 'sphere') ||
        (target.view === 'directions' && route.view === 'direction') ||
        ('section' in route && route.section === target.view) ||
        (target.view === 'goals' &&
          ['focus', 'new-goal', 'goal', 'planning'].includes(route.view)) ||
        (target.view === 'actions' && ['action', 'new-action'].includes(route.view))
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
      refreshToken={data}
      today={currentDate.toString()}
    >
      <div className="planner-v2">
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
            LifeOS<span>V2</span>
          </a>
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
              aria-expanded={moreOpen}
              aria-controls="planner-more-menu"
              onClick={() => setMoreOpen((value) => !value)}
            >
              <AppIcon name="history" />
              <span>Ещё</span>
            </button>
          </nav>
          {moreOpen && (
            <div id="planner-more-menu" className="planner-more-menu">
              {navLink({ view: 'spheres' }, 'Сферы', 'goals')}
              {navLink({ view: 'inbox' }, 'Входящие', 'history')}
            </div>
          )}
          <button className="planner-rollback" type="button" onClick={onExit}>
            Старая версия
          </button>
        </aside>
        <main
          ref={mainContent}
          id="planner-main-content"
          className={`planner-content${'section' in route ? ' planner-content--views' : ''}`}
          tabIndex={-1}
        >
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
          {['spheres', 'sphere', 'directions', 'direction'].includes(route.view) ? (
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
          ) : route.view === 'planning' ? (
            <PlannerLibraryWorkspace
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
              'actions',
              'action',
              'inbox',
              'kanban',
              'calendar',
              'tree',
            ].includes(route.view) ? (
            <PlannerLibraryWorkspace
              key={buildPlannerV2Route(route)}
              services={services}
              route={route}
              today={currentDate.toString()}
              onNavigate={navigate}
            />
          ) : data === null ? (
            !error && <p role="status">Загружаем…</p>
          ) : route.view === 'today' ? (
            <PlannerToday
              date={selectedDate}
              day={route.day === 'tomorrow' ? 'tomorrow' : 'today'}
              overview={data.overview}
              goals={data.goals}
              availableActions={data.actions}
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
              onComplete={(id) => {
                void run(
                  () => completePlannerAction(services.completeLifeAction, id),
                  'Действие выполнено',
                );
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
            <PlannerActionForm
              key={buildPlannerV2Route(route)}
              goals={data.goals}
              initialGoalId={route.goalId}
              lockGoal={route.returnToGoal === true}
              initialTitle={route.title}
              initialDate={route.date ?? null}
              initialParentActionId={route.parentActionId ?? null}
              currentDate={currentDate.toString()}
              onCancel={today}
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
                    if (route.parentActionId) {
                      onNavigate({ view: 'action', id: route.parentActionId });
                    } else if (
                      route.returnToGoal &&
                      route.goalId &&
                      route.goalId === draft.goalId
                    ) {
                      onNavigate({ view: 'goal', id: route.goalId });
                    } else if (route.date === addDays(currentDate.toString(), 1)) {
                      onNavigate({ view: 'today', day: 'tomorrow' });
                    } else {
                      today();
                    }
                  },
                );
              }}
            />
          ) : createdGoal ? (
            <section className="planner-goal-success">
              <p className="planner-eyebrow" role="status">
                Цель создана
              </p>
              <h1>{createdGoal.title}</h1>
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
            <PlannerGoalForm
              directions={data.directions}
              onCancel={today}
              onSubmit={async (draft) => {
                const generation = routeGeneration.current;
                await finishPlannerSubmission(
                  () => submitPlannerGoal(services.createGoal, draft),
                  () => generation === routeGeneration.current,
                  (goal) => {
                    setCreatedGoal(goal);
                    setNotice(null);
                  },
                );
              }}
            />
          )}
        </main>
      </div>
    </PlanningProvider>
  );
}
