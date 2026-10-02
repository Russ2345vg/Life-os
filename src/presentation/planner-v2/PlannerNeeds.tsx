import type { PlannerLibrarySnapshot } from '../../application/planner/PlannerLibraryReadModel';
import { buildPlannerRoute, type PlannerRoute } from './PlannerNavigation';
import { needKey, type NeedCatalogEntry, type NeedLink } from './needCatalogModel';
import './planner-needs.css';

const statusLabel: Record<string, string> = {
  active: 'В работе',
  future: 'На будущее',
  achieved: 'Достигнута',
  completed: 'Выполнено',
  ready: 'В работе',
  draft: 'Черновик',
  paused: 'Пауза',
  archived: 'В архиве',
  cancelled: 'Отменено',
};

export function PlannerNeeds({
  route,
  catalog,
  snapshot,
  onNavigate,
  onRetry,
}: {
  readonly route: Extract<PlannerRoute, { view: 'needs' }>;
  readonly catalog: readonly NeedCatalogEntry[];
  readonly snapshot: PlannerLibrarySnapshot;
  readonly onNavigate: (route: PlannerRoute) => void;
  readonly onRetry: () => void;
}) {
  const selected = route.need
    ? catalog.find((entry) => entry.key === needKey(route.need!))
    : undefined;
  const go = (target: PlannerRoute) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate(target);
  };
  if (snapshot.error && !snapshot.data)
    return (
      <section className="planner-needs">
        <h1>Потребности</h1>
        <p role="alert" className="planner-error">
          Не удалось загрузить связи потребностей.
        </p>
        <button type="button" onClick={onRetry}>
          Повторить загрузку
        </button>
      </section>
    );
  return (
    <section className="planner-needs">
      {route.need && (
        <a className="planner-text-link" href="#/v2/needs" onClick={go({ view: 'needs' })}>
          ← Все потребности
        </a>
      )}
      <header className="planner-needs__header">
        <p className="planner-eyebrow">Цели и действия</p>
        <h1>
          {route.need
            ? (selected?.title ?? (snapshot.data ? 'Потребность не найдена' : route.need))
            : 'Потребности'}
        </h1>
        <p className="planner-muted">
          {route.need
            ? 'Здесь видно, какие направления, цели и действия поддерживают эту потребность.'
            : 'Выберите потребность, чтобы увидеть связанные с ней цели и действия. Свою можно добавить при их создании.'}
        </p>
      </header>
      {!snapshot.data && (
        <p role="status" className="planner-muted">
          Загружаем связи…
        </p>
      )}
      {snapshot.error && snapshot.data && (
        <div className="planner-error" role="alert">
          Не удалось обновить связи потребностей.{' '}
          <button type="button" onClick={onRetry}>
            Повторить загрузку
          </button>
        </div>
      )}
      {selected ? (
        <div className="planner-needs__groups">
          <NeedGroup title="Цели" links={selected.goals} kind="goal" onNavigate={go} />
          <NeedGroup title="Действия" links={selected.actions} kind="action" onNavigate={go} />
          <NeedGroup
            title="Направления"
            links={selected.directions}
            kind="direction"
            onNavigate={go}
          />
        </div>
      ) : route.need && snapshot.data ? (
        <p className="planner-empty">Такой потребности пока нет в списке.</p>
      ) : !route.need ? (
        <ul className="planner-needs__list">
          {catalog.map((entry) => (
            <li key={entry.key}>
              <a
                href={buildPlannerRoute({ view: 'needs', need: entry.title })}
                onClick={go({ view: 'needs', need: entry.title })}
              >
                <strong>{entry.title}</strong>
                <span>
                  {entry.goals.length} целей · {entry.actions.length} действий
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function NeedGroup({
  title,
  links,
  kind,
  onNavigate,
}: {
  readonly title: string;
  readonly links: readonly NeedLink[];
  readonly kind: 'direction' | 'goal' | 'action';
  readonly onNavigate: (
    route: PlannerRoute,
  ) => (event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <section>
      <h2>
        {title} · {links.length}
      </h2>
      {links.length ? (
        <ul>
          {links.map((link) => {
            const target: PlannerRoute = { view: kind, id: link.id };
            return (
              <li key={link.id}>
                <a href={buildPlannerRoute(target)} onClick={onNavigate(target)}>
                  {link.title}
                </a>
                <span>
                  {statusLabel[link.status] ?? link.status}
                  {link.inherited ? ' · От родителя' : ''}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="planner-muted">Пока нет связанных объектов.</p>
      )}
    </section>
  );
}
