import { PlannerActionRow } from './PlannerActionList';
import { statusLabels } from './plannerCatalogModel';
import { actionColumnLabels, type ActionColumn, type PlannerViews } from './plannerViewsModel';
import { PlannerBatch, PlannerGoalCard, type PlannerViewOperations } from './PlannerViewParts';

export function PlannerKanban({
  data,
  kind,
  focusIds,
  ...operations
}: PlannerViewOperations & {
  readonly data: PlannerViews;
  readonly kind: 'goals' | 'actions';
  readonly focusIds: readonly string[];
}) {
  const focused = new Set(focusIds);
  return (
    <div
      className="planner-board"
      aria-label={kind === 'goals' ? 'Канбан целей' : 'Канбан действий'}
    >
      {kind === 'goals'
        ? (['future', 'active', 'paused', 'achieved', 'archived'] as const).map((status) => {
            const goals = data.goalsByStatus.get(status) ?? [];
            return (
              <section
                className="planner-board-column"
                key={status}
                aria-label={statusLabels[status]}
              >
                <h2>
                  {statusLabels[status]} <span>{goals.length}</span>
                </h2>
                <PlannerBatch
                  items={goals}
                  render={(goal) => (
                    <PlannerGoalCard
                      key={goal.id.toString()}
                      goal={goal}
                      data={data}
                      focused={focused.has(goal.id.toString())}
                      {...operations}
                    />
                  )}
                />
                {!goals.length && <p className="planner-empty">Здесь пока нет целей.</p>}
                {status === 'future' && (
                  <a className="planner-text-link" href="#/v2/goals/new">
                    + Добавить цель
                  </a>
                )}
              </section>
            );
          })
        : (Object.keys(actionColumnLabels) as ActionColumn[]).map((column) => {
            const actions = data.actionsByColumn.get(column) ?? [];
            return (
              <section
                className="planner-board-column"
                key={column}
                aria-label={actionColumnLabels[column]}
              >
                <h2>
                  {actionColumnLabels[column]} <span>{actions.length}</span>
                </h2>
                <PlannerBatch
                  items={actions}
                  render={(action) => (
                    <PlannerActionRow
                      key={action.id.toString()}
                      action={action}
                      goals={data.goals}
                      lazyDetails
                      {...operations}
                    />
                  )}
                />
                {!actions.length && <p className="planner-empty">Здесь пока нет действий.</p>}
                {column === 'undated' && (
                  <a className="planner-text-link" href="#/v2/actions/new">
                    + Добавить действие
                  </a>
                )}
              </section>
            );
          })}
    </div>
  );
}
