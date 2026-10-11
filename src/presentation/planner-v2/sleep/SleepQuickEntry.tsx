import type { SleepObservation } from '../../../domain/sleep/SleepObservation';
import type { SleepPageMode } from './sleepPageMode';

export function SleepQuickEntry({
  mode,
  cycleDate,
  observation,
  busy,
  dirty,
  error,
  saved,
  onMark,
  onEdit,
}: {
  readonly mode: SleepPageMode;
  readonly cycleDate: string;
  readonly observation: SleepObservation | null;
  readonly busy: boolean;
  readonly dirty: boolean;
  readonly error: string | null;
  readonly saved: boolean;
  readonly onMark: () => Promise<void>;
  readonly onEdit?: () => void;
}) {
  const marked =
    (observation?.confirmedAt !== null && observation?.confirmedAt !== undefined) ||
    (mode === 'EVENING' ? observation?.wentToBedAt != null : observation?.wakeSource === 'MANUAL');
  return (
    <section className="sleep-quick-entry" aria-label="Быстрая отметка сна">
      <div>
        <p>
          Ночь{' '}
          <time dateTime={cycleDate}>
            {new Intl.DateTimeFormat('ru', {
              day: 'numeric',
              month: 'long',
              timeZone: 'UTC',
            }).format(new Date(`${cycleDate}T12:00:00Z`))}
          </time>
        </p>
        <small>
          {dirty
            ? 'Сохраните введённые изменения в форме записи ночи.'
            : 'Отметка сохраняет черновик. Проверьте время и сохраните ночь.'}
        </small>
        {marked ? <p>Время уже записано — его можно изменить в форме.</p> : null}
        {saved ? <p role="status">Время сохранено. Проверьте и сохраните ночь.</p> : null}
        {error ? (
          <p className="planner-error" role="alert">
            {error}{' '}
            <button type="button" onClick={onEdit}>
              Исправить время
            </button>
          </p>
        ) : null}
      </div>
      <button
        type="button"
        className="planner-button"
        disabled={busy || dirty || marked}
        onClick={() => void onMark()}
      >
        {busy ? 'Сохраняем…' : mode === 'EVENING' ? 'Ложусь' : 'Я проснулся'}
      </button>
    </section>
  );
}
