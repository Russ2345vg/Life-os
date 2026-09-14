import type { Direction, Goal, LifeAction, Sphere } from '../../domain';
import type { ProgressContribution } from '../../domain/planner/ProgressContribution';
import { usePlanning } from './PlanningContext';
import { PlanningProgress } from './PlanningProgress';
import { PlannerActionRow } from './PlannerActionList';
import { PlannerGoalContext, PlannerGoalProgress } from './PlannerGoalList';
import {
  horizonLabels,
  importanceLabels,
  selectGoalCardActions,
  statusLabels,
} from './plannerCatalogModel';
import type { PlannerViewOperations } from './PlannerViewParts';

export function PlanningGoalDetail({
  id,
  today,
  directions,
  spheres,
  ...operations
}: {
  readonly id: string;
  readonly today: string;
  readonly directions: readonly Direction[];
  readonly spheres: readonly Sphere[];
} & PlannerViewOperations) {
  const context = usePlanning();
  if (context?.error) return <p role="alert">{context.error}</p>;
  if (!context?.state) return <p role="status">Загружаем цель…</p>;
  const state = context.state;
  const goal = state.goals.find((item) => item.id.toString() === id);
  if (!goal) return <p>Цель не найдена.</p>;
  return (
    <GoalDetailContent
      goal={goal}
      actions={state.actions}
      directions={directions}
      spheres={spheres}
      facts={state.contributions.filter((fact) => fact.goalId === id)}
      today={today}
      operations={operations}
    />
  );
}

export function GoalDetailContent({
  goal,
  actions,
  directions,
  spheres,
  facts,
  today,
  operations,
}: {
  readonly goal: Goal;
  readonly actions: readonly LifeAction[];
  readonly directions: readonly Direction[];
  readonly spheres: readonly Sphere[];
  readonly facts: readonly ProgressContribution[];
  readonly today: string;
  readonly operations: PlannerViewOperations;
}) {
  const { open, completed, next } = selectGoalCardActions(goal, actions);
  const id = goal.id.toString();
  const newActionHref = `#/v2/actions/new?${new URLSearchParams({ goalId: id, returnToGoal: '1' })}`;
  const achieve = () => {
    void operations.onGoalStatus(goal, 'achieved');
  };
  return (
    <section className="planning-workspace planner-goal-detail">
      <a href="#/v2/goals">← Все цели</a>
      <header className="planner-page-heading">
        <h1>{goal.title}</h1>
      </header>
      <div className="planner-goal-context">
        <PlannerGoalContext goal={goal} directions={directions} spheres={spheres} />
        <span>{statusLabels[goal.status]}</span>
        {goal.intentionLevel && <span>{importanceLabels[goal.intentionLevel]}</span>}
        {goal.horizon && <span>{horizonLabels[goal.horizon]}</span>}
        {goal.dueDate && <span>До {goal.dueDate}</span>}
      </div>
      <section className="planner-goal-result" aria-label="Желаемый результат">
        <p className="planner-eyebrow">Желаемый результат</p>
        <p>{goal.achievementCriteria ?? 'Результат пока не описан.'}</p>
      </section>
      {goal.measurement ? (
        <PlanningProgress key={id} goal={goal} date={today} editable onAchieve={achieve} />
      ) : (
        <PlannerGoalProgress goal={goal} />
      )}
      {next ? (
        <section className="planner-goal-next" aria-label="Следующее действие">
          <h2>Следующее действие</h2>
          <PlannerActionRow action={next} goals={[goal]} {...operations} lazyDetails goalContext />
        </section>
      ) : (
        <a className="planner-text-link" href={newActionHref}>
          Назначить следующий шаг
        </a>
      )}
      <section className="planner-goal-actions" aria-label="Действия цели">
        <div className="planner-goal-section-heading">
          <h2>Действия цели</h2>
          <a href={newActionHref}>+ Добавить действие</a>
        </div>
        {open.length === 0 && <p className="planner-empty">Пока нет открытых действий.</p>}
        <ul className="planner-list">
          {open
            .filter((action) => action !== next)
            .map((action) => (
              <li key={action.id.toString()}>
                <PlannerActionRow
                  action={action}
                  goals={[goal]}
                  {...operations}
                  lazyDetails
                  goalContext
                />
              </li>
            ))}
        </ul>
      </section>
      <details className="planner-goal-completed">
        <summary>Выполненные · {completed.length}</summary>
        <ul className="planner-list">
          {completed.map((action) => (
            <li key={action.id.toString()}>
              <a href={`#/v2/actions/${encodeURIComponent(action.id.toString())}`}>
                {action.title.toString()}
              </a>
              <span className="planner-muted">
                {action.completedAt?.toLocaleDateString('ru-RU') ?? 'Дата неизвестна'}
              </span>
              {action.actualResult && (
                <p className="planner-muted">{action.actualResult.toString()}</p>
              )}
            </li>
          ))}
        </ul>
      </details>
      <details className="planner-goal-history">
        <summary>История · {facts.length}</summary>
        {[...facts]
          .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
          .slice(0, 100)
          .map((fact) => (
            <div key={fact.id} className="planning-contribution">
              <p>
                {fact.effectiveDate} · {fact.amount ?? 'Ожидает значения'} {goal.measurement?.unit}
                {fact.voided ? ' · Отменено' : ''}
              </p>
              <p className="planner-muted">{fact.reason}</p>
              {fact.actionId && (
                <a href={`#/v2/actions/${encodeURIComponent(fact.actionId)}`}>
                  Исходное выполнение
                </a>
              )}
            </div>
          ))}
      </details>
      <a href={`#/goals/${encodeURIComponent(id)}`}>Описание и остальные свойства цели</a>
    </section>
  );
}
