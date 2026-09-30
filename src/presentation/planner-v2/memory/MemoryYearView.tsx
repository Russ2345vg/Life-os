import type { MemoryYearOverview } from '../../../application/memory/MemoryQueries';
import type { MemoryEventSummary } from '../../../domain/memory';
import { MEMORY_LABELS, memoryContextLabel, memoryDate } from './memoryPresentation';

export function MemoryYearView({
  overview,
  onOpen,
}: {
  readonly overview: MemoryYearOverview;
  readonly onOpen: (event: MemoryEventSummary) => void;
}) {
  const cards = (items: readonly MemoryEventSummary[]) =>
    items.map((event) => (
      <article key={event.id.toString()} className="memory-surface">
        <span className="memory-meta">
          {memoryDate(event.occurredOn.toString())} · {MEMORY_LABELS[event.kind]}
        </span>
        <h3>{event.title}</h3>
        <p className="memory-excerpt">{event.body}</p>
        {event.context && <p className="memory-meta">{memoryContextLabel(event.context)}</p>}
        <button type="button" onClick={() => onOpen(event)}>
          Открыть воспоминание
        </button>
      </article>
    ));
  return (
    <section className="memory-year" aria-label="Мой год">
      <div className="memory-year-head">
        <h2>Главные моменты {overview.year}</h2>
        <span className="planner-muted">Твоя история складывается весь год</span>
      </div>
      <p className="memory-meta">Воспоминаний за год: {overview.uniqueEventCount}</p>
      {overview.uniqueEventCount === 0 ? (
        <div className="memory-empty">
          <h3>Пока нет воспоминаний за этот год</h3>
          <p>Сохрани событие, которое хочется помнить.</p>
        </div>
      ) : (
        <>
          <div className="memory-year-grid">
            {overview.highlights.length ? (
              cards(overview.highlights)
            ) : (
              <p className="planner-muted">
                Отметь важное событие как главное, чтобы выделить его здесь.
              </p>
            )}
          </div>
          <h2>Достижения</h2>
          <div className="memory-year-grid">
            {overview.achievements.length ? (
              cards(overview.achievements)
            ) : (
              <p className="planner-muted">Пока нет событий с типом «Достижение».</p>
            )}
          </div>
          <h2>История по месяцам</h2>
          {overview.months.map((month) => (
            <section key={month.month}>
              <h3>
                {memoryDate(
                  `${String(overview.year).padStart(4, '0')}-${String(month.month).padStart(2, '0')}-01`,
                  { month: 'long' },
                )}
              </h3>
              <div className="memory-year-grid">{cards(month.events)}</div>
            </section>
          ))}
        </>
      )}
    </section>
  );
}
