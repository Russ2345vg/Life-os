import type { FocusHistory } from '../../../application/queries/GetFocusHistory';

function duration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes ? `${minutes} мин` : ''}${minutes && seconds % 60 ? ' ' : ''}${seconds % 60 || !minutes ? `${seconds % 60} с` : ''}`;
}
const status = {
  running: 'В работе',
  paused: 'На паузе',
  completed: 'Завершён',
  interrupted: 'Завершён раньше',
};
export function FocusHistoryPanel({
  history,
  selectedDay,
  onOpenAction,
}: {
  readonly history: FocusHistory;
  readonly selectedDay: string | null;
  readonly onOpenAction: (id: string) => void;
}) {
  const displayed = selectedDay ? history.days.find((day) => day.date === selectedDay) : history;
  const rows = displayed?.rows ?? [];
  return (
    <section className="analytics-focus-history" aria-label="История фокусов">
      <h3>
        История фокусов <span>{duration(displayed?.totalMilliseconds ?? 0)}</span>
      </h3>
      <p>Время помодоро без пауз и перерывов. Уже входит в общее рабочее время.</p>
      {rows.length === 0 && (
        <p>
          Фокусов за выбранный период пока нет. История появится после запуска помодоро; прежние
          рабочие сессии остаются в общем времени.
        </p>
      )}
      {rows.map((row) => (
        <div className="analytics-detail-row analytics-focus-history__row" key={row.sessionId}>
          <div>
            <strong>{row.title}</strong>
            <small>
              {new Intl.DateTimeFormat('ru-RU', {
                day: 'numeric',
                month: 'long',
                hour: '2-digit',
                minute: '2-digit',
              }).format(new Date(row.startedAt))}{' '}
              · {status[row.status]}
            </small>
          </div>
          <span>{duration(row.milliseconds)}</span>
          {row.available && (
            <button
              type="button"
              className="analytics-link"
              onClick={() => onOpenAction(row.actionId)}
            >
              Открыть ↗
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
