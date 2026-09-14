import { PlanningGoalDetail } from './PlanningGoalDetail';
import { usePlanning } from './PlanningContext';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EntityId, type Direction, type Goal, type LifeAction, type Sphere } from '../../domain';
import type {
  GetGoals,
  GetDirections,
  GetSpheres,
  CompleteLifeAction,
  SetLifeActionGoal,
  SetLifeActionPlan,
  UpdateGoal,
  ArchiveGoal,
} from '../../application';
import type { PlannerInbox as InboxService } from '../../application/planner/PlannerInbox';
import type { PlannerFocus as FocusService } from '../../application/planner/PlannerFocus';
import type { PlannerCatalog } from '../../application/planner/PlannerCatalog';
import type { InboxIdea } from '../../domain/planner/InboxIdea';
import type { FocusPeriod } from '../../domain/planner/FocusPeriod';
import { PlannerInbox } from './PlannerInbox';
import { PlannerGoalList } from './PlannerGoalList';
import { PlannerFocus } from './PlannerFocus';
import { PlannerActionList } from './PlannerActionList';
import { activeFocusIds } from './plannerCatalogModel';
import { completePlannerAction, planPlannerAction } from './plannerTodayCommands';
import type { PlannerV2Route } from './PlannerV2Navigation';
import { useSyncContentChanged } from '../sync/SyncStatusContext';
import './planner-library.css';
import './planner-views.css';
import { buildPlannerViews } from './plannerViewsModel';
import { PlannerKanban } from './PlannerKanban';
import { PlannerCalendar } from './PlannerCalendar';
import { PlannerTree } from './PlannerTree';
import { PlannerViewSwitcher } from './PlannerViewSwitcher';
import { changePlannerGoalStatus, linkPlannerGoalDirection } from './plannerGoalCommands';
import type { PlannerViewOperations } from './PlannerViewParts';

