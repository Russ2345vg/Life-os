import { useEffect, useState, type ReactNode } from 'react';
import type { ActionSession, Goal, LifeAction } from '../../domain';
import { addDays } from '../../domain/planner/PlanningPeriod';
import { buildWorkTimeReport } from '../../application/queries/GetWorkTimeReport';
import { buildTimeScheduleDay } from '../../application/queries/GetTimeSchedule';
import { plannerDateLabel } from './plannerViewsModel';
import { clockTime, durationLabel } from './timePresentation';
import type { PlannerRoute } from './PlannerNavigation';
import './planner-work-time.css';

export interface PlannerWorkTimeProps {
  readonly actions: readonly LifeAction[];
  readonly goals: readonly Goal[];
  readonly sessions: readonly ActionSession[] | null;
  readonly weekdays: readonly (number | null)[];
  readonly today: string;
  readonly initialActionId?: string | undefined;
  readonly busy: boolean;
  readonly sessionError?: string | null;
  readonly viewSwitcher?: ReactNode;
  readonly onStart: (actionId: string) => Promise<void>;
  readonly onPause: (id: string, version: number) => Promise<void>;
  readonly onResume: (id: string, version: number) => Promise<void>;
  readonly onFinish: (id: string, version: number) => Promise<void>;
  readonly onRefresh: () => void;
  readonly onNavigate: (route: PlannerRoute) => void;
}
export function PlannerWorkTime({
  actions,
  goals,
  sessions,
  weekdays,
  today,
  initialActionId,
  busy,
  sessionError,
  viewSwitcher,
  onStart,
  onPause,
  onResume,
  onFinish,
  onRefresh,
  onNavigate,
}: PlannerWorkTimeProps) {
  const [, advanceClock] = useState(0);
  const now = new Date();
  const [mode, setMode] = useState<'day' | 'week'>('day');
  const [date, setDate] = useState(today);
  const [filter, setFilter] = useState('all');
  const candidates = actions.filter(
    (action) =>
      !action.isArchived() &&
      !action.isDeleted() &&
      (action.status === 'draft' || action.status === 'ready'),
  );
  const [chosen, setChosen] = useState(initialActionId ?? '');
  const selected = candidates.some((action) => action.id.toString() === chosen)
    ? chosen
    : initialActionId
      ? ''
      : (candidates[0]?.id.toString() ?? '');
  const unfinished = sessions?.filter((session) => !session.isCompleted()) ?? [];
  const ticking = unfinished.some((session) => session.isRunning());
  useEffect(() => {
    if (!ticking) return;
    const timer = window.setInterval(() => advanceClock((tick) => tick + 1), 1000);
    return () => window.clearInterval(timer);
  }, [ticking]);
  const from =
    mode === 'day' ? date : addDays(date, -((new Date(`${date}T12:00:00`).getDay() + 6) % 7));
  const to = mode === 'day' ? date : addDays(from, 6);
  const report =
    sessions === null
      ? null
      : buildWorkTimeReport({ from, to, asOf: now, actions, sessions, weekdays });
  const byId = new Map(actions.map((action) => [action.id.toString(), action]));
  const goalsById = new Map(goals.map((goal) => [goal.id.toString(), goal]));
  const unknownEstimates = new Set(
    report?.days.flatMap((day) =>
      buildTimeScheduleDay(day.date, actions, day.capacityMinutes)
        .untimed.filter((action) => action.estimateMinutes === null)
        .map((action) => action.id.toString()),
    ) ?? [],
  );
  const invoke = (work: () => Promise<void>) => {
    void work().catch(() => {});
  };
  const rows =
    report?.rows.filter((row) =>
      filter === 'worked'
        ? row.sessionCount > 0
        : filter === 'unknown'
          ? unknownEstimates.has(row.actionId)
          : true,
    ) ?? [];
  const move = (amount: number) => setDate(addDays(date, amount * (mode === 'week' ? 7 : 1)));
  const clockIssue = unfinished.some((session) => elapsed(session, now) === null);
  return (
    <section className="planner-work-time">
      <header className="planner-page-heading">
        <h1>Рабочее время</h1>
        <a href="#/v2/actions?view=calendar">В календарь</a>
      </header>
      {viewSwitcher}
      {sessionError && (
        <div className="planner-error" role="alert">
          <p>{sessionError}</p>
          <button type="button" disabled={busy} onClick={onRefresh}>
            Обновить сессии
          </button>
        </div>
      )}
      {sessions === null ? (
        !sessionError && <p role="status">Загружаем рабочие сессии…</p>
      ) : (
        <>
          {unfinished.length > 1 && (
            <p className="planner-work-conflict" role="alert">
              Несколько незавершённых сессий. Закончите лишние сессии, чтобы начать новую работу.
            </p>
          )}
          {clockIssue && (
            <p className="planner-work-conflict" role="alert">
              Проверьте часы устройства: текущее время раньше начала или продолжения работы.
            </p>
          )}
          {unfinished.length ? (
            unfinished.map((session) => {
              const action = byId.get(session.lifeActionId.toString());
              const title = action?.title.toString() ?? 'Действие недоступно';
              const worked = elapsed(session, now);
              const goalId = session.goalIdAtStart?.toString();
              const goal = goalId ? goalsById.get(goalId) : undefined;
              return (
                <section
                  className="planner-work-active"
                  aria-label={`Текущая работа: ${title}`}
                  key={session.id.toString()}
                >
                  <div>
                    <p className="planner-work-eyebrow">
                      {session.isPaused() ? 'На паузе' : 'Работа идёт'}
                    </p>
                    <h2>{title}</h2>
                    <p className="planner-muted">
                      {action?.scheduledStartMinute != null
                        ? `Плановый блок ${clockTime(action.scheduledStartMinute)}–${clockTime(action.scheduledStartMinute + action.scheduledDurationMinutes!)}`
                        : 'Без планового блока'}
                      {' · '}
                      {goal?.title ?? (goalId ? 'Цель недоступна' : 'Без известной цели')}
                    </p>
                    {action && !action.isDeleted() && !action.isArchived() && (
                      <button
                        type="button"
                        className="planner-text-link"
                        onClick={() => onNavigate({ view: 'action', id: action.id.toString() })}
                      >
                        Открыть действие
                      </button>
                    )}
                  </div>
                  <div className="planner-work-clock">
                    <strong aria-label="Отработано в сессии">
                      {worked === null ? '—' : timerLabel(worked)}
                    </strong>
                    <span>без пауз</span>
                  </div>
                  <div className="planner-work-controls">
                    <button
                      type="button"
                      disabled={busy || worked === null}
                      onClick={() =>
                        invoke(() =>
                          session.isPaused()
                            ? onResume(session.id.toString(), session.version)
                            : onPause(session.id.toString(), session.version),
                        )
                      }
                    >
                      {session.isPaused() ? 'Продолжить' : 'Пауза'}
                    </button>
                    <button
                      type="button"
                      className="planner-primary"
                      disabled={busy}
                      onClick={() => invoke(() => onFinish(session.id.toString(), session.version))}
                    >
                      Закончить работу
                    </button>
                  </div>
                </section>
              );
            })
          ) : (
            <section className="planner-work-active" aria-label="Начало работы">
              <div>
                <p className="planner-work-eyebrow">Готовы начать</p>
                <h2>Одно действие за раз</h2>
                {candidates.length ? (
                  <label>
                    Действие для работы
                    <select
                      value={selected}
                      disabled={busy || Boolean(sessionError)}
                      onChange={(event) => setChosen(event.target.value)}
                    >
                      <option value="">Выберите действие</option>
                      {candidates.map((action) => (
                        <option key={action.id.toString()} value={action.id.toString()}>
                          {action.title.toString()}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="planner-muted">
                    Нет открытых действий. <a href="#/v2/actions">Открыть список действий</a>
                  </p>
                )}
                {initialActionId &&
                  !candidates.some((action) => action.id.toString() === initialActionId) && (
                    <p className="planner-muted">
                      Выбранное действие недоступно для работы. Выберите другое.
                    </p>
                  )}
              </div>
              <div className="planner-work-controls">
                <button
                  type="button"
                  className="planner-primary"
                  disabled={!selected || busy || Boolean(sessionError)}
                  onClick={() => invoke(() => onStart(selected))}
                >
                  Начать работу
                </button>
              </div>
            </section>
          )}
          <p className="planner-muted">
            Окончание работы сохраняет часы. Само действие остаётся открытым до отметки выполнения.
          </p>
          {report && (
            <>
              <div className="planner-work-report-heading">
                <h2>План и факт</h2>
                <div className="planner-work-modes" aria-label="Период отчёта">
                  {(['day', 'week'] as const).map((value) => (
                    <button
                      type="button"
                      key={value}
                      aria-pressed={mode === value}
                      onClick={() => setMode(value)}
                    >
                      {value === 'day' ? 'День' : 'Неделя'}
                    </button>
                  ))}
                </div>
                <strong>
                  {mode === 'day'
                    ? plannerDateLabel(date, { weekday: 'long', day: 'numeric', month: 'long' })
                    : `${plannerDateLabel(from)} — ${plannerDateLabel(to)}`}
                </strong>
              </div>
              <div className="planner-work-period">
                <button type="button" aria-label="Предыдущий период" onClick={() => move(-1)}>
                  ‹
                </button>
                <label>
                  Дата отчёта
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => {
                      if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value))
                        setDate(event.target.value);
                    }}
                  />
                </label>
                <button type="button" onClick={() => setDate(today)}>
                  Сегодня
                </button>
                <button type="button" aria-label="Следующий период" onClick={() => move(1)}>
                  ›
                </button>
              </div>
              <section className="planner-work-summary" aria-label="Итоги периода">
                <div>
                  <span>Запланировано</span>
                  <strong>{durationLabel(report.plannedMinutes)}</strong>
                  <p>Блоки и оценки дел без времени</p>
                </div>
                <div>
                  <span>Отработано</span>
                  <strong>{durationLabel(Math.floor(report.actualMilliseconds / 60000))}</strong>
                  <p>Рабочие сессии, паузы исключены</p>
                </div>
                <div>
                  <span>Выполнено</span>
                  <strong>{report.completedActionCount}</strong>
                  <p>Без оценки: {report.unknownEstimateCount}</p>
                </div>
              </section>
              <p className="planner-muted">
                {report.capacityMinutes === null
                  ? 'Доступное время не задано для всего периода'
                  : `Доступное время: ${durationLabel(report.capacityMinutes)}`}
              </p>
              <label className="planner-work-filter">
                Показать действия
                <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                  <option value="all">Все действия</option>
                  <option value="worked">С рабочими сессиями</option>
                  <option value="unknown">Без оценки</option>
                </select>
              </label>
              {rows.length ? (
                <table className="planner-work-details" aria-label="Время по действиям">
                  <thead>
                    <tr>
                      <th scope="col">Действие</th>
                      <th scope="col">План</th>
                      <th scope="col">Факт</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const action = byId.get(row.actionId);
                      const reachable = action && !action.isDeleted() && !action.isArchived();
                      return (
                        <tr key={row.actionId}>
                          <th scope="row">
                            {reachable ? (
                              <button
                                type="button"
                                className="planner-text-link"
                                onClick={() => onNavigate({ view: 'action', id: row.actionId })}
                              >
                                {row.title}
                              </button>
                            ) : (
                              <strong>{row.title}</strong>
                            )}
                            <span className="planner-muted">
                              Сессий: {row.sessionCount}
                              {row.completed ? ' · выполнено' : ''}
                              {unfinished.some(
                                (session) => session.lifeActionId.toString() === row.actionId,
                              )
                                ? ' · работа не закончена'
                                : ''}
                            </span>
                          </th>
                          <td>
                            {row.plannedMinutes === null ? (
                              <span className="planner-muted">
                                {unknownEstimates.has(row.actionId)
                                  ? 'нет оценки'
                                  : 'не запланировано'}
                              </span>
                            ) : (
                              durationLabel(row.plannedMinutes)
                            )}
                          </td>
                          <td>{durationLabel(Math.floor(row.actualMilliseconds / 60000))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="planner-empty">
                  {report.rows.length
                    ? 'Нет действий с выбранным фильтром.'
                    : 'За этот период пока нет плана и рабочих сессий.'}
                </p>
              )}
              {report.goals.length > 0 && (
                <details className="planner-work-goals">
                  <summary>Время по целям</summary>
                  <ul>
                    {report.goals.map((goal) => (
                      <li key={goal.goalId ?? 'unattributed'}>
                        <span>
                          {goal.goalId
                            ? (goalsById.get(goal.goalId)?.title ?? 'Цель недоступна')
                            : 'Без известной цели'}
                        </span>
                        <span>
                          План: {durationLabel(goal.plannedMinutes)} · факт:{' '}
                          {durationLabel(Math.floor(goal.actualMilliseconds / 60000))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <p className="planner-muted">
                Время прошлых сессий остаётся у цели, выбранной в начале работы. Сессии без
                известной цели входят в общую сумму.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
function elapsed(session: ActionSession, now: Date): number | null {
  try {
    return session.workedDurationAt(now);
  } catch {
    return null;
  }
}
function timerLabel(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}
