import { resolveGoalNeed } from '../../domain/planner/resolveEntityNeed';
import { EntityNeedText } from './EntityNeedText';
import type { Direction, Goal, LifeAction, Sphere } from '../../domain';
import type { ProgressContribution } from '../../domain/planner/ProgressContribution';
import type { RecurrenceRule } from '../../domain/planner/RecurrenceRule';
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
import { GoalPeriodMembership } from './GoalPeriodMembership';
import { EntityContextMenu, type EntityMenuAction } from './EntityContextMenu';
import type { PlanningPeriod, PeriodMembership } from '../../domain/planner/PlanningPeriod';
import './planning.css';
import { buildGoalDynamics } from '../../application/queries/GetGoalDynamics';
import { GoalDynamics } from './GoalDynamics';

export function PlanningGoalDetail({
  id,
  today,
  directions,
  spheres,
  menuForGoal,
  ...operations
}: {
  readonly id: string;
  readonly today: string;
  readonly directions: readonly Direction[];
  readonly spheres: readonly Sphere[];
  readonly menuForGoal?: ((goal: Goal) => readonly EntityMenuAction[]) | undefined;
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
      rules={state.rules}
      periods={state.periods}
      memberships={state.memberships}
      today={today}
      operations={operations}
      menuForGoal={menuForGoal}
    />
  );
}

export function GoalDetailContent({
  goal,
  actions,
  directions,
  spheres,
  facts,
  rules = [],
  today,
  operations,
  menuForGoal,
  periods = [],
  memberships = [],
}: {
  readonly goal: Goal;
  readonly actions: readonly LifeAction[];
  readonly directions: readonly Direction[];
  readonly spheres: readonly Sphere[];
  readonly facts: readonly ProgressContribution[];
  readonly rules?: readonly RecurrenceRule[];
  readonly periods?: readonly PlanningPeriod[];
  readonly memberships?: readonly PeriodMembership[];
  readonly today: string;
  readonly operations: PlannerViewOperations;
  readonly menuForGoal?: ((goal: Goal) => readonly EntityMenuAction[]) | undefined;
}) {
  const { open, completed, next } = selectGoalCardActions(goal, actions);
  const id = goal.id.toString();
  const dynamics = buildGoalDynamics({ goals: [goal], actions, contributions: facts }, id, today);
  const recurrenceLabel = (action: LifeAction): string | null => {
    const rule = rules.find((item) => item.id === action.occurrence?.ruleId);
    if (rule?.schedule.kind !== 'count' || rule.maxCompletions === null) return null;
    const done = new Set(
      actions
        .filter((item) => item.occurrence?.ruleId === rule.id && item.status === 'completed')
        .map((item) => item.completionKey),
    ).size;
    return `Повтор · ${done}/${rule.maxCompletions}`;
  };
  const newActionHref = `#/v2/actions/new?${new URLSearchParams({ goalId: id, returnToGoal: '1' })}`;
  const achieve = () => {
    void operations.onGoalStatus(goal, 'achieved');
  };
  return (
    <section className="planning-workspace planner-goal-detail">
      <a href="#/v2/goals">← Все цели</a>
      <EntityContextMenu title={goal.title} entityLabel="цель" actions={menuForGoal?.(goal) ?? []}>
        <header className="planner-page-heading">
          <h1>{goal.title}</h1>
        </header>
      </EntityContextMenu>
      <div className="planner-goal-context">
        <PlannerGoalContext goal={goal} directions={directions} spheres={spheres} />
        <span>
          {[
            statusLabels[goal.status],
            goal.intentionLevel && importanceLabels[goal.intentionLevel],
            goal.horizon && horizonLabels[goal.horizon],
            goal.dueDate && `До ${goal.dueDate}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      <EntityNeedText need={resolveGoalNeed(goal, directions)} prominent />
      <section className="planner-goal-result" aria-label="Желаемый результат">
        <p className="planner-eyebrow">Желаемый результат</p>
        <p>{goal.achievementCriteria ?? 'Результат пока не описан.'}</p>
        {goal.status !== 'achieved' && goal.status !== 'archived' && (
          <button
            className="planner-primary planner-goal-achieve"
            type="button"
            disabled={operations.busy}
            onClick={achieve}
          >
            Завершить цель
          </button>
        )}
      </section>
      {!goal.measurement && <PlannerGoalProgress goal={goal} />}
      <PlanningProgress key={id} goal={goal} date={today} editable />
      {dynamics && <GoalDynamics model={dynamics} />}
      {next ? (
        <section className="planner-goal-next" aria-label="Следующее действие">
          <h2>Следующее действие</h2>
          <PlannerActionRow
            action={next}
            goals={[goal]}
            directions={directions}
            {...operations}
            lazyDetails
            goalContext
            recurrenceLabel={recurrenceLabel(next)}
          />
        </section>
      ) : goal.nextProgress ? (
        <section className="planner-goal-next" aria-label="Следующее действие">
          <h2>Следующий шаг</h2>
          <p>{goal.nextProgress}</p>
          <a
            className="planner-text-link"
            href={`${newActionHref}&${new URLSearchParams({ title: goal.nextProgress })}`}
          >
            Создать действие из шага
          </a>
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
        {open.length === 0 && (
          <p className="planner-empty">
            {completed.length === 0 ? 'Пока нет действий' : 'Все действия выполнены'}
          </p>
        )}
        <ul className="planner-list">
          {open
            .filter((action) => action !== next)
            .map((action) => (
              <li key={action.id.toString()}>
                <PlannerActionRow
                  action={action}
                  goals={[goal]}
                  directions={directions}
                  {...operations}
                  lazyDetails
                  goalContext
                  recurrenceLabel={recurrenceLabel(action)}
                />
                <button
                  type="button"
                  disabled={operations.busy}
                  onClick={() => {
                    void operations.onGoalNextAction(id, action.id.toString());
                  }}
                >
                  Назначить следующим
                </button>
              </li>
            ))}
        </ul>
      </section>
      <details className="planner-goal-completed">
        <summary>Выполненные · {completed.length}</summary>
        <ul className="planner-list">
          {completed.map((action) => (
            <li key={action.id.toString()}>
              <PlannerActionRow
                action={action}
                goals={[goal]}
                directions={directions}
                {...operations}
                lazyDetails
                goalContext
                recurrenceLabel={recurrenceLabel(action)}
              />
              <span className="planner-muted">
                {action.completedAt?.toLocaleDateString('ru-RU') ?? 'Дата неизвестна'}
              </span>
              {action.actualResult && (
                <p className="planner-muted">{action.actualResult.toString()}</p>
              )}
              {operations.onReopen && (
                <button
                  type="button"
                  disabled={operations.busy}
                  onClick={() => {
                    void operations.onReopen?.(action.id.toString());
                  }}
                >
                  Вернуть в работу
                </button>
              )}
            </li>
          ))}
        </ul>
      </details>
      <GoalPeriodMembership goalId={id} today={today} periods={periods} memberships={memberships} />
      <details className="planner-goal-details">
        <summary>Детали</summary>
        <p>{goal.description || 'Описание пока не добавлено.'}</p>
        {goal.whyImportant && <p>Почему важно: {goal.whyImportant}</p>}
        {goal.whyNow && <p>Почему сейчас: {goal.whyNow}</p>}
        {goal.nextProgress && <p>Первый шаг: {goal.nextProgress}</p>}
        <a href={`#/v2/goals/${encodeURIComponent(id)}?edit=1`}>Изменить свойства цели</a>
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
    </section>
  );
}
