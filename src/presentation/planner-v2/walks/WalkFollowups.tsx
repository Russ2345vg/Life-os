import { useCallback, useEffect, useRef, useState } from 'react';
import { buildWalkReturnItems } from '../../../application/walk/GetWalkReturnItems';
import type { WalkServices } from '../../../application/walk/WalkServices';
import type { WalkHistoryPage } from '../../../application/ports/WalkRepository';
import type { WalkCapture } from '../../../domain/walk-capture/WalkCapture';
import type { Walk } from '../../../domain/walk/Walk';
import type { PlannerRoute } from '../PlannerNavigation';
import { Capture } from './WalkCaptures';
import { walkError } from './useWalkState';

const query = { intent: 'reflection', status: 'completed' } as const;

export function WalkFollowups({
  services,
  captures,
  onNavigate,
  onOpen,
  onContinue,
}: {
  readonly services: WalkServices;
  readonly captures: readonly WalkCapture[];
  readonly onNavigate: (route: PlannerRoute) => void;
  readonly onOpen: (walk: Walk) => void;
  readonly onContinue: (walk: Walk) => void;
}) {
  const [page, setPage] = useState<WalkHistoryPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const refresh = useCallback(() => {
    const current = ++generation.current;
    setBusy(true);
    void services.queries
      .list(query)
      .then((next) => {
        if (current === generation.current) {
          setPage(next);
          setError('');
        }
      })
      .catch((failure: unknown) => {
        if (current === generation.current) setError(walkError(failure));
      })
      .finally(() => {
        if (current === generation.current) setBusy(false);
      });
  }, [services]);
  useEffect(() => {
    let cancelled = false;
    const generationRef = generation;
    queueMicrotask(() => {
      if (!cancelled) refresh();
    });
    const off = services.changes.subscribe(refresh);
    return () => {
      cancelled = true;
      generationRef.current++;
      off();
    };
  }, [refresh, services]);

  const items = buildWalkReturnItems(page?.items ?? [], captures);
  return (
    <section className="walk-followups">
      <header className="walk-followups__heading">
        <h2>К чему вернуться</h2>
        <p>Вопросы, следующие шаги и мысли, сохранённые во время прогулок.</p>
      </header>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={refresh}>
            Повторить загрузку
          </button>
        </div>
      )}
      <section className="walk-panel" aria-label="Открытые вопросы и шаги">
        <h3>Открытые вопросы и шаги</h3>
        {!page && busy && <p role="status">Загружаем записи прогулок…</p>}
        {page && items.walks.length === 0 && (
          <p className="planner-muted">
            {page.nextCursor
              ? 'В последних прогулках открытых вопросов нет. Можно посмотреть более ранние.'
              : 'Пока нет открытых вопросов или следующих шагов.'}
          </p>
        )}
        {items.walks.map((walk) => (
          <article className="walk-saved-note" key={walk.id.toString()}>
            <small>
              {walk.date.toString()} · {walk.reflectionQuestion ?? 'Размышление'}
            </small>
            {walk.reflectionNotes?.open && (
              <p>
                <strong>Что осталось открытым:</strong> {walk.reflectionNotes.open}
              </p>
            )}
            {walk.reflectionNotes?.next && (
              <p>
                <strong>Что хочу сделать:</strong> {walk.reflectionNotes.next}
              </p>
            )}
            <div className="walk-start-actions">
              <button type="button" onClick={() => onOpen(walk)}>
                Открыть прогулку
              </button>
              <button type="button" onClick={() => onContinue(walk)}>
                Продолжить тему
              </button>
            </div>
          </article>
        ))}
        {page?.nextCursor && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const current = ++generation.current;
              setBusy(true);
              void services.queries
                .list({ ...query, cursor: page.nextCursor! })
                .then((next) => {
                  if (current === generation.current) {
                    setPage({ items: [...page.items, ...next.items], nextCursor: next.nextCursor });
                    setError('');
                  }
                })
                .catch((failure: unknown) => {
                  if (current === generation.current) setError(walkError(failure));
                })
                .finally(() => {
                  if (current === generation.current) setBusy(false);
                });
            }}
          >
            {busy ? 'Загружаем…' : 'Показать более ранние прогулки'}
          </button>
        )}
      </section>
      <section className="walk-panel" aria-label="Необработанные мысли">
        <h3>Необработанные мысли · {items.captures.length}</h3>
        {items.captures.length === 0 && <p className="planner-muted">Все мысли разобраны.</p>}
        {items.captures.slice(0, 5).map((capture) => (
          <Capture
            key={capture.id.toString()}
            capture={capture}
            services={services}
            onNavigate={onNavigate}
          />
        ))}
        {items.captures.length > 5 && (
          <button type="button" onClick={() => onNavigate({ view: 'walks', page: 'captures' })}>
            Показать все мысли
          </button>
        )}
      </section>
    </section>
  );
}
