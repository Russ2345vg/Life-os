import { useEffect, useRef, useState, type RefObject } from 'react';
import type {
  ConnectionDestination,
  ConnectionOverview,
  ConnectionRow,
  ConnectionSource,
  GetConnections,
} from '../../../application/connections/GetConnections';
import type { PlannerRoute } from '../PlannerNavigation';
import './connections.css';

type Collection = 'actions' | 'walks' | 'memories';

function routeFor(target: ConnectionDestination): PlannerRoute {
  switch (target.kind) {
    case 'sphere':
      return { view: 'sphere', id: target.id };
    case 'direction':
      return { view: 'direction', id: target.id };
    case 'goal':
      return { view: 'goal', id: target.id };
    case 'lifeAction':
      return { view: 'action', id: target.id };
    case 'walk':
      return { view: 'walks', id: target.id };
    case 'memory':
      return { view: 'memory', id: target.id };
    case 'diary':
      return { view: 'diary', period: target.period, date: target.date };
  }
}

const GROUPS = [
  ['why', 'Зачем'],
  ['work', 'В работе'],
  ['experience', 'Опыт'],
] as const;

const KIND_LABEL: Readonly<Record<ConnectionRow['kind'], string>> = {
  sphere: 'Сфера',
  direction: 'Направление',
  goal: 'Цель',
  lifeAction: 'Действие',
  walk: 'Прогулка',
  memory: 'Память',
  diary: 'Дневник',
  plan: 'План',
  routine: 'Распорядок',
  contribution: 'Вклад',
};

function statusLabel(row: ConnectionRow): string | null {
  if (row.availability === 'missing') return 'Источник недоступен';
  if (row.availability === 'archived') return 'В архиве';
  if (row.availability === 'changed') return 'Исходная запись изменена';
  return null;
}

export function ConnectionsView({
  overview,
  loading,
  error,
  moreBusy,
  moreError,
  onRetry,
  onMore,
  onNavigate,
  headingRef,
  onBack,
  backLabel,
}: {
  readonly overview: ConnectionOverview | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly moreBusy: Collection | null;
  readonly moreError: string | null;
  readonly onRetry: () => void;
  readonly onMore: (collection: Collection, cursor: string) => void;
  readonly onNavigate: (route: PlannerRoute) => void;
  readonly headingRef?: RefObject<HTMLHeadingElement | null> | undefined;
  readonly onBack?: (() => void) | undefined;
  readonly backLabel?: string | undefined;
}) {
  return (
    <div className="connections-view">
      {onBack && (
        <button className="connections-back" type="button" onClick={onBack}>
          ← {backLabel ?? 'Назад'}
        </button>
      )}
      <header className="connections-heading">
        <p className="planner-eyebrow">Контекст записи</p>
        <h2 ref={headingRef} tabIndex={-1}>
          Связи
        </h2>
        {overview && <p>{overview.title}</p>}
      </header>
      {loading ? (
        <p role="status">Загружаем связи…</p>
      ) : error ? (
        <div role="alert" className="planner-error">
          <p>{error}</p>
          <button type="button" onClick={onRetry}>
            Повторить загрузку
          </button>
        </div>
      ) : overview && overview.rows.length === 0 ? (
        <p className="connections-empty">У этой записи пока нет связей с другими разделами.</p>
      ) : (
        overview && (
          <>
            {GROUPS.map(([group, title]) => {
              const rows = overview.rows.filter((item) => item.group === group);
              if (rows.length === 0) return null;
              return (
                <section className="connections-group" aria-label={title} key={group}>
                  <h3>{title}</h3>
                  {rows.map((item) => {
                    const content = (
                      <>
                        <span className="connections-row__main">
                          {KIND_LABEL[item.kind]} · {item.title}
                        </span>
                        <span className="connections-row__reason">{item.reason}</span>
                        {statusLabel(item) && (
                          <span className="connections-row__status">{statusLabel(item)}</span>
                        )}
                      </>
                    );
                    return item.target ? (
                      <button
                        className="connections-row connections-row--link"
                        type="button"
                        key={item.key}
                        onClick={() => onNavigate(routeFor(item.target!))}
                      >
                        {content}
                        <span className="connections-row__arrow" aria-hidden="true">
                          ↗
                        </span>
                      </button>
                    ) : (
                      <div className="connections-row" key={item.key}>
                        {content}
                      </div>
                    );
                  })}
                </section>
              );
            })}
            {(['actions', 'walks', 'memories'] as const).map((collection) => {
              const cursor = overview.cursors[collection];
              return cursor ? (
                <button
                  className="connections-more"
                  type="button"
                  key={collection}
                  disabled={moreBusy !== null}
                  onClick={() => onMore(collection, cursor)}
                >
                  {moreBusy === collection ? 'Загружаем…' : 'Показать ещё'}
                  <span className="sr-only">
                    {' '}
                    {
                      KIND_LABEL[
                        collection === 'actions'
                          ? 'lifeAction'
                          : collection === 'walks'
                            ? 'walk'
                            : 'memory'
                      ]
                    }
                  </span>
                </button>
              ) : null;
            })}
            {moreError && <p role="alert">{moreError}</p>}
          </>
        )
      )}
    </div>
  );
}

