import type { MemoryEventSummary } from '../../../domain/memory';
import type { MemoryServices } from '../../../application/memory/MemoryServices';
import { AppIcon } from '../../components/AppIcon';
import { MemoryPhotoPreview } from './MemoryPhotoPreview';
import { MEMORY_LABELS, memoryContextLabel, memoryDate } from './memoryPresentation';

export function MemoryTimeline({
  items,
  services,
  busy,
  onOpen,
  onHighlight,
  onAdd,
  filtered,
  deleted,
  onReset,
}: {
  readonly items: readonly MemoryEventSummary[];
  readonly services: MemoryServices;
  readonly busy: boolean;
  readonly onOpen: (event: MemoryEventSummary) => void;
  readonly onHighlight: (event: MemoryEventSummary) => void;
  readonly onAdd: () => void;
  readonly filtered: boolean;
  readonly deleted: boolean;
  readonly onReset: () => void;
}) {
  const months = [...new Set(items.map((event) => event.occurredOn.toString().slice(0, 7)))];
  if (!items.length)
    return (
      <div className="memory-empty">
        <h2>
          {deleted
            ? 'Нет удалённых воспоминаний'
            : filtered
              ? 'Ничего не найдено'
              : 'Пока нет воспоминаний'}
        </h2>
        <p>
          {filtered
            ? 'Попробуй изменить поиск или фильтры.'
            : deleted
              ? 'Удалённые события можно будет восстановить здесь.'
              : 'Сохрани событие, которое хочется помнить.'}
        </p>
        {filtered ? (
          <button type="button" onClick={onReset}>
            Сбросить фильтры
          </button>
        ) : (
          !deleted && (
            <button
              className="planner-primary"
              type="button"
              disabled={!services.commands.enabled}
              onClick={onAdd}
            >
              Добавить воспоминание
            </button>
          )
        )}
      </div>
    );
  return (
    <div className="memory-layout">
      <div>
        {months.map((month) => (
          <section key={month} id={`memory-month-${month}`} className="memory-month-section">
            <div className="memory-month">
              <h2>{memoryDate(`${month}-01`, { month: 'long' })}</h2>
              <span className="memory-meta">
                Событий:{' '}
                {items.filter((event) => event.occurredOn.toString().startsWith(month)).length}
              </span>
            </div>
            {items
              .filter((event) => event.occurredOn.toString().startsWith(month))
              .map((event) => (
                <article className="memory-card" key={event.id.toString()}>
                  <time className="memory-date" dateTime={event.occurredOn.toString()}>
                    <strong>{Number(event.occurredOn.toString().slice(8))}</strong>
                    {memoryDate(event.occurredOn.toString(), { month: 'short' })}
                  </time>
                  <div className="memory-surface">
                    {event.hasPhoto && (
                      <MemoryPhotoPreview
                        id={event.id.toString()}
                        revision={event.version}
                        queries={services.queries}
                      />
                    )}
                    <div className="memory-card-content">
                      <div className="memory-card-heading">
                        <button
                          className="memory-title-button"
                          type="button"
                          onClick={() => onOpen(event)}
                        >
                          {event.title}
                        </button>
                        {!deleted && (
                          <button
                            className="memory-star"
                            type="button"
                            aria-label={
                              event.isHighlight ? 'Убрать из главных' : 'Отметить главным'
                            }
                            aria-pressed={event.isHighlight}
                            disabled={busy || !services.commands.enabled}
                            onClick={() => onHighlight(event)}
                          >
                            <AppIcon name="focus" />
                          </button>
                        )}
                      </div>
                      {event.body && <p className="memory-excerpt">{event.body}</p>}
                      <div className="memory-meta">
                        <span>{MEMORY_LABELS[event.kind]}</span>
                        {event.context && <span>{memoryContextLabel(event.context)}</span>}
                        {event.diarySource && <span>Из дневника</span>}
                        {deleted && <span>Удалено · можно восстановить</span>}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
          </section>
        ))}
      </div>
      <aside className="memory-months" aria-label="Месяцы года">
        <h2>По месяцам</h2>
        {months.map((month) => (
          <a
            key={month}
            href={`#memory-month-${month}`}
            onClick={(event) => {
              event.preventDefault();
              document.getElementById(`memory-month-${month}`)?.scrollIntoView({ block: 'start' });
            }}
          >
            {memoryDate(`${month}-01`, { month: 'long' })}
          </a>
        ))}
        <p className="planner-muted">
          Связи со сферами, направлениями и дневником остаются рядом с событием.
        </p>
      </aside>
    </div>
  );
}
