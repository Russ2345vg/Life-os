import { PlannerGoalForm } from './PlannerGoalForm';
import { PlannerActionForm } from './PlannerActionForm';
import { submitPlannerAction } from './plannerFormSubmission';
import { useQuickAccessGuard } from './QuickAccessContext';
import { PlannerSheet } from './PlannerSheet';
import { PlannerPlanImport } from './PlannerPlanImport';
import { PlanningGoalDetail } from './PlanningGoalDetail';
import { usePlanning } from './PlanningContext';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EntityId, type Goal, type LifeAction } from '../../domain';
import { PlannerInbox } from './PlannerInbox';
import { PlannerGoalList } from './PlannerGoalList';
import { PlannerWeeklyReview } from './PlannerWeeklyReview';
import { buildWeeklyGoalReview } from '../../application/queries/GetWeeklyGoalReview';
import { PlannerFocus } from './PlannerFocus';
import { PlannerActionList } from './PlannerActionList';
import { activeFocusIds } from './plannerCatalogModel';
import { planPlannerAction } from './plannerTodayCommands';
import { createPlannerActionOperations } from './plannerActionOperations';
import type { PlannerRoute } from './PlannerNavigation';
import type { usePlannerActionCompletion } from './usePlannerActionCompletion';
import type { usePlannerLibraryReadModel } from './usePlannerLibraryReadModel';
import './planner-library.css';
import './planner-views.css';
import { buildPlannerViews } from './plannerViewsModel';
import { PlannerKanban } from './PlannerKanban';
import { PlannerCalendar } from './PlannerCalendar';
import { PlannerTree } from './PlannerTree';
import { PlannerViewSwitcher } from './PlannerViewSwitcher';
import { changePlannerGoalStatus, linkPlannerGoalDirection } from './plannerGoalCommands';
import type { PlannerViewOperations } from './PlannerViewParts';
import { DomainError } from '../../shared/errors/DomainError';
import type { EntityMenuAction } from './EntityContextMenu';
import { PlannerWorkTime } from './PlannerWorkTime';
import type { PlannerWorkTimeController } from './usePlannerWorkTime';
import type { PlannerLibraryServices } from '../../application/planner/PlannerLibraryServices';

