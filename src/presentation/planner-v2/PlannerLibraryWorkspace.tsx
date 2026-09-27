import { PlannerGoalForm } from './PlannerGoalForm';
import { useQuickAccess, useQuickAccessGuard } from './QuickAccessContext';
import { PlannerSheet } from './PlannerSheet';
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
import type { PlannerRoute } from './PlannerNavigation';
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
import type { DeletePilotGoal } from '../../application/sync/pilot/DeletePilotGoal';
import type { DeletePilotLifeAction } from '../../application/sync/pilot/DeletePilotLifeAction';
import type { ArchiveLifeAction } from '../../application/commands/ArchiveLifeAction';
import type { EditPlannerActionDraft } from '../../application/commands/EditPlannerActionDraft';
import type { SetLifeActionParent } from '../../application/commands/SetLifeActionParent';
import type { SelectGoalNextAction } from '../../application/commands/SelectGoalNextAction';
import type { UpdateLifeActionDetails } from '../../application/commands/UpdateLifeActionDetails';
import type { PlanningServices } from '../../application/planner/PlanningServices';
import { DomainError } from '../../shared/errors/DomainError';
import type { EntityMenuAction } from './EntityContextMenu';

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
  readonly deletePilotGoal: Pick<DeletePilotGoal, 'execute'>;
  readonly deletePilotLifeAction: Pick<DeletePilotLifeAction, 'execute'>;
  readonly archiveLifeAction: Pick<ArchiveLifeAction, 'execute'>;
  readonly editPlannerActionDraft: Pick<EditPlannerActionDraft, 'execute'>;
  readonly setLifeActionParent: Pick<SetLifeActionParent, 'execute'>;
  readonly selectGoalNextAction: Pick<SelectGoalNextAction, 'execute'>;
  readonly updateLifeActionDetails: Pick<UpdateLifeActionDetails, 'execute'>;
  readonly planning?: PlanningServices;
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
  readonly route: PlannerRoute;
  readonly today: string;
  readonly onNavigate: (route: PlannerRoute) => void;
}) {
  const planningContext = usePlanning();
  const [data, setData] = useState<LibraryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  const [busy, setBusy] = useState(false);
  const revision = useQuickAccess()?.revision ?? 0;
  useQuickAccessGuard(() => ({ dirty: false, busy }));
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
  }, [load, report, invalidateLoad, revision]);
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
  const menuForGoal = (goal: Goal): EntityMenuAction[] => [
    {
      label: 'Редактировать',
      run: () => {
        onNavigate({ view: 'goal', id: goal.id.toString(), edit: true });
      },
    },
    ...(goal.status === 'achieved'
      ? [{ label: 'Вернуть в активные', run: () => operations.onGoalStatus(goal, 'active') }]
      : []),
    ...(goal.status !== 'archived'
      ? [{ label: 'Архивировать', run: () => operations.onGoalStatus(goal, 'archived') }]
      : []),
    {
      label: 'Удалить',
      destructive: true,
      run: async () => {
        await run(async () => {
          if (!(await services.deletePilotGoal.execute(goal.id.toString())))
            throw new DomainError('goal.delete_blocked', 'Цель уже удалена. Обновите список.');
        }, 'Цель удалена');
        if (route.view === 'goal') onNavigate({ view: 'goals' });
      },
    },
  ];
  const menuForAction = (action: LifeAction): EntityMenuAction[] => [
    ...(action.status === 'draft' || action.status === 'ready'
      ? [
          {
            label: 'Редактировать',
            run: () => onNavigate({ view: 'action', id: action.id.toString() }),
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
          ...(planningContext?.state?.rules.find((rule) => rule.id === action.occurrence?.ruleId)
            ?.schedule.kind === 'count'
            ? []
            : [
                {
                  label: 'Удалить это повторение',
                  destructive: true,
                  prepare: async () => ({
                    message: `Удалить только это повторение «${action.title}»? Остальная серия продолжится.`,
                    confirmLabel: 'Удалить повторение',
                  }),
                  run: async () => {
                    await run(
                      () => services.planning!.recurrence.skip(action.id.toString()),
                      'Повторение удалено',
                    );
                    if (route.view === 'action') onNavigate({ view: 'actions' });
                  },
                } satisfies EntityMenuAction,
              ]),
          {
            label: 'Удалить всю серию',
            destructive: true,
            prepare: async () => ({
              message: `Удалить всю серию «${action.title}»? Все незавершённые повторения исчезнут. Выполненная история сохранится.`,
              confirmLabel: 'Удалить всю серию',
            }),
            run: async () => {
              await run(
                () => services.planning!.recurrence.remove(action.occurrence!.ruleId),
                'Серия удалена',
              );
              if (route.view === 'action') onNavigate({ view: 'actions' });
            },
          } satisfies EntityMenuAction,
        ]
      : [
          {
            label: 'Удалить',
            destructive: true,
            run: async () => {
              await run(async () => {
                if (!(await services.deletePilotLifeAction.execute(action.id.toString())))
                  throw new DomainError(
                    'action.delete_blocked',
                    'Действие уже удалено. Обновите список.',
                  );
              }, 'Действие удалено');
              if (route.view === 'action') onNavigate({ view: 'actions' });
            },
          } satisfies EntityMenuAction,
        ]),
  ];
  const views = useMemo(() => (data ? buildPlannerViews(data) : null), [data]);
  const operations: PlannerViewOperations = {
    busy,
    onComplete: complete,
    onPlan: async (id, date, main) => {
      await run(
        () => planPlannerAction(services.setLifeActionPlan, id, date, main),
        main ? 'Следующее действие выбрано' : 'Дата сохранена',
      );
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
        status === 'achieved' ? 'Цель завершена' : 'Состояние цели сохранено',
      );
    },
    onGoalDirection: async (goal, directionId) => {
      await run(
        () => linkPlannerGoalDirection(services.updateGoal, goal, directionId),
        'Направление сохранено',
      );
    },
    onGoalNextAction: async (goalId, actionId) => {
      await run(async () => {
        const result = await services.selectGoalNextAction.execute({
          goalId: EntityId.create(goalId),
          actionId: EntityId.create(actionId),
        });
        if (!result.ok) throw result.error;
      }, 'Следующее действие цели выбрано');
    },
    menuForAction,
    onReopen: services.planning
      ? async (id) => {
          await run(() => services.planning!.progress.reopen(id), 'Действие возвращено в работу');
        }
      : undefined,
    onEdit: async (action, title, description, need) => {
      await run(async () => {
        const result =
          action.status === 'draft'
            ? await services.editPlannerActionDraft.execute({
                lifeActionId: action.id,
                title,
                description,
                ...(need === undefined ? {} : { need }),
              })
            : await services.updateLifeActionDetails.execute({
                lifeActionId: action.id,
                title,
                description,
                ...(need === undefined ? {} : { need }),
                expectedResult: action.expectedResult?.toString() ?? '',
              });
        if (!result.ok) throw result.error;
      }, 'Действие изменено');
    },
    onUnlink: async (id) => {
      await run(async () => {
        const result = await services.setLifeActionParent.execute({
          lifeActionId: EntityId.create(id),
          parentActionId: null,
        });
        if (!result.ok) throw result.error;
      }, 'Поддействие отделено');
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
        <>
          {route.edit && data.goals.find((goal) => goal.id.toString() === route.id) && (
            <PlannerSheet
              title="Редактировать цель"
              onClose={() => onNavigate({ view: 'goal', id: route.id })}
            >
              <PlannerGoalForm
                key={route.id}
                initialGoal={data.goals.find((goal) => goal.id.toString() === route.id)!}
                directions={data.directions.map((direction) => ({
                  id: direction.id.toString(),
                  title: direction.name,
                }))}
                onCancel={() => onNavigate({ view: 'goal', id: route.id })}
                onSubmit={async (draft) => {
                  const goal = data.goals.find((item) => item.id.toString() === route.id)!;
                  await run(async () => {
                    const result = await services.updateGoal.execute({
                      id: goal.id,
                      expectedVersion: draft.expectedVersion ?? goal.version,
                      title: draft.title,
                      achievementCriteria: draft.outcome,
                      directionId: draft.directionId ? EntityId.create(draft.directionId) : null,
                      horizon: draft.horizon || null,
                      nextProgress: draft.firstStep,
                      description: draft.description,
                      need: draft.need,
                      whyImportant: draft.whyImportant,
                      whyNow: draft.whyNow,
                    });
                    if (!result.ok) throw result.error;
                  }, 'Цель сохранена');
                  onNavigate({ view: 'goal', id: route.id });
                }}
              />
            </PlannerSheet>
          )}
          <PlanningGoalDetail
            id={route.id}
            today={today}
            directions={data.directions}
            spheres={data.spheres}
            menuForGoal={menuForGoal}
            {...operations}
          />
        </>
      ) : 'section' in route && views ? (
        <section>
          <header className="planner-page-heading">
            <h1>{route.section === 'goals' ? 'Цели' : 'Действия'}</h1>
            <button
              className="planner-primary"
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
              + {route.section === 'goals' ? 'Новая цель' : 'Новое действие'}
            </button>
          </header>
          <PlannerViewSwitcher route={route} onNavigate={onNavigate} />
          {route.view === 'kanban' ? (
            <PlannerKanban
              today={today}
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
          directions={data.directions}
          spheres={data.spheres}
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
          menuForAction={menuForAction}
          onEdit={operations.onEdit}
          onUnlink={operations.onUnlink}
          onReopen={operations.onReopen}
        />
      ) : (
        <section>
          <header className="planner-page-heading">
            <h1>Цели</h1>
            <button
              className="planner-primary"
              aria-label="Новая цель"
              type="button"
              onClick={() => onNavigate({ view: 'new-goal' })}
            >
              + Новая цель
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
              initialPeriod={route.view === 'goals' ? (route.period ?? 'all') : 'all'}
              today={today}
              goals={data.goals}
              directions={data.directions}
              spheres={data.spheres}
              actions={data.actions}
              focusIds={activeFocusIds(data.goals, data.focus)}
              menuForGoal={menuForGoal}
            />
          )}
        </section>
      )}
    </>
  );
}
