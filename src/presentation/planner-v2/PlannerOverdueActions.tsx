import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { LifeAction } from '../../domain';
import './planner-overdue.css';

export function PlannerOverdueActions({
  actions,
  today,
  busy,
  onReschedule,
  onListResolved,
  renderAction,
  title = 'Осталось с прошлых дней',
  headingId = 'planner-overdue-title',
  description = 'Выберите новую дату. Черновик можно оставить без даты.',
  todayLabel = 'На сегодня',
}: {
  readonly actions: readonly LifeAction[];
  readonly today: string;
  readonly busy: boolean;
  readonly onReschedule: (id: string, date: string) => Promise<void>;
  readonly onListResolved: () => void;
  readonly renderAction: (action: LifeAction, controls: ReactNode) => ReactNode;
  readonly title?: string;
  readonly headingId?: string;
  readonly description?: string;
  readonly todayLabel?: string;
}) {
  const section = useRef<HTMLElement>(null);
  const focusAfterSave = useRef<{ id: string; index: number } | null>(null);
  useEffect(() => {
    const target = focusAfterSave.current;
    if (!target || actions.some((action) => action.id.toString() === target.id)) return;
    focusAfterSave.current = null;
    if (actions.length) {
      const buttons = section.current?.querySelectorAll<HTMLButtonElement>('.planner-action-open');
      buttons?.[Math.min(target.index, actions.length - 1)]?.focus();
    } else onListResolved();
  }, [actions, onListResolved]);
  const reschedule = async (id: string, date: string) => {
    focusAfterSave.current = {
      id,
      index: actions.findIndex((action) => action.id.toString() === id),
    };
    try {
      await onReschedule(id, date);
    } catch (reason: unknown) {
      focusAfterSave.current = null;
      throw reason;
    }
  };
  if (!actions.length) return null;
  return (
    <section ref={section} className="planner-overdue" aria-labelledby={headingId}>
      <h2 id={headingId}>
        {title} <span>{actions.length}</span>
      </h2>
      <p className="planner-muted">{description}</p>
      <ul>
        {actions.map((action) =>
          renderAction(
            action,
            <OverduePlanControls
              key={action.id.toString()}
              action={action}
              today={today}
              busy={busy}
              todayLabel={todayLabel}
              onReschedule={reschedule}
            />,
          ),
        )}
      </ul>
    </section>
  );
}

function OverduePlanControls({
  action,
  today,
  busy,
  onReschedule,
  todayLabel,
}: {
  readonly action: LifeAction;
  readonly today: string;
  readonly busy: boolean;
  readonly onReschedule: (id: string, date: string) => Promise<void>;
  readonly todayLabel: string;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const working = useRef(false);
  const [choosing, setChoosing] = useState(false);
  const [date, setDate] = useState(today);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (choosing) input.current?.focus();
  }, [choosing]);
  const disabled = busy || pending;
  const save = async (nextDate: string) => {
    if (working.current || busy) return;
    working.current = true;
    setPending(true);
    setError(null);
    try {
      await onReschedule(action.id.toString(), nextDate);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : 'Не удалось сохранить. Попробуйте ещё раз.',
      );
    } finally {
      working.current = false;
      setPending(false);
    }
  };
  const cancel = () => {
    setChoosing(false);
    trigger.current?.focus();
  };
  const previousDate = action.plannedDate?.toString();
  return (
    <div className="planner-overdue-controls">
      <p className="planner-muted">
        {action.rescheduleCount >= 2 ? (
          <span>Зафиксировано переносов: {action.rescheduleCount}. </span>
        ) : null}
        Было запланировано:{' '}
        <time dateTime={previousDate}>
          {previousDate &&
            new Intl.DateTimeFormat('ru-RU', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            }).format(new Date(`${previousDate}T12:00:00`))}
        </time>
      </p>
      {action.status === 'in_progress' ? (
        <p className="planner-muted">
          Действие уже выполняется. Для продолжения откройте карточку.
        </p>
      ) : (
        <>
          <div className="planner-inline-actions">
            <button type="button" disabled={disabled} onClick={() => void save(today)}>
              {todayLabel}
            </button>
            <button
              ref={trigger}
              type="button"
              disabled={disabled}
              aria-expanded={choosing}
              aria-controls={`${inputId}-form`}
              onClick={() => setChoosing((value) => !value)}
            >
              Выбрать дату
            </button>
            {action.status === 'draft' && (
              <button type="button" disabled={disabled} onClick={() => void save('')}>
                Убрать из плана
              </button>
            )}
          </div>
          {action.status === 'ready' && (
            <p className="planner-muted">У подготовленного действия должна оставаться дата.</p>
          )}
          {choosing && (
            <form
              id={`${inputId}-form`}
              onSubmit={(event) => {
                event.preventDefault();
                if (date && date >= today) void save(date);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && !disabled) {
                  event.preventDefault();
                  event.stopPropagation();
                  cancel();
                }
              }}
            >
              <label htmlFor={inputId}>Новая дата</label>
              <input
                ref={input}
                id={inputId}
                type="date"
                aria-label={`Новая дата: ${action.title.toString()}`}
                min={today}
                value={date}
                disabled={disabled}
                required
                onChange={(event) => setDate(event.target.value)}
              />
              <div className="planner-inline-actions">
                <button type="submit" disabled={disabled || !date || date < today}>
                  Сохранить дату
                </button>
                <button type="button" disabled={disabled} onClick={cancel}>
                  Отмена
                </button>
              </div>
            </form>
          )}
          {pending && <p role="status">Сохраняем…</p>}
          {error && (
            <p className="planner-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
