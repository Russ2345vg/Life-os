import { useState } from 'react';
import type { DayDate } from '../../../domain';
import type { MemoryEventSummary } from '../../../domain/memory';
import type { MemoryServices } from '../../../application/memory/MemoryServices';
import { MemoryPhotoPreview } from './MemoryPhotoPreview';
import { MEMORY_LABELS, memoryDate } from './memoryPresentation';

function yearsAgoLabel(years: number): string {
  const lastTwo = years % 100;
  const lastOne = years % 10;
  const word =
    lastTwo >= 11 && lastTwo <= 14
      ? 'лет'
      : lastOne === 1
        ? 'год'
        : lastOne >= 2 && lastOne <= 4
          ? 'года'
          : 'лет';
  return `${years} ${word} назад`;
}

export function MemoryOnThisDay({
  today,
  items,
  loading,
  error,
  queries,
  onRetry,
  onOpen,
}: {
  readonly today: DayDate;
  readonly items: readonly MemoryEventSummary[] | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly queries: MemoryServices['queries'];
  readonly onRetry: () => void;
  readonly onOpen: (event: MemoryEventSummary) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items?.slice(0, 3);
  const year = Number(today.toString().slice(0, 4));
  return (
    <section className="memory-on-this-day" aria-labelledby="memory-on-this-day-title">
      <div className="memory-on-this-day-head">
        <div>
          <p className="planner-eyebrow">Из прошлых лет</p>
          <h2 id="memory-on-this-day-title">В этот день</h2>
        </div>
        <span className="memory-meta">
          {memoryDate(today.toString(), { day: 'numeric', month: 'long' })}
        </span>
      </div>
      {loading ? (
        <p className="planner-muted" role="status">
          Ищем воспоминания этой даты…
        </p>
      ) : error ? (
        <div className="planner-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={onRetry}>
            Повторить
          </button>
        </div>
      ) : !visible?.length ? (
        <p className="planner-muted">Пока нет воспоминаний об этой дате из прошлых лет.</p>
      ) : (
        <>
          <div className="memory-on-this-day-grid">
            {visible.map((event) => (
              <article className="memory-surface" key={event.id.toString()}>
                {event.hasPhoto && (
                  <MemoryPhotoPreview
                    id={event.id.toString()}
                    revision={event.version}
                    queries={queries}
                  />
                )}
                <div className="memory-card-content">
                  <span className="memory-meta">
                    {event.occurredOn.toString().slice(0, 4)} ·{' '}
                    {yearsAgoLabel(year - Number(event.occurredOn.toString().slice(0, 4)))} ·{' '}
                    {MEMORY_LABELS[event.kind]}
                  </span>
                  <h3>
                    <button type="button" onClick={() => onOpen(event)}>
                      {event.title}
                    </button>
                  </h3>
                  {event.body && <p className="memory-excerpt">{event.body}</p>}
                </div>
              </article>
            ))}
          </div>
          {!expanded && items && items.length > visible.length && (
            <button
              className="memory-on-this-day-more"
              type="button"
              onClick={() => setExpanded(true)}
            >
              Показать все ({items.length})
            </button>
          )}
        </>
      )}
    </section>
  );
}
