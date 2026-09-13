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
import type { DayDate, Goal } from '../../domain';
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

export interface PlannerV2Services {
  readonly createLifeActionDraft: Pick<CreateLifeActionDraft, 'execute'>;
  readonly createGoal: Pick<CreateGoal, 'execute'>;
  readonly completeLifeAction: Pick<CompleteLifeAction, 'execute'>;
  readonly setLifeActionPlan: Pick<SetLifeActionPlan, 'execute'>;
  readonly getPlannerToday: Pick<GetPlannerToday, 'execute'>;
  readonly getGoals: Pick<GetGoals, 'execute'>;
  readonly getDirections: Pick<GetDirections, 'execute'>;
}
interface PlannerData {
  readonly overview: PlannerTodayOverview;
  readonly goals: readonly PlannerOption[];
  readonly directions: readonly PlannerOption[];
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
  const request = useRef(0);
  const routeGeneration = useRef(0);
  const mainContent = useRef<HTMLElement>(null);
  const routeKey = buildPlannerV2Route(route);
  const [renderedRoute, setRenderedRoute] = useState(routeKey);
  if (renderedRoute !== routeKey) {
    setRenderedRoute(routeKey);
    setData(null);
    setCreatedGoal(null);
    setError(null);
  }
  const load = useCallback(() => {
    const sequence = ++request.current;
    return Promise.all([
      services.getPlannerToday.execute(currentDate),
      services.getGoals.execute(),
      services.getDirections.execute(),
    ])
      .then(([overview, goals, directions]) => {
        if (sequence !== request.current) return;
        setData({
          overview,
          goals: goals
            .filter((goal) => goal.status !== 'archived')
            .map((goal) => ({ id: goal.id.toString(), title: goal.title })),
          directions: directions
            .filter((direction) => direction.status !== 'archived')
            .map((direction) => ({ id: direction.id.toString(), title: direction.name })),
        });
        setError(null);
      })
      .catch((reason: unknown) => {
        if (sequence === request.current) throw reason;
      });
  }, [services, currentDate]);
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
  useSyncContentChanged('lifeActions|goals|directions', refresh);
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
  const navigate = (target: PlannerV2Route) => {
    routeGeneration.current += 1;
    setNotice(null);
    if (target.view === 'new-goal') setCreatedGoal(null);
    onNavigate(target);
  };
  const today = () => onNavigate({ view: 'today' });
  const navLink = (target: PlannerV2Route, label: string, icon: 'today' | 'goals' | 'create') => (
    <a
      href={buildPlannerV2Route(target)}
      aria-current={route.view === target.view ? 'page' : undefined}
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
          {navLink({ view: 'new-goal' }, 'Новая цель', 'goals')}
          {navLink({ view: 'new-action', goalId: null, title: null }, 'Новое действие', 'create')}
        </nav>
        <button className="planner-rollback" type="button" onClick={onExit}>
          Старая версия
        </button>
      </aside>
      <main ref={mainContent} id="planner-main-content" className="planner-content" tabIndex={-1}>
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
        {data === null ? (
          !error && <p role="status">Загружаем…</p>
        ) : route.view === 'today' ? (
          <PlannerToday
            date={currentDate}
            overview={data.overview}
            goals={data.goals}
            busy={busy}
            onNewAction={() => onNavigate({ view: 'new-action', goalId: null, title: null })}
            onComplete={(id) => {
              void run(
                () => completePlannerAction(services.completeLifeAction, id),
                'Действие выполнено',
              );
            }}
            onPlan={(id, main) => {
              void run(
                () =>
                  planPlannerAction(services.setLifeActionPlan, id, currentDate.toString(), main),
                main ? 'Главное действие выбрано' : 'План сохранён',
              );
            }}
            onQuickAdd={async (title) => {
              setBusy(true);
              try {
                await submitPlannerAction(services.createLifeActionDraft, {
                  ...emptyActionDraft(),
                  title,
                  date: currentDate.toString(),
                });
                setNotice('Действие добавлено на сегодня');
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
            initialTitle={route.title}
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
                  today();
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
              <a href={`#/goals/${encodeURIComponent(createdGoal.id.toString())}`}>Открыть цель</a>
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
  );
}
