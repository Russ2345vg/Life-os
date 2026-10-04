import type { LifeAction } from '../../domain';
import './action-results.css';

export function ActionResults({
  actions,
  title = 'Итоги действий',
}: {
  readonly actions: readonly LifeAction[];
  readonly title?: string;
}) {
  return (
    <section className="planner-action-results" aria-label={title}>
      <h2>
        {title} <small>{actions.length}</small>
      </h2>
      {actions.length === 0 ? (
        <p className="planner-muted">Записанных итогов пока нет.</p>
      ) : (
        <ul>
          {actions.map((action) => (
            <li key={action.id.toString()}>
              <p className="planner-action-results__meta">
                <a href={`#/v2/actions/${encodeURIComponent(action.id.toString())}`}>
                  {action.title.toString()}
                </a>
                <time dateTime={action.completedAt?.toISOString() ?? undefined}>
                  {action.completedAt?.toLocaleDateString('ru-RU') ?? 'Дата неизвестна'}
                </time>
              </p>
              <p>{action.actualResult?.toString()}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
