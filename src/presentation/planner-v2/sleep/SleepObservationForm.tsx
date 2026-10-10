import { useState, type FormEvent } from 'react';
import type { SleepObservation } from '../../../domain/sleep/SleepObservation';
import { observationWindowFromTimes } from './sleepObservationFormModel';
import './sleep-observations.css';

export function SleepObservationForm({
  cycleDate,
  timeZone,
  plannedWentToBedAt,
  observation,
  busy,
  error,
  saved,
  onSave,
  wakeDate,
  latestWakeDate,
  onWakeDateChange,
  onDirtyChange,
}: {
  readonly cycleDate: string;
  readonly timeZone: string;
  readonly plannedWentToBedAt: Date | null;
  readonly observation: SleepObservation | null;
  readonly busy: boolean;
  readonly error: string | null;
  readonly saved: boolean;
  readonly onSave: (input: { readonly wentToBedAt: Date; readonly wokeAt: Date }) => Promise<void>;
  readonly wakeDate?: string;
  readonly latestWakeDate?: string;
  readonly onWakeDateChange?: (value: string) => void;
  readonly onDirtyChange?: (dirty: boolean) => void;
}) {
  const suggestedBedtime = formatLocalTime(
    observation?.wentToBedAt ?? plannedWentToBedAt,
    timeZone,
  );
  const suggestedWake = formatLocalTime(observation?.wokeAt ?? null, timeZone);
  const [wentToBed, setWentToBed] = useState(suggestedBedtime);
  const [wokeAt, setWokeAt] = useState(suggestedWake);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    try {
      const window = observationWindowFromTimes(cycleDate, wentToBed, wokeAt, timeZone);
      if (window.wokeAt.getTime() > Date.now())
        throw new TypeError('Время подъёма ещё не наступило. Проверьте дату и время.');
      setLocalError(null);
      void onSave(window);
    } catch (reason: unknown) {
      setLocalError(messageOf(reason));
    }
  };

  return (
    <section
      id="sleep-recording"
      className="sleep-observation-card"
      aria-labelledby="sleep-observation-title"
    >
      <div className="sleep-observation-card__intro">
        <div>
          <p className="planner-eyebrow">Ночь {formatCycleDate(cycleDate)}</p>
          <h2 id="sleep-observation-title">Записать сон</h2>
        </div>
        <span className="sleep-observation-card__status">
          {observation?.confirmedAt ? 'Ночь записана' : 'Запись ночи'}
        </span>
      </div>
      <p className="sleep-observation-card__lead">
        Укажите фактическое время — после сохранения ночь появится на графике.
      </p>
      <form className="sleep-observation-form" onSubmit={submit}>
        {wakeDate !== undefined && onWakeDateChange ? (
          <label className="sleep-observation-form__date">
            <span id="sleep-recording-date-label">Дата подъёма</span>
            <input
              name="wakeDate"
              aria-labelledby="sleep-recording-date-label"
              aria-describedby="sleep-recording-date-help"
              type="date"
              value={wakeDate}
              max={latestWakeDate}
              required
              disabled={busy}
              onChange={(event) => onWakeDateChange(event.currentTarget.value)}
            />
            <small id="sleep-recording-date-help">
              Выберите другую дату, если пропустили ночь.
            </small>
          </label>
        ) : null}
        <label>
          <span>Во сколько лёг?</span>
          <input
            name="wentToBed"
            type="time"
            value={wentToBed}
            required
            disabled={busy}
            onChange={(event) => {
              setWentToBed(event.currentTarget.value);
              onDirtyChange?.(true);
            }}
          />
          <small>Плановое время — только подсказка.</small>
        </label>
        <label>
          <span>Во сколько встал?</span>
          <input
            name="wokeAt"
            type="time"
            value={wokeAt}
            required
            disabled={busy}
            onChange={(event) => {
              setWokeAt(event.currentTarget.value);
              onDirtyChange?.(true);
            }}
          />
          <small>{wakeSourceLabel(observation)}</small>
        </label>
        <div className="sleep-observation-form__footer">
          <div aria-live="polite">
            {saved ? <p className="sleep-observation-form__success">Ночь сохранена</p> : null}
            {localError || error ? (
              <p className="planner-error" role="alert">
                {localError ?? error}
              </p>
            ) : null}
          </div>
          <button className="planner-primary" type="submit" disabled={busy}>
            {busy ? 'Сохраняем…' : 'Сохранить ночь'}
          </button>
        </div>
      </form>
    </section>
  );
}

function wakeSourceLabel(observation: SleepObservation | null): string {
  if (observation?.wakeSource === 'ALARM_QR')
    return 'Подъём предложен по отключению будильника через QR.';
  if (observation?.wakeSource === 'ALARM_EMERGENCY')
    return 'Подъём предложен по аварийному отключению будильника.';
  if (observation?.wokeAt !== null && observation?.wokeAt !== undefined)
    return 'Сохранённое время можно исправить.';
  return 'Введите время подъёма вручную.';
}

function formatLocalTime(value: Date | null, timeZone: string): string {
  if (value === null) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const hour = parts.find(({ type }) => type === 'hour')?.value;
  const minute = parts.find(({ type }) => type === 'minute')?.value;
  return hour && minute ? `${hour}:${minute}` : '';
}

function formatCycleDate(cycleDate: string): string {
  const date = new Date(`${cycleDate}T12:00:00.000Z`);
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(date);
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Не удалось проверить время.';
}
