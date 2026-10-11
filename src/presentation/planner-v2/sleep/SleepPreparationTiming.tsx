import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { SleepPreparationItem } from '../../../domain/sleep/SleepSchedule';
import {
  calculatePreparationStart,
  resolveStretchingItem,
  validateSleepPreparationTiming,
  type SleepPreparationTiming as Timing,
} from '../../../domain/sleep/SleepPreparationTiming';
import { useQuickAccessGuard } from '../QuickAccessContext';

export function SleepPreparationTiming({
  timing,
  items,
  plannedSleepAt,
  timeZone,
  now,
  completed,
  busy,
  error,
  onSave,
}: {
  readonly timing: Timing;
  readonly items: readonly SleepPreparationItem[];
  readonly plannedSleepAt: Date | null;
  readonly timeZone: string;
  readonly now: Date;
  readonly completed: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onSave: (timing: Timing) => void | Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [total, setTotal] = useState(String(timing.totalPreparationMinutes));
  const [stretch, setStretch] = useState(String(timing.stretchingMinutes));
  const [itemId, setItemId] = useState(timing.stretchingItemId ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const errorId = useId();
  const itemFieldId = useId();
  const dirty =
    open &&
    (total !== String(timing.totalPreparationMinutes) ||
      stretch !== String(timing.stretchingMinutes) ||
      itemId !== (timing.stretchingItemId ?? ''));
  useQuickAccessGuard(() => ({ dirty, busy }));
  useEffect(() => {
    if (open) formRef.current?.querySelector('input')?.focus();
  }, [open]);
  const selected = resolveStretchingItem(timing, items);
  const enabledItems = items.filter((item) => item.enabled);
  const draftMissing = itemId !== '' && !enabledItems.some((item) => item.id === itemId);
  const start = plannedSleepAt
    ? calculatePreparationStart(plannedSleepAt, timing.totalPreparationMinutes)
    : null;
  const displayedError = validationError ?? error;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const value = {
      totalPreparationMinutes: Number(total),
      stretchingItemId: itemId || null,
      stretchingMinutes: Number(stretch),
    };
    try {
      validateSleepPreparationTiming(value);
      if (value.stretchingItemId !== null && !resolveStretchingItem(value, items))
        throw new TypeError('Пункт растяжки недоступен. Выберите включённый пункт.');
    } catch (reason: unknown) {
      setValidationError(reason instanceof Error ? reason.message : 'Проверьте время подготовки.');
      return;
    }
    setValidationError(null);
    const saved = await onSave(value);
    if (saved === true) setOpen(false);
  };
  return (
    <section className="sleep-preparation-timing" aria-label="Время вечерней подготовки">
      <div className="sleep-preparation-timing__summary">
        <div>
          {start && plannedSleepAt ? (
            <>
              <strong>Начало подготовки: {timeLabel(start, timeZone)}</strong>
              <p>
                Отбой: {timeLabel(plannedSleepAt, timeZone)} · Общая подготовка:{' '}
                {timing.totalPreparationMinutes} мин
              </p>
              {!completed && now >= start ? <p role="status">Можно начинать подготовку.</p> : null}
            </>
          ) : (
            <p>Настройте время сна, чтобы увидеть начало подготовки.</p>
          )}
          {timing.stretchingItemId === null ? (
            <p>Таймер растяжки: выберите пункт в настройках времени.</p>
          ) : selected === null ? (
            <p>Пункт растяжки недоступен. Выберите включённый пункт в настройках времени.</p>
          ) : (
            <p>
              Растяжка: {selected.title} · {timing.stretchingMinutes} мин в общем времени
            </p>
          )}
        </div>
      </div>
      <details open={open}>
        <summary
          onClick={(event) => {
            event.preventDefault();
            if (busy) return;
            if (!open) {
              setTotal(String(timing.totalPreparationMinutes));
              setStretch(String(timing.stretchingMinutes));
              setItemId(timing.stretchingItemId ?? '');
              setValidationError(null);
            }
            setOpen((value) => !value);
          }}
          aria-disabled={busy}
        >
          Настроить время
        </summary>
        <form
          ref={formRef}
          aria-label="Настройка времени подготовки"
          onSubmit={(event) => void submit(event)}
        >
          <label>
            Общее время подготовки, включая растяжку
            <input
              type="number"
              min="1"
              max="180"
              step="1"
              required
              value={total}
              disabled={busy}
              aria-invalid={!!displayedError}
              aria-describedby={displayedError ? errorId : undefined}
              onChange={(event) => {
                setTotal(event.currentTarget.value);
                setValidationError(null);
              }}
            />
          </label>
          <div className="sleep-preparation-timing__field">
            <label htmlFor={itemFieldId}>Пункт растяжки</label>
            <select
              id={itemFieldId}
              value={itemId}
              disabled={busy}
              aria-invalid={draftMissing}
              aria-describedby={displayedError ? errorId : undefined}
              onChange={(event) => {
                setItemId(event.currentTarget.value);
                setValidationError(null);
              }}
            >
              <option value="">Выберите пункт</option>
              {draftMissing ? (
                <option value={itemId} disabled>
                  Пункт растяжки недоступен
                </option>
              ) : null}
              {enabledItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </div>
          <label>
            Длительность растяжки, минут
            <input
              type="number"
              min="1"
              max="120"
              step="1"
              required
              value={stretch}
              disabled={busy}
              aria-invalid={!!displayedError}
              aria-describedby={displayedError ? errorId : undefined}
              onChange={(event) => {
                setStretch(event.currentTarget.value);
                setValidationError(null);
              }}
            />
          </label>
          <p className="sleep-preparation-timing__hint">
            Растяжка уже входит в общее время подготовки.
          </p>
          {displayedError ? (
            <p id={errorId} role="alert">
              {displayedError}
            </p>
          ) : null}
          <button type="submit" className="planner-primary" disabled={busy}>
            {busy ? 'Сохраняем…' : 'Сохранить время подготовки'}
          </button>
        </form>
      </details>
    </section>
  );
}

function timeLabel(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(value);
}
