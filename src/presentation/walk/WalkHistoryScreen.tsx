import { useCallback, useEffect, useRef, useState } from 'react';
import type { GetWalkHistory, GetWalkHistoryDetail } from '../../application';
import type { EntityId, Walk } from '../../domain';
import { WalkHistoryDetails, type WalkHistoryNavigation } from './WalkHistoryDetails';
import {
  WALK_HISTORY_FILTERS,
  walkHistoryDate,
  walkHistoryLabel,
  walkHistoryPage,
  walkHistorySummary,
  walkHistoryTime,
  type WalkHistoryFilter,
} from './WalkHistoryPresentation';
import { useWalkCaptureQuery } from './useWalkCaptureQuery';
import { formatActualDuration } from './walkPresentation';

interface Props extends WalkHistoryNavigation {
  readonly initialFilter?: WalkHistoryFilter;
  readonly closeLabel?: string;
  readonly getWalkHistory: Pick<GetWalkHistory, 'execute'>;
  readonly getWalkHistoryDetail: Pick<GetWalkHistoryDetail, 'execute'>;
  readonly onClose: () => void;
  readonly onStart: () => void;
}

export function WalkHistoryScreen(props: Props) {
  const [filter, setFilter] = useState<WalkHistoryFilter>(props.initialFilter ?? 'all');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<EntityId | null>(null);
  const [restoreFocusId, setRestoreFocusId] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (selected === null) {
      heading.current?.focus({ preventScroll: true });
      heading.current?.closest('[data-walk-focus-stage]')?.scrollIntoView({ block: 'start' });
    }
  }, [selected]);
  if (selected !== null)
    return (
      <HistoryDetailQuery
        key={selected.toString()}
        {...props}
        id={selected}
        onBack={() => setSelected(null)}
      />
    );
  return (
    <section className="walk-history" aria-labelledby="walk-history-title" data-walk-focus-stage>
      <button type="button" className="secondary-button walk-history-back" onClick={props.onClose}>
        {props.closeLabel ?? '← К прогулкам'}
      </button>
      <header className="walk-history-heading">
        <p className="section-page-eyebrow">Прогулки · Журнал</p>
        <h1 ref={heading} tabIndex={-1} id="walk-history-title">
          История прогулок
        </h1>
        <p className="walk-history-muted">Завершённые прогулки, состояние и сохранённые мысли.</p>
      </header>
      <div className="walk-history-filters" role="group" aria-label="Режим прогулки">
        {WALK_HISTORY_FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="secondary-button"
            aria-pressed={filter === option.value}
            onClick={() => {
              setFilter(option.value);
              setPage(0);
              setRestoreFocusId(null);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
      <HistoryListQuery
        key={filter}
        query={props.getWalkHistory}
        filter={filter}
        page={page}
        restoreFocusId={restoreFocusId}
        onPageChange={setPage}
        onStart={props.onStart}
        onResetFilter={() => {
          setFilter('all');
          setPage(0);
        }}
        onOpen={(id) => {
          setRestoreFocusId(id.toString());
          setSelected(id);
        }}
      />
    </section>
  );
}

interface ListProps {
  readonly walks: readonly Walk[];
  readonly filter: WalkHistoryFilter;
  readonly page: number;
  readonly restoreFocusId: string | null;
  readonly onPageChange: (page: number) => void;
  readonly onOpen: (id: EntityId) => void;
  readonly onStart: () => void;
  readonly onResetFilter: () => void;
}

export function WalkHistoryList(props: ListProps) {
  const focusRow = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    focusRow.current?.focus();
    focusRow.current?.scrollIntoView({ block: 'nearest' });
  }, []);
  const current = walkHistoryPage(props.walks, props.page);
  if (props.walks.length === 0)
    return (
      <div className="walk-history-empty">
        <p>
          {props.filter === 'all'
            ? 'Здесь появятся завершённые прогулки.'
            : 'Нет завершённых прогулок этого режима.'}
        </p>
        <button
          type="button"
          className={props.filter === 'all' ? 'primary-button' : 'secondary-button'}
          onClick={props.filter === 'all' ? props.onStart : props.onResetFilter}
        >
          {props.filter === 'all' ? 'Начать прогулку' : 'Показать все'}
        </button>
      </div>
    );
  return (
    <>
      <div className="walk-history-columns" aria-hidden="true">
        <span>Режим</span>
        <span>Начало</span>
        <span>Длительность</span>
        <span>Результат</span>
        <span />
      </div>
      <ol className="walk-history-list" aria-label="Завершённые прогулки" start={current.start + 1}>
        {current.items.map((walk) => (
          <li key={walk.id.toString()}>
            <button
              type="button"
              data-walk-history-row={walk.id.toString()}
              ref={props.restoreFocusId === walk.id.toString() ? focusRow : undefined}
              onClick={() => props.onOpen(walk.id)}
            >
              <strong className="walk-history-mode">{walkHistoryLabel(walk)}</strong>
              {walk.startedAt === null ? (
                <span>Не отмечено</span>
              ) : (
                <time dateTime={walk.startedAt.toISOString()}>
                  <span>{walkHistoryDate(walk.startedAt)}</span>
                  <span>{walkHistoryTime(walk.startedAt)}</span>
                </time>
              )}
              <span className="walk-history-duration">
                {formatActualDuration(walk.actualDurationMilliseconds)}
              </span>
              <span className="walk-history-summary">{walkHistorySummary(walk)}</span>
              <span className="walk-history-arrow" aria-hidden="true">
                →
              </span>
              <span className="visually-hidden">Открыть прогулку</span>
            </button>
          </li>
        ))}
      </ol>
      <nav className="walk-history-pagination" aria-label="Страницы истории прогулок">
        <span role="status">
          {current.start + 1}–{current.start + current.items.length} из {props.walks.length}
        </span>
        {current.pages > 1 ? (
          <div>
            <button
              type="button"
              className="secondary-button"
              disabled={current.page === 0}
              onClick={() => props.onPageChange(current.page - 1)}
            >
              Предыдущие
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={current.page === current.pages - 1}
              onClick={() => props.onPageChange(current.page + 1)}
            >
              Следующие
            </button>
          </div>
        ) : null}
      </nav>
    </>
  );
}

