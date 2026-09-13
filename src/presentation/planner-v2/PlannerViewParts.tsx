import { useId, useState, type ReactNode } from 'react';
import type { Goal, GoalStatus } from '../../domain';
import type { PlannerActionOperations } from './PlannerActionList';
import { PlannerGoalProgress } from './PlannerGoalList';
import { horizonLabels, importanceLabels, statusLabels } from './plannerCatalogModel';
import type { PlannerViews } from './plannerViewsModel';

export interface PlannerViewOperations extends PlannerActionOperations {
  readonly onGoalStatus: (goal: Goal, status: GoalStatus) => Promise<void>;
  readonly onGoalDirection: (goal: Goal, directionId: string) => Promise<void>;
}
export function PlannerBatch<T>({
  items,
  render,
}: {
  readonly items: readonly T[];
  readonly render: (item: T) => ReactNode;
}) {
  const [limit, setLimit] = useState(30);
  return (
    <>
      {items.slice(0, limit).map(render)}
      {items.length > limit && (
        <button className="planner-more" type="button" onClick={() => setLimit(limit + 30)}>
          Показать ещё · осталось {items.length - limit}
        </button>
      )}
    </>
  );
}
export function PlannerBranch({
  title,
  count,
  children,
}: {
  readonly title: string;
  readonly count: number;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="planner-tree-branch">
      <button
        className="planner-tree-toggle"
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">{open ? '⌄' : '›'}</span>
        <span>{title}</span>
        <span className="planner-muted">{count}</span>
      </button>
      <div id={id} hidden={!open} className="planner-tree-children">
        {open ? children : null}
      </div>
    </div>
  );
}
export function PlannerGoalSummary({
  goal,
  data,
  focused = false,
}: {
  readonly goal: Goal;
  readonly data: PlannerViews;
  readonly focused?: boolean;
}) {
  const direction = data.directionById.get(goal.directionId?.toString() ?? '');
  const sphere = data.sphereById.get((goal.sphereId ?? direction?.sphereId)?.toString() ?? '');
  const next = data.nextActionByGoal.get(goal.id.toString());
  return (
    <>
      <a className="planner-goal-title" href={`#/goals/${encodeURIComponent(goal.id.toString())}`}>
        {goal.title}
      </a>
      <p className="planner-muted">
        {[sphere?.name, direction?.name].filter(Boolean).join(' › ') || 'Без направления'}
      </p>
      <div className="planner-meta">
        <span>{statusLabels[goal.status]}</span>
        {focused && <span className="planner-focus-mark">В фокусе</span>}
        {goal.intentionLevel && <span>{importanceLabels[goal.intentionLevel]}</span>}
        {goal.horizon && <span>{horizonLabels[goal.horizon]}</span>}
      </div>
      <PlannerGoalProgress goal={goal} />
      {(next || goal.nextProgress) && (
        <p className="planner-muted">
          Следующий шаг: {next?.title.toString() ?? goal.nextProgress}
        </p>
      )}
    </>
  );
}
export function PlannerGoalCard({
  goal,
  data,
  focused = false,
  ...operations
}: PlannerViewOperations & {
  readonly goal: Goal;
  readonly data: PlannerViews;
  readonly focused?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (work: () => Promise<void>) => {
    if (pending || operations.busy) return;
    setPending(true);
    setError(null);
    try {
      await work();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить. Повторите выбор.');
    } finally {
      setPending(false);
    }
  };
  return (
    <article className={`planner-view-goal${focused ? ' planner-view-goal--focus' : ''}`}>
      <PlannerGoalSummary goal={goal} data={data} focused={focused} />
      {goal.status !== 'archived' && (
        <details
          className="planner-goal-controls"
          onToggle={(event) => setOpen(event.currentTarget.open)}
        >
          <summary>Изменить цель</summary>
          {open && (
            <div className="planner-goal-fields">
              <label>
                <span>Состояние</span>
                <select
                  aria-label={`Состояние цели: ${goal.title}`}
                  disabled={operations.busy || pending}
                  value={goal.status}
                  onChange={(e) => {
                    void run(() => operations.onGoalStatus(goal, e.target.value as GoalStatus));
                  }}
                >
                  {(['future', 'active', 'paused', 'achieved', 'archived'] as const).map(
                    (status) => (
                      <option key={status} value={status}>
                        {statusLabels[status]}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                <span>Направление</span>
                <select
                  aria-label={`Направление цели: ${goal.title}`}
                  disabled={operations.busy || pending}
                  value={goal.directionId?.toString() ?? ''}
                  onChange={(e) => {
                    void run(() => operations.onGoalDirection(goal, e.target.value));
                  }}
                >
                  <option value="">Без направления</option>
                  {goal.directionId && !data.directionById.has(goal.directionId.toString()) && (
                    <option value={goal.directionId.toString()}>
                      Связанное направление недоступно
                    </option>
                  )}
                  {data.directions
                    .filter(
                      (d) =>
                        d.status !== 'archived' || d.id.toString() === goal.directionId?.toString(),
                    )
                    .map((d) => (
                      <option
                        key={d.id.toString()}
                        value={d.id.toString()}
                        disabled={d.status === 'archived'}
                      >
                        {d.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          )}
        </details>
      )}
      {error && (
        <p role="alert" className="planner-error">
          {error} Повторите выбор или обновите данные.
        </p>
      )}
    </article>
  );
}
