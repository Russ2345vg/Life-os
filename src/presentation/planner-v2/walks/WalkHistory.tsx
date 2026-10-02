import { useEffect, useMemo, useRef, useState } from 'react';
import type { WalkServices } from '../../../application/walk/WalkServices';
import type { WalkHistoryPage, WalkHistoryQuery } from '../../../application/ports/WalkRepository';
import type { Walk } from '../../../domain/walk/Walk';
import type { PlannerRoute } from '../PlannerNavigation';
import type { PlannerOption } from '../PlannerActionForm';
import { WalkRows } from './PlannerWalks';
import { walkError } from './useWalkState';
export function WalkHistory({
  services,
  route,
  onNavigate,
  onOpen,
  spheres,
}: {
  services: WalkServices;
  route: Extract<PlannerRoute, { view: 'walks' }>;
  onNavigate: (route: PlannerRoute) => void;
  onOpen: (walk: Walk) => void;
  spheres: readonly PlannerOption[];
}) {
  const [result, setResult] = useState<WalkHistoryPage | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const query = useMemo<WalkHistoryQuery>(
    () => ({
      ...(route.search ? { search: route.search } : {}),
      ...(route.status &&
      ['planned', 'running', 'paused', 'completed', 'abandoned'].includes(route.status)
        ? { status: route.status as Walk['status'] }
        : {}),
      ...(route.from ? { from: route.from } : {}),
      ...(route.to ? { to: route.to } : {}),
      ...(route.intent && ['free', 'recovery', 'reflection'].includes(route.intent)
        ? { intent: route.intent as NonNullable<Walk['intent']> }
        : {}),
      ...(route.sphereId ? { sphereId: route.sphereId } : {}),
      deleted: route.status === 'deleted',
    }),
    [route.search, route.status, route.from, route.to, route.intent, route.sphereId],
  );
  const change = (
    key: 'search' | 'status' | 'from' | 'to' | 'intent' | 'sphereId',
    value: string,
  ) => {
    generation.current++;
    onNavigate({ ...route, page: 'history', [key]: value });
  };
  useEffect(() => {
    const refresh = () => {
      const current = ++generation.current;
      setBusy(true);
      setResult(null);
      void services.queries
        .list(query)
        .then((page) => {
          if (current === generation.current) {
            setResult(page);
            setError('');
          }
        })
        .catch((failure: unknown) => {
          if (current === generation.current) setError(walkError(failure));
        })
        .finally(() => {
          if (current === generation.current) setBusy(false);
        });
    };
    refresh();
    const off = services.changes.subscribe(refresh);
    return () => {
      generation.current++;
      off();
    };
  }, [query, services]);
  return (
    <section>
      <h2>История прогулок</h2>
      <form className="walk-history-filters" onSubmit={(event) => event.preventDefault()}>
        <label>
          Поиск по вопросу и итогу
          <input
            type="search"
            value={route.search ?? ''}
            onChange={(event) => change('search', event.target.value)}
          />
        </label>
        <label>
          Состояние
          <select
            value={route.status ?? ''}
            onChange={(event) => change('status', event.target.value)}
          >
            <option value="">Все</option>
            <option value="completed">Завершённые</option>
            <option value="abandoned">Прерванные</option>
            <option value="planned">Запланированные</option>
            <option value="running">Идущие</option>
            <option value="paused">На паузе</option>
            <option value="deleted">Удалённые</option>
          </select>
        </label>
        <label>
          Намерение
          <select
            value={route.intent ?? ''}
            onChange={(event) => change('intent', event.target.value)}
          >
            <option value="">Любое</option>
            <option value="free">Свободно</option>
            <option value="recovery">Восстановиться</option>
            <option value="reflection">Подумать</option>
          </select>
        </label>
        <label>
          Сфера
          <select
            value={route.sphereId ?? ''}
            onChange={(event) => change('sphereId', event.target.value)}
          >
            <option value="">Любая</option>
            {spheres.map((sphere) => (
              <option key={sphere.id} value={sphere.id}>
                {sphere.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          С даты
          <input
            type="date"
            value={route.from ?? ''}
            onChange={(event) => change('from', event.target.value)}
          />
        </label>
        <label>
          По дату
          <input
            type="date"
            value={route.to ?? ''}
            onChange={(event) => change('to', event.target.value)}
          />
        </label>
        <button onClick={() => onNavigate({ view: 'walks', page: 'history' })}>
          Сбросить фильтры
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Загружаем историю…</p>}
      {result && <WalkRows walks={result.items} onOpen={onOpen} />}
      {result?.nextCursor && (
        <button
          disabled={busy}
          onClick={() => {
            const current = ++generation.current;
            setBusy(true);
            void services.queries
              .list({ ...query, cursor: result.nextCursor! })
              .then((next) => {
                if (current === generation.current)
                  setResult({
                    items: [...result.items, ...next.items],
                    nextCursor: next.nextCursor,
                  });
              })
              .catch((failure: unknown) => {
                if (current === generation.current) setError(walkError(failure));
              })
              .finally(() => {
                if (current === generation.current) setBusy(false);
              });
          }}
        >
          Показать ещё 30
        </button>
      )}
    </section>
  );
}