export type { PlannerLibraryServices } from '../../application/planner/PlannerLibraryServices';
export function PlannerLibraryWorkspace({
  services,
  route,
  today,
  onNavigate,
  reads,
  completion,
  onOpenAction,
  onChangeDate,
  workTime,
}: {
  readonly services: PlannerLibraryServices;
  readonly route: PlannerRoute;
  readonly today: string;
  readonly onNavigate: (route: PlannerRoute) => void;
  readonly reads: ReturnType<typeof usePlannerLibraryReadModel>;
  readonly completion: ReturnType<typeof usePlannerActionCompletion>;
  readonly onOpenAction?: (id: string) => Promise<boolean> | void;
  readonly onChangeDate: (id: string, date: string) => Promise<LifeAction>;
  readonly workTime?: PlannerWorkTimeController;
}) {
  const planningContext = usePlanning();
  const { snapshot, refresh: refreshReads, whenSettled } = reads;
  const data = snapshot.data;
  const timeCapacity = data?.timeCapacity ?? [];
  const [commandError, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  const [commandBusy, setBusy] = useState(false);
  const busy = commandBusy || completion.busy;
  const error = completion.error ?? commandError ?? snapshot.error?.message ?? null;
  const [creatingStepFor, setCreatingStepFor] = useState<string | null>(null);
  useQuickAccessGuard(() => ({ dirty: false, busy }));
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
  const refresh = useCallback(() => {
    setError(null);
    void refreshReads();
  }, [refreshReads]);
  useEffect(() => {
    if (route.view !== 'time') return;
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refreshVisible);
    window.addEventListener('pageshow', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    const timer = window.setInterval(refreshVisible, 5000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshVisible);
      window.removeEventListener('pageshow', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [route.view, refresh]);
  const run = async (work: () => Promise<unknown>, message: string | null) => {
    if (working.current || completion.busy) return;
    completion.dismiss();
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      await work();
      setNotice(message);
      await planningContext?.refresh();
      await whenSettled();
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
  const setActionTime = async (
    id: string,
    estimateMinutes: number | null,
    scheduledStartMinute: number | null,
    scheduledDurationMinutes: number | null,
    expectedVersion: number,
  ) => {
    if (!services.setLifeActionTime) throw new Error('Планирование времени недоступно.');
    await run(async () => {
      const result = await services.setLifeActionTime!.execute({
        lifeActionId: EntityId.create(id),
        estimateMinutes,
        scheduledStartMinute,
        scheduledDurationMinutes,
        expectedVersion,
      });
      if (!result.ok) throw result.error;
    }, 'Время действия сохранено');
  };
  const complete = (id: string) => {
    if (working.current) return;
    const action = data?.actions.find((candidate) => candidate.id.toString() === id);
    if (!action) {
      report(new Error('Действие изменилось. Обновите список перед выполнением.'));
      return;
    }
    setError(null);
    void completion.complete({ actionId: id, completionKey: action.completionKey });
  };
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
  const changeLibraryDate = (id: string, date: string) =>
    data?.actions.find((action) => action.id.toString() === id)?.status === 'completed'
      ? planPlannerAction(services.setLifeActionPlan, id, date, undefined, ['completed'])
      : onChangeDate(id, date);
  const operations: PlannerViewOperations = {
    // The factory only captures these event handlers; it never invokes them during render.
    // eslint-disable-next-line react-hooks/refs
    ...createPlannerActionOperations({
      services,
      actions: () => data?.actions ?? [],
      busy,
      run,
      changeDate: onChangeDate,
      complete: completion.complete,
      menuForAction,
      onOpenAction: (id) =>
        onOpenAction ? void onOpenAction(id) : onNavigate({ view: 'action', id }),
    }),
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
  };
  return (
    <>
      {importOpen && services.planImport && (
        <PlannerPlanImport
          service={services.planImport}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            refresh();
            void planningContext?.refresh();
          }}
        />
      )}
      {route.view === 'review' && creatingStepFor && (
        <PlannerSheet
          title="Новое действие цели"
          onClose={() => {
            if (!busy) setCreatingStepFor(null);
          }}
        >
          <PlannerActionForm
            goals={(planningContext?.state?.goals ?? [])
              .filter((goal) => goal.status === 'active' && !goal.isDeleted())
              .map((goal) => ({ id: goal.id.toString(), title: goal.title }))}
            initialGoalId={creatingStepFor}
            lockGoal
            currentDate={today}
            contextLabel={
              planningContext?.state?.goals.find((goal) => goal.id.toString() === creatingStepFor)
                ?.title ?? null
            }
            onCancel={() => setCreatingStepFor(null)}
            onSubmit={async (draft) => {
              await run(
                () => submitPlannerAction(services.createLifeActionDraft, draft),
                'Действие создано. Выберите его следующим шагом цели.',
              );
              setCreatingStepFor(null);
            }}
          />
        </PlannerSheet>
      )}
      {notice && (
        <p className="planner-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <div className="planner-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (completion.snapshot.phase === 'saved' && completion.snapshot.refresh === 'failed')
                void completion.retry();
              else {
                completion.dismiss();
                refresh();
              }
            }}
          >
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
      ) : route.view === 'time' ? (
        <>
          {workTime?.notice && (
            <p className="planner-notice" role="status">
              {workTime.notice}
            </p>
          )}
          <PlannerWorkTime
            actions={data.actions}
            goals={data.goals}
            weekdays={timeCapacity}
            today={today}
            initialActionId={route.actionId}
            sessions={workTime?.sessions ?? null}
            sessionError={
              workTime?.error ?? (workTime ? null : 'Рабочие сессии недоступны в этой сборке.')
            }
            busy={busy || Boolean(workTime?.busy)}
            viewSwitcher={<PlannerViewSwitcher route={route} onNavigate={onNavigate} />}
            onStart={async (id) => {
              await workTime?.start(id);
            }}
            onPause={async (id, version) => {
              await workTime?.pause(id, version);
            }}
            onResume={async (id, version) => {
              await workTime?.resume(id, version);
            }}
            onFinish={async (id, version) => {
              await workTime?.finish(id, version);
            }}
            onRefresh={() => {
              refresh();
              void workTime?.refresh().catch(() => {});
            }}
            onNavigate={onNavigate}
          />
        </>
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
            {route.section === 'goals' && services.planImport && (
              <button type="button" onClick={() => setImportOpen(true)}>
                Импорт плана
              </button>
            )}
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
            <PlannerCalendar
              data={views}
              today={today}
              capacity={timeCapacity}
              onSetTime={setActionTime}
              onSetCapacity={async (weekday, minutes) => {
                if (!services.timeCapacity)
                  throw new Error('Настройка доступного времени недоступна.');
                await run(
                  () => services.timeCapacity!.setWeekday(weekday, minutes),
                  'Доступное время сохранено',
                );
              }}
              {...operations}
            />
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
          onOpenAction={(id) =>
            onOpenAction ? void onOpenAction(id) : onNavigate({ view: 'action', id })
          }
          onNew={() => onNavigate({ view: 'new-action', goalId: null, title: null })}
          viewSwitcher={
            route.view === 'actions' ? (
              <PlannerViewSwitcher route={route} onNavigate={onNavigate} />
            ) : null
          }
          onComplete={complete}
          onPlan={async (id, date) => {
            await run(() => changeLibraryDate(id, date), null);
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
          onSetTime={services.setLifeActionTime ? setActionTime : undefined}
          onUnlink={operations.onUnlink}
          onReopen={operations.onReopen}
        />
      ) : (
        <section>
          <header className="planner-page-heading">
            <h1>Цели</h1>
            {services.planImport && (
              <button type="button" onClick={() => setImportOpen(true)}>
                Импорт плана
              </button>
            )}
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
          {route.view === 'review' && planningContext?.error && (
            <div role="alert" className="planner-error">
              <p>Не удалось обновить обзор. Показаны последние загруженные данные.</p>
              <p>{planningContext.error}</p>
              <button type="button" disabled={busy} onClick={() => void planningContext.refresh()}>
                Повторить загрузку обзора
              </button>
            </div>
          )}
          {route.view === 'review' ? (
            planningContext?.state ? (
              <PlannerWeeklyReview
                review={buildWeeklyGoalReview(planningContext.state, today, route.week)}
                today={today}
                busy={busy}
                onWeek={(week) => onNavigate({ view: 'review', week })}
                onOpenGoal={(id) => onNavigate({ view: 'goal', id })}
                onOpenAction={(id) =>
                  onOpenAction ? void onOpenAction(id) : onNavigate({ view: 'action', id })
                }
                onSelectStep={operations.onGoalNextAction}
                onCreateStep={setCreatingStepFor}
                onPlan={async (id, date) => {
                  if (
                    planningContext.state?.actions
                      .find((action) => action.id.toString() === id)
                      ?.plannedDate?.toString() === date
                  ) {
                    await planningContext.refresh();
                    return;
                  }
                  await run(() => onChangeDate(id, date), null);
                }}
              />
            ) : (
              !planningContext?.error && <p role="status">Загружаем результаты…</p>
            )
          ) : route.view === 'focus' ? (
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
