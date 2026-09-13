import { useRef } from 'react';
import { PlannerActionRow } from './PlannerActionList';
import { statusLabels } from './plannerCatalogModel';
import { actionColumnLabels, type ActionColumn, type PlannerViews } from './plannerViewsModel';
import { PlannerBatch, PlannerGoalCard, type PlannerViewOperations } from './PlannerViewParts';
import { usePlannerGoalDrag } from './usePlannerGoalDrag';

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
  const boardRef = useRef<HTMLDivElement>(null);
  const drag = usePlannerGoalDrag(
    boardRef,
    data,
    operations.busy,
    operations.onGoalStatus,
    kind === 'goals',
  );
  return (
    <>
      {drag.error && (
        <p className="planner-error" role="alert">
          {drag.error}
        </p>
      )}
      <div
        ref={boardRef}
        className="planner-board"
        aria-label={kind === 'goals' ? 'Канбан целей' : 'Канбан действий'}
        onClickCapture={drag.suppressClick}
        onContextMenu={drag.suppressContextMenu}
      >
        {kind === 'goals'
          ? (['future', 'active', 'paused', 'achieved', 'archived'] as const).map((status) => {
              const goals = data.goalsByStatus.get(status) ?? [];
              return (
                <section
                  className={`planner-board-column${drag.targetStatus === status ? ' planner-board-column--drop' : ''}`}
                  key={status}
                  data-goal-status={status}
                  aria-label={statusLabels[status]}
                  onDragOver={(event) => drag.overDesktop(status, event)}
                  onDragLeave={drag.leaveDesktop}
                  onDrop={(event) => drag.dropDesktop(status, event)}
                >
                  <h2>
                    {statusLabels[status]} <span>{goals.length}</span>
                  </h2>
                  <PlannerBatch
                    items={goals}
                    render={(goal) => (
                      <div
                        key={goal.id.toString()}
                        className={`planner-goal-drag-item${drag.draggedId === goal.id.toString() ? ' planner-goal-drag-item--active' : ''}`}
                        data-goal-id={goal.id.toString()}
                        draggable={goal.status !== 'archived' && !operations.busy}
                        onDragStart={(event) => drag.startDesktop(goal, event)}
                        onDragEnd={drag.endDesktop}
                      >
                        <PlannerGoalCard
                          goal={goal}
                          data={data}
                          focused={focused.has(goal.id.toString())}
                          {...operations}
                        />
                      </div>
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
      {drag.point && drag.draggedGoal && (
        <div
          className="planner-goal-drag-preview"
          style={{ left: drag.point.x, top: drag.point.y }}
          aria-hidden="true"
        >
          {drag.draggedGoal.title}
        </div>
      )}
    </>
  );
}
