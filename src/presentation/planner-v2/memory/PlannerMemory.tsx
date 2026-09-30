import { useCallback, useEffect, useRef, useState } from 'react';
import { EntityId, type DayDate } from '../../../domain';
import {
  MEMORY_KINDS,
  type MemoryDraft,
  type MemoryEvent,
  type MemoryEventSummary,
  type MemoryKind,
} from '../../../domain/memory';
import type { MemoryServices } from '../../../application/memory/MemoryServices';
import type { MemoryPage, MemoryQuery } from '../../../application/ports/MemoryRepository';
import type { MemoryYearOverview } from '../../../application/memory/MemoryQueries';
import { useSyncContentChanged } from '../../sync/SyncStatusContext';
import { PlannerSheet } from '../PlannerSheet';
import type { PlannerRoute } from '../PlannerNavigation';
import { MemoryEditor } from './MemoryEditor';
import { MemoryTimeline } from './MemoryTimeline';
import { MemoryYearView } from './MemoryYearView';
import {
  MEMORY_LABELS,
  memoryContextLabel,
  memoryDate,
  memoryError,
  type MemoryCatalog,
} from './memoryPresentation';

type MemoryRoute = Extract<PlannerRoute, { view: 'memory' }>;
export function PlannerMemory({
  services,
  route,
  currentDate,
  catalog,
  onNavigate,
}: {
  readonly services: MemoryServices;
  readonly route: MemoryRoute;
  readonly currentDate: DayDate;
  readonly catalog: MemoryCatalog;
  readonly onNavigate: (route: PlannerRoute) => void;
}) {
  const year = route.year ?? Number(currentDate.toString().slice(0, 4));
  const mode = route.mode ?? 'timeline';
  const [yearInput, setYearInput] = useState(String(year));
  const [search, setSearch] = useState(route.search ?? '');
  const [inputRoute, setInputRoute] = useState({ year, search: route.search });
  if (inputRoute.year !== year || inputRoute.search !== route.search) {
    setInputRoute({ year, search: route.search });
    if (inputRoute.year !== year) setYearInput(String(year));
    if (inputRoute.search !== route.search) setSearch(route.search ?? '');
  }
  const [page, setPage] = useState<MemoryPage | null>(null);
  const [overview, setOverview] = useState<MemoryYearOverview | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [moreBusy, setMoreBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const generation = useRef(0);
  const [editor, setEditor] = useState<{
    draft: MemoryDraft;
    version: number | null;
    pendingPhoto: boolean;
  } | null>(null);
  const [detail, setDetail] = useState<MemoryEvent | null>(null);
  const [detailHasPhoto, setDetailHasPhoto] = useState(false);
  const [loadedDetailKey, setLoadedDetailKey] = useState<string | null>(null);
  const [previousId, setPreviousId] = useState(route.id);
  if (previousId !== route.id) {
    setPreviousId(route.id);
    setLoadedDetailKey(null);
  }
  const [detailError, setDetailError] = useState<string | null>(null);
  const [sourceStatus, setSourceStatus] = useState<'available' | 'changed' | 'missing' | null>(
    null,
  );
  const query: MemoryQuery = {
    year,
    deleted: route.deleted === true,
    ...(route.kind ? { kind: route.kind } : {}),
    ...(route.sphereId ? { sphereId: route.sphereId } : {}),
    ...(route.search ? { search: route.search } : {}),
    ...(route.highlight ? { highlightOnly: true } : {}),
  };
  const queryKey = JSON.stringify(query);
  const loadKey = JSON.stringify([queryKey, mode, revision]);
  const loading = loadedKey !== loadKey;
  const detailKey = route.id ? JSON.stringify([route.id, revision]) : null;
  const detailLoading = loadedDetailKey !== detailKey;
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useSyncContentChanged('memoryEvents|sync_attachment_queue|diaryEntries', refresh);
  useEffect(() => {
    if (search === (route.search ?? '')) return;
    const timer = setTimeout(
      () => onNavigate({ ...route, id: undefined, search: search || undefined }),
      250,
    );
    return () => clearTimeout(timer);
  }, [search, route, onNavigate]);
  useEffect(() => {
    const request = ++generation.current;
    let active = true;
    const pending =
      mode === 'year'
        ? services.queries.getYear(year).then((value) => {
            if (active) {
              setOverview(value);
              setError(null);
            }
          })
        : services.queries.list(JSON.parse(queryKey) as MemoryQuery).then((value) => {
            if (active) {
              setPage(value);
              setError(null);
            }
          });
    void pending
      .catch((error: unknown) => {
        if (active) {
          setPage(null);
          setOverview(null);
          setError(memoryError(error));
        }
      })
      .finally(() => {
        if (active && request === generation.current) {
          setLoadedKey(loadKey);
          setMoreBusy(false);
        }
      });
    return () => {
      active = false;
    };
  }, [services.queries, queryKey, mode, year, revision, loadKey]);
  useEffect(() => {
    if (!route.id) return;
    let active = true;
    void Promise.all([
      services.queries.get(EntityId.create(route.id)),
      services.queries.getSummary(EntityId.create(route.id)),
    ])
      .then(async ([event, summary]) => {
        if (!active) return;
        setDetail(event);
        setDetailHasPhoto(summary?.hasPhoto === true);
        setSourceStatus(null);
        if (!event) {
          setDetailError('Воспоминание не найдено.');
          return;
        }
        setDetailError(null);
        if (event.diarySource) {
          const status = await services.diaryImport.sourceStatus(event.diarySource);
          if (active) setSourceStatus(status);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setDetail(null);
          setDetailError(memoryError(error));
        }
      })
      .finally(() => {
        if (active) setLoadedDetailKey(detailKey);
      });
    return () => {
      active = false;
    };
  }, [route.id, services.queries, services.diaryImport, revision, detailKey]);
  const navigate = (next: Partial<MemoryRoute>) => onNavigate({ ...route, id: undefined, ...next });
  const add = () => {
    if (services.commands.enabled)
      setEditor({ draft: services.commands.prepareCreate(), version: null, pendingPhoto: false });
  };
  const open = (event: MemoryEventSummary) => onNavigate({ ...route, id: event.id.toString() });
  const reset = () => {
    setSearch('');
    navigate({ kind: undefined, sphereId: undefined, highlight: undefined, search: undefined });
  };
  const run = async (command: () => Promise<MemoryEvent>, message: string) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      await command();
      setNotice(message);
      refresh();
    } catch (error: unknown) {
      setError(memoryError(error));
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  const highlight = (summary: MemoryEventSummary) =>
    void run(
      async () => {
        const event = await services.queries.get(summary.id);
        if (!event) throw new Error('Воспоминание не найдено.');
        if (event.version !== summary.version)
          throw new Error('Воспоминание изменилось. Обновите список.');
        return services.commands.save({ ...event, isHighlight: !event.isHighlight }, event.version);
      },
      summary.isHighlight ? 'Отметка главного снята' : 'Воспоминание отмечено главным',
    );
  const more = async () => {
    if (!page?.nextCursor || moreBusy || loading) return;
    const request = generation.current;
    setMoreBusy(true);
    try {
      const next = await services.queries.list({ ...query, cursor: page.nextCursor });
      if (request === generation.current)
        setPage((current) =>
          current
            ? {
                items: [
                  ...current.items,
                  ...next.items.filter(
                    (event) => !current.items.some((old) => old.id.equals(event.id)),
                  ),
                ],
                nextCursor: next.nextCursor,
              }
            : next,
        );
    } catch (error: unknown) {
      if (request === generation.current) setError(memoryError(error));
    } finally {
      if (request === generation.current) setMoreBusy(false);
    }
  };
  const yearChange = () => {
    const selected = Number(yearInput);
    if (Number.isInteger(selected) && selected >= 1 && selected <= 9999)
      navigate({ year: selected });
    else setYearInput(String(year));
  };
  const filtered = Boolean(route.kind || route.sphereId || route.search || route.highlight);
  return (
    <section className="memory-page" aria-labelledby="memory-page-title">
      <header className="memory-header">
        <div>
          <p className="planner-eyebrow">Личная история</p>
          <h1 id="memory-page-title">Память жизни</h1>
          <p className="planner-muted">Моменты, к которым хочется возвращаться.</p>
        </div>
        <div className="memory-header-actions">
          <label className="memory-year-control">
            <span className="planner-sr-only">Год</span>
            <input
              type="number"
              min="1"
              max="9999"
              aria-label="Год"
              value={yearInput}
              onChange={(event) => setYearInput(event.target.value)}
              onBlur={yearChange}
              onKeyDown={(event) => {
                if (event.key === 'Enter') yearChange();
              }}
            />
          </label>
          <button
            className="planner-primary"
            type="button"
            disabled={!services.commands.enabled}
            onClick={add}
          >
            Добавить воспоминание
          </button>
        </div>
      </header>
      {!services.commands.enabled && (
        <p className="planner-muted" role="status">
          Создание воспоминаний будет доступно после обновления устройств. Сохранённая история
          доступна для просмотра.
        </p>
      )}
      <div className="memory-toolbar">
        <div className="planner-segments" aria-label="Представление">
          <button
            type="button"
            aria-pressed={mode === 'timeline'}
            onClick={() => navigate({ mode: 'timeline' })}
          >
            Лента
          </button>
          <button
            type="button"
            aria-pressed={mode === 'year'}
            onClick={() => navigate({ mode: 'year', deleted: undefined })}
          >
            Мой год
          </button>
        </div>
        {mode === 'timeline' && (
          <>
            <div className="memory-filters">
              <input
                type="search"
                aria-label="Поиск воспоминаний"
                placeholder="Поиск воспоминаний"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select
                aria-label="Тип события"
                value={route.kind ?? ''}
                onChange={(event) =>
                  navigate({ kind: (event.target.value || undefined) as MemoryKind | undefined })
                }
              >
                <option value="">Все события</option>
                {MEMORY_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {MEMORY_LABELS[kind]}
                  </option>
                ))}
              </select>
              <select
                aria-label="Фильтр по сфере"
                value={route.sphereId ?? ''}
                onChange={(event) => navigate({ sphereId: event.target.value || undefined })}
              >
                <option value="">Все сферы</option>
                {route.sphereId &&
                  !catalog.spheres.some((sphere) => sphere.id === route.sphereId) && (
                    <option value={route.sphereId}>Недоступная сфера</option>
                  )}
                {catalog.spheres.map((sphere) => (
                  <option value={sphere.id} key={sphere.id}>
                    {sphere.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="memory-filter-toggles">
              <button
                type="button"
                aria-pressed={route.highlight === true}
                onClick={() => navigate({ highlight: route.highlight ? undefined : true })}
              >
                Главное
              </button>
              <button
                type="button"
                aria-pressed={route.deleted === true}
                onClick={() => navigate({ deleted: route.deleted ? undefined : true })}
              >
                Удалённые
              </button>
              {filtered && (
                <button type="button" onClick={reset}>
                  Сбросить фильтры
                </button>
              )}
            </div>
          </>
        )}
      </div>
      {notice && (
        <p className="planner-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <div className="planner-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={refresh}>
            Обновить данные
          </button>
        </div>
      )}
      {loading ? (
        <div className="memory-loading" role="status">
          Загружаем воспоминания…
        </div>
      ) : mode === 'year' ? (
        overview && <MemoryYearView overview={overview} onOpen={open} />
      ) : (
        page && (
          <>
            <MemoryTimeline
              items={page.items}
              services={services}
              busy={busy}
              onOpen={open}
              onHighlight={highlight}
              onAdd={add}
              filtered={filtered}
              deleted={route.deleted === true}
              onReset={reset}
            />
            {page.nextCursor && (
              <button
                className="memory-more"
                type="button"
                disabled={moreBusy}
                onClick={() => void more()}
              >
                {moreBusy ? 'Загружаем…' : 'Показать ещё'}
              </button>
            )}
          </>
        )
      )}
      {route.id && !editor && (
        <PlannerSheet title="Воспоминание" onClose={() => navigate({})}>
          <div className="memory-detail">
            {detailLoading ? (
              <p role="status">Загружаем воспоминание…</p>
            ) : detailError ? (
              <div className="planner-error" role="alert">
                {detailError}
                <button type="button" onClick={refresh}>
                  Повторить загрузку
                </button>
              </div>
            ) : (
              detail && (
                <>
                  {detailHasPhoto && !detail.photo && (
                    <p className="memory-pending" role="status">
                      Фотография загружается · история уже доступна
                    </p>
                  )}
                  {detail.photo && (
                    <img
                      className="memory-photo"
                      src={detail.photo.dataUrl}
                      alt="Фотография воспоминания"
                    />
                  )}
                  <span className="memory-meta">
                    {memoryDate(detail.occurredOn.toString())} · {MEMORY_LABELS[detail.kind]}
                  </span>
                  <h2>{detail.title}</h2>
                  <p className="memory-full-story">{detail.body}</p>
                  <p className="memory-meta">{memoryContextLabel(detail.context)}</p>
                  {detail.diarySource && (
                    <div className="memory-source">
                      <p className="planner-muted">
                        {sourceStatus === 'missing'
                          ? 'Исходная запись дневника недоступна. Текст воспоминания сохранён.'
                          : sourceStatus === 'changed'
                            ? 'Запись дневника изменилась. Здесь сохранён выбранный тобой текст.'
                            : 'Из дневника'}
                      </p>
                      {sourceStatus !== null && sourceStatus !== 'missing' && (
                        <button
                          type="button"
                          onClick={() =>
                            onNavigate({
                              view: 'diary',
                              period: detail.diarySource!.kind,
                              date: detail.diarySource!.periodStart,
                            })
                          }
                        >
                          Открыть запись дневника
                        </button>
                      )}
                    </div>
                  )}
                  {detail.deletedAt ? (
                    <>
                      <p role="status">Воспоминание удалено. Его можно восстановить.</p>
                      <button
                        className="planner-primary"
                        type="button"
                        disabled={busy || !services.commands.enabled}
                        onClick={() =>
                          void run(
                            () => services.commands.restore(detail.id, detail.version),
                            'Воспоминание восстановлено',
                          )
                        }
                      >
                        Восстановить
                      </button>
                    </>
                  ) : (
                    <div className="memory-actions">
                      <button
                        type="button"
                        disabled={busy || !services.commands.enabled}
                        onClick={() =>
                          setEditor({
                            draft: detail,
                            version: detail.version,
                            pendingPhoto: detailHasPhoto && detail.photo === null,
                          })
                        }
                      >
                        Редактировать
                      </button>
                      <button
                        className="planner-danger"
                        type="button"
                        disabled={busy || !services.commands.enabled}
                        onClick={() =>
                          void run(
                            () => services.commands.remove(detail.id, detail.version),
                            'Воспоминание удалено · доступно восстановление',
                          )
                        }
                      >
                        Удалить воспоминание
                      </button>
                    </div>
                  )}
                </>
              )
            )}
          </div>
        </PlannerSheet>
      )}
      {editor && (
        <MemoryEditor
          key={editor.draft.id.toString()}
          initialDraft={editor.draft}
          expectedVersion={editor.version}
          pendingPhoto={editor.pendingPhoto}
          services={services}
          today={currentDate.toString()}
          catalog={catalog}
          onCancel={() => setEditor(null)}
          onSaved={(event) => {
            setEditor(null);
            setNotice('Воспоминание сохранено');
            refresh();
            if (Number(event.occurredOn.toString().slice(0, 4)) !== year)
              navigate({ year: Number(event.occurredOn.toString().slice(0, 4)) });
          }}
        />
      )}
    </section>
  );
}