export interface PlannerLibraryServices {
  readonly plannerInbox: Pick<InboxService, 'list' | 'capture' | 'convert' | 'archive'>;
  readonly plannerFocus: Pick<FocusService, 'get' | 'setRole'>;
  readonly plannerCatalog: Pick<PlannerCatalog, 'actions'>;
  readonly getGoals: Pick<GetGoals, 'execute'>;
  readonly getDirections: Pick<GetDirections, 'execute'>;
  readonly getSpheres: Pick<GetSpheres, 'execute'>;
  readonly completeLifeAction: Pick<CompleteLifeAction, 'execute'>;
  readonly setLifeActionPlan: Pick<SetLifeActionPlan, 'execute'>;
  readonly setLifeActionGoal: Pick<SetLifeActionGoal, 'execute'>;
  readonly updateGoal: Pick<UpdateGoal, 'execute'>;
  readonly archiveGoal: Pick<ArchiveGoal, 'execute'>;
}
interface LibraryData {
  goals: readonly Goal[];
  directions: readonly Direction[];
  spheres: readonly Sphere[];
  actions: readonly LifeAction[];
  ideas: readonly InboxIdea[];
  focus: FocusPeriod | null;
}
export function PlannerLibraryWorkspace({
  services,
  route,
  today,
  onNavigate,
}: {
  readonly services: PlannerLibraryServices;
  readonly route: PlannerV2Route;
  readonly today: string;
  readonly onNavigate: (route: PlannerV2Route) => void;
}) {
  const planningContext = usePlanning();
  const [data, setData] = useState<LibraryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const working = useRef(false);
  const report = useCallback(
    (reason: unknown) =>
      setError(
        reason instanceof Error
          ? reason.message
          : 'Не удалось загрузить данные. Повторите попытку.',
      ),
    [],
  );
  const load = useCallback(() => {
    const request = ++sequence.current;
    return Promise.all([
      services.getGoals.execute(),
      services.getDirections.execute(),
      services.getSpheres.execute(),
      services.plannerCatalog.actions(),
      services.plannerInbox.list(),
      services.plannerFocus.get(today),
    ])
      .then(([goals, directions, spheres, actions, ideas, focus]) => {
        if (request === sequence.current) {
          setData({
            goals,
            directions,
            spheres: [...spheres.active, ...spheres.archived],
            actions,
            ideas,
            focus,
          });
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (request === sequence.current) throw reason;
      });
  }, [services, today]);
  const invalidateLoad = useCallback(() => {
    sequence.current += 1;
  }, []);
  useEffect(() => {
    void load().catch(report);
    return invalidateLoad;
  }, [load, report, invalidateLoad]);
  const refresh = useCallback(() => {
    void load().catch(report);
  }, [load, report]);
  useSyncContentChanged(
    'goals|lifeActions|directions|spheres|inboxIdeas|focusPeriods|planningPeriods|periodMemberships|progressContributions',
    refresh,
  );
  const run = async (work: () => Promise<unknown>, message: string) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      await work();
      setNotice(message);
      await planningContext?.refresh();
      await load().catch(report);
    } catch (reason: unknown) {
      report(reason);
      throw reason;
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  const perform = (work: () => Promise<unknown>, message: string) => {
    void run(work, message).catch(report);
  };
  const complete = (id: string) =>
    perform(() => completePlannerAction(services.completeLifeAction, id), 'Действие выполнено');
  const views = useMemo(() => (data ? buildPlannerViews(data) : null), [data]);
  const operations: PlannerViewOperations = {
    busy,
    onComplete: complete,
    onPlan: async (id, date) => {
      await run(() => planPlannerAction(services.setLifeActionPlan, id, date), 'Дата сохранена');
    },
    onLink: async (id, goalId) => {
      await run(async () => {
        const result = await services.setLifeActionGoal.execute({
          lifeActionId: EntityId.create(id),
          goalId: goalId ? EntityId.create(goalId) : null,
        });
        if (!result.ok) throw result.error;
      }, 'Связь с целью сохранена');
    },
    onGoalStatus: async (goal, status) => {
      await run(
        () => changePlannerGoalStatus(services.updateGoal, goal, status, services.archiveGoal),
        'Состояние цели сохранено',
      );
    },
    onGoalDirection: async (goal, directionId) => {
      await run(
        () => linkPlannerGoalDirection(services.updateGoal, goal, directionId),
        'Направление сохранено',
      );
    },
  };
  return (
    <>
      {notice && (
        <p className="planner-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <div className="planner-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={refresh}>
            Повторить загрузку
          </button>
        </div>
      )}
      {!data ? (
        !error && (
          <div className="planner-loading" role="status" aria-label="Загружаем список">
            <span />
            <span />
            <span />
            Загружаем…
          </div>
        )
      ) : route.view === 'goal' ? (
        <PlanningGoalDetail id={route.id} today={today} {...operations} />
      ) : 'section' in route && views ? (
        <section>
          <header className="planner-page-heading">
            <h1>{route.section === 'goals' ? 'Цели' : 'Действия'}</h1>
            <button
              className="planner-add-icon"
              aria-label={route.section === 'goals' ? 'Новая цель' : 'Новое действие'}
              type="button"
              onClick={() =>
                onNavigate(
                  route.section === 'goals'
                    ? { view: 'new-goal' }
                    : { view: 'new-action', goalId: null, title: null },
                )
              }
            >
              +
            </button>
          </header>
          <PlannerViewSwitcher route={route} onNavigate={onNavigate} />
          {route.view === 'kanban' ? (
            <PlannerKanban
              data={views}
              kind={route.section}
              focusIds={activeFocusIds(data.goals, data.focus)}
              {...operations}
            />
          ) : route.view === 'calendar' ? (
            <PlannerCalendar data={views} today={today} {...operations} />
          ) : (
            <PlannerTree data={views} {...operations} />
          )}
        </section>
      ) : route.view === 'inbox' ? (
        <PlannerInbox
          ideas={data.ideas}
          busy={busy}
          onCapture={async (title, note) => {
            await run(() => services.plannerInbox.capture({ title, note }), 'Мысль сохранена');
          }}
          onConvert={(id, type) =>
            perform(
              () => services.plannerInbox.convert(id, type),
              type === 'goal'
                ? 'Цель создана. Исходная мысль сохранена в разобранных.'
                : 'Действие создано. Исходная мысль сохранена в разобранных.',
            )
          }
          onArchive={(id) =>
            perform(() => services.plannerInbox.archive(id), 'Мысль перенесена в архив')
          }
        />
      ) : route.view === 'actions' || route.view === 'action' ? (
        <PlannerActionList
          actions={data.actions}
          goals={data.goals}
          today={today}
          busy={busy}
          selectedId={route.view === 'action' ? route.id : null}
          onNew={() => onNavigate({ view: 'new-action', goalId: null, title: null })}
          viewSwitcher={
            route.view === 'actions' ? (
              <PlannerViewSwitcher route={route} onNavigate={onNavigate} />
            ) : null
          }
          onComplete={complete}
          onPlan={async (id, date) => {
            await run(
              () => planPlannerAction(services.setLifeActionPlan, id, date),
              'Дата сохранена',
            );
          }}
          onLink={async (id, goalId) => {
            await run(async () => {
              const result = await services.setLifeActionGoal.execute({
                lifeActionId: EntityId.create(id),
                goalId: goalId ? EntityId.create(goalId) : null,
              });
              if (!result.ok) throw result.error;
            }, 'Связь с целью сохранена');
          }}
        />
      ) : (
        <section>
          <header className="planner-page-heading">
            <h1>Цели</h1>
            <button
              className="planner-add-icon"
              aria-label="Новая цель"
              type="button"
              onClick={() => onNavigate({ view: 'new-goal' })}
            >
              +
            </button>
          </header>
          <PlannerViewSwitcher route={route} onNavigate={onNavigate} />
          {route.view === 'focus' ? (
            <PlannerFocus
              goals={data.goals}
              actions={data.actions}
              directions={data.directions}
              spheres={data.spheres}
              period={data.focus}
              today={today}
              busy={busy}
              onComplete={complete}
              onRole={(id, role) =>
                perform(() => services.plannerFocus.setRole(today, id, role), 'Фокус сохранён')
              }
              onNewAction={(goal) =>
                onNavigate({
                  view: 'new-action',
                  goalId: goal.id.toString(),
                  title: goal.nextProgress,
                })
              }
            />
          ) : (
            <PlannerGoalList
              initialSphereId={route.view === 'goals' ? (route.sphereId ?? '') : ''}
              goals={data.goals}
              directions={data.directions}
              spheres={data.spheres}
              actions={data.actions}
              focusIds={activeFocusIds(data.goals, data.focus)}
            />
          )}
        </section>
      )}
    </>
  );
}
