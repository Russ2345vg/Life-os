import type { Goal, LifeAction } from '../../domain';
import './action-results.css';

export function ActionResults({
  actions,
  title = 'История успехов',
  goals = [],
}: {
  readonly actions: readonly LifeAction[];
  readonly title?: string;
  readonly goals?: readonly Goal[];
}) {
  const relatedGoals = new Map(goals.map((goal) => [goal.id.toString(), goal]));
  return (
    <section className="planner-action-results" aria-label={title}>
      <h2>
        {title} <small>{actions.length}</small>
      </h2>
      {actions.length === 0 ? (
        <p className="planner-muted">Здесь появятся завершённые действия.</p>
      ) : (
        <ul>
          {actions.map((action) => {
            const goal = action.goalId ? relatedGoals.get(action.goalId.toString()) : undefined;
            return (
              <li key={action.id.toString()}>
                <p className="planner-action-results__meta">
                  <a href={`#/v2/actions/${encodeURIComponent(action.id.toString())}`}>
                    {action.title.toString()}
                  </a>
                  <time dateTime={action.completedAt?.toISOString() ?? undefined}>
                    {action.completedAt?.toLocaleDateString('ru-RU') ?? 'Дата неизвестна'}
                  </time>
                </p>
                {goal && (
                  <p className="planner-action-results__goal">
                    Цель:{' '}
                    <a href={`#/v2/goals/${encodeURIComponent(goal.id.toString())}`}>
                      {goal.title}
                    </a>
                  </p>
                )}
                {action.actualResult && <p>{action.actualResult.toString()}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