export function ConnectionsContent({
  source,
  connections,
  onNavigate,
  headingRef,
  onBack,
  backLabel,
}: {
  readonly source: ConnectionSource;
  readonly connections: Pick<GetConnections, 'read' | 'more'>;
  readonly onNavigate: (route: PlannerRoute) => void;
  readonly headingRef?: RefObject<HTMLHeadingElement | null> | undefined;
  readonly onBack?: (() => void) | undefined;
  readonly backLabel?: string | undefined;
}) {
  const [request, setRequest] = useState(0);
  return (
    <ConnectionsLoader
      key={`${source.kind}:${source.id}:${request}`}
      kind={source.kind}
      id={source.id}
      connections={connections}
      onNavigate={onNavigate}
      headingRef={headingRef}
      onBack={onBack}
      backLabel={backLabel}
      onRetry={() => setRequest((value) => value + 1)}
    />
  );
}

function ConnectionsLoader({
  kind,
  id,
  connections,
  onNavigate,
  headingRef,
  onBack,
  backLabel,
  onRetry,
}: {
  readonly kind: ConnectionSource['kind'];
  readonly id: string;
  readonly connections: Pick<GetConnections, 'read' | 'more'>;
  readonly onNavigate: (route: PlannerRoute) => void;
  readonly headingRef?: RefObject<HTMLHeadingElement | null> | undefined;
  readonly onBack?: (() => void) | undefined;
  readonly backLabel?: string | undefined;
  readonly onRetry: () => void;
}) {
  const [overview, setOverview] = useState<ConnectionOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moreBusy, setMoreBusy] = useState<Collection | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    void connections.read({ kind, id }).then(
      (value) => {
        if (generation.current !== current) return;
        setOverview(value);
        setLoading(false);
      },
      (reason: unknown) => {
        if (generation.current !== current) return;
        setError(reason instanceof Error ? reason.message : 'Не удалось загрузить связи.');
        setLoading(false);
      },
    );
    return () => {
      generation.current = current + 1;
    };
  }, [connections, kind, id]);

  const more = (collection: Collection, cursor: string) => {
    const current = generation.current;
    setMoreBusy(collection);
    setMoreError(null);
    void connections.more({ kind, id }, collection, cursor).then(
      (page) => {
        if (generation.current !== current) return;
        setOverview((previous) =>
          previous
            ? {
                ...previous,
                rows: [...previous.rows, ...page.items],
                cursors: { ...previous.cursors, [collection]: page.nextCursor },
              }
            : previous,
        );
        setMoreBusy(null);
      },
      (reason: unknown) => {
        if (generation.current !== current) return;
        setMoreError(
          reason instanceof Error ? reason.message : 'Не удалось загрузить продолжение.',
        );
        setMoreBusy(null);
      },
    );
  };

  return (
    <ConnectionsView
      overview={overview}
      loading={loading}
      error={error}
      moreBusy={moreBusy}
      moreError={moreError}
      onRetry={onRetry}
      onMore={more}
      onNavigate={onNavigate}
      headingRef={headingRef}
      onBack={onBack}
      backLabel={backLabel}
    />
  );
}
