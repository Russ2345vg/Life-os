import type { Direction, Goal, LifeAction } from '../../domain';
import { PlannerActionRow } from './PlannerActionList';
import type { PlannerViews } from './plannerViewsModel';
import {
  PlannerBatch,
  PlannerBranch,
  PlannerGoalCard,
  type PlannerViewOperations,
} from './PlannerViewParts';

export function PlannerTree({
  data,
  ...operations
}: PlannerViewOperations & { readonly data: PlannerViews }) {
  const actions = (items: readonly LifeAction[]) => (
    <PlannerBatch
      items={items}
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
  );
  const goals = (items: readonly Goal[]) => (
    <PlannerBatch
      items={items}
      render={(goal) => {
        const children = data.actionsByGoal.get(goal.id.toString()) ?? [];
        return (
          <PlannerBranch key={goal.id.toString()} title={goal.title} count={children.length}>
            <PlannerGoalCard goal={goal} data={data} {...operations} />
            {actions(children)}
            {!children.length && <p className="planner-muted">У цели пока нет действий.</p>}
            <a
              className="planner-text-link"
              href={`#/v2/actions/new?goalId=${encodeURIComponent(goal.id.toString())}`}
            >
              + Добавить действие
            </a>
          </PlannerBranch>
        );
      }}
    />
  );
  const directions = (items: readonly Direction[]) => (
    <PlannerBatch
      items={items}
      render={(direction) => {
        const children = data.goalsByDirection.get(direction.id.toString()) ?? [];
        return (
          <PlannerBranch
            key={direction.id.toString()}
            title={direction.name}
            count={children.length}
          >
            <details className="planner-structure-card">
              <summary>Карточка направления</summary>
              <h3>{direction.name}</h3>
              <p>{direction.status === 'archived' ? 'В архиве' : 'Активно'}</p>
              {direction.description && <p>{direction.description}</p>}
              {direction.strategicIntent && <p>Замысел: {direction.strategicIntent}</p>}
              {direction.desiredState && <p>Желаемое состояние: {direction.desiredState}</p>}
              {direction.inScope && <p>Включает: {direction.inScope}</p>}
              {direction.outOfScope && <p>За пределами: {direction.outOfScope}</p>}
            </details>
            {goals(children)}
            {!children.length && (
              <p className="planner-muted">
                У направления пока нет целей. Направление можно выбрать у существующей цели.
              </p>
            )}
          </PlannerBranch>
        );
      }}
    />
  );
  const loose = (sphereId: string) => {
    const items = data.goalsWithoutDirectionBySphere.get(sphereId) ?? [];
    return items.length > 0 ? (
      <PlannerBranch title="Без направления" count={items.length}>
        {goals(items)}
      </PlannerBranch>
    ) : null;
  };
  const unassignedDirections = data.directionsBySphere.get('') ?? [];
  return (
    <section className="planner-tree" aria-label="Древо LifeOS">
      <p className="planner-muted">
        Сфера → Направление → Цель → Действие. Раскройте нужную ветку.
      </p>
      {!data.goals.length &&
        !data.actions.length &&
        !data.spheres.length &&
        !data.directions.length && (
          <p className="planner-empty">
            Здесь появятся ваши цели и действия. Начать можно без сферы и направления.
          </p>
        )}
      <PlannerBatch
        items={data.spheres}
        render={(sphere) => {
          const children = data.directionsBySphere.get(sphere.id.toString()) ?? [];
          const directGoals = data.goalsWithoutDirectionBySphere.get(sphere.id.toString()) ?? [];
          return (
            <PlannerBranch
              key={sphere.id.toString()}
              title={sphere.name}
              count={children.length + directGoals.length}
            >
              <details className="planner-structure-card">
                <summary>Карточка сферы</summary>
                <h3>{sphere.name}</h3>
                <p>{sphere.status === 'archived' ? 'В архиве' : 'Активна'}</p>
                {sphere.description && <p>{sphere.description}</p>}
              </details>
              {directions(children)}
              {loose(sphere.id.toString())}
              {!children.length && !directGoals.length && (
                <p className="planner-muted">В этой сфере пока нет направлений и целей.</p>
              )}
            </PlannerBranch>
          );
        }}
      />
      {unassignedDirections.length > 0 && (
        <PlannerBranch title="Без сферы" count={unassignedDirections.length}>
          {directions(unassignedDirections)}
        </PlannerBranch>
      )}
      {loose('')}
      {data.actionsWithoutGoal.length > 0 && (
        <PlannerBranch title="Без цели" count={data.actionsWithoutGoal.length}>
          {actions(data.actionsWithoutGoal)}
        </PlannerBranch>
      )}
      <a className="planner-text-link" href="#/v2/goals/new">
        + Добавить цель
      </a>
    </section>
  );
}