function HistoryListQuery(
  props: Omit<ListProps, 'walks'> & { readonly query: Pick<GetWalkHistory, 'execute'> },
) {
  const load = useCallback(
    () => props.query.execute(props.filter === 'all' ? undefined : props.filter),
    [props.query, props.filter],
  );
  // Keyed by filter; a changed selection starts with loading, never the previous query's rows.
  const { state, reload } = useWalkCaptureQuery(load);
  if (state.status === 'loading') return <p role="status">Загружаем историю…</p>;
  if (state.status === 'error') return <HistoryReadError onRetry={reload} />;
  return <WalkHistoryList {...props} walks={state.value} />;
}

function HistoryDetailQuery(props: Props & { readonly id: EntityId; readonly onBack: () => void }) {
  const load = useCallback(
    () => props.getWalkHistoryDetail.execute(props.id),
    [props.getWalkHistoryDetail, props.id],
  );
  const { state, reload } = useWalkCaptureQuery(load);
  if (state.status === 'ready' && state.value !== null)
    return (
      <WalkHistoryDetails
        detail={state.value}
        onBack={props.onBack}
        onOpenDecision={props.onOpenDecision}
        onOpenRoutine={props.onOpenRoutine}
      />
    );
  return (
    <section className="walk-history">
      <button type="button" className="secondary-button" onClick={props.onBack}>
        ← История прогулок
      </button>
      {state.status === 'loading' ? (
        <p role="status">Загружаем прогулку…</p>
      ) : state.status === 'error' ? (
        <HistoryReadError onRetry={reload} />
      ) : (
        <p role="status">Прогулка недоступна или ещё не завершена.</p>
      )}
    </section>
  );
}

function HistoryReadError({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <div role="alert" className="walk-history-error">
      <p>Не удалось загрузить историю. Сохранённые данные не изменены.</p>
      <button type="button" className="secondary-button" onClick={onRetry}>
        Повторить
      </button>
    </div>
  );
}
