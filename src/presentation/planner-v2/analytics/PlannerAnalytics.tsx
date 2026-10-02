import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AnalyticsOverview,
  AnalyticsTopic,
} from '../../../application/analytics/GetAnalyticsOverview';
import {
  localAnalyticsDate,
  resolveAnalyticsPeriod,
} from '../../../application/analytics/GetAnalyticsOverview';
import type { GetAnalyticsOverview } from '../../../application/analytics/GetAnalyticsOverview';
import { addDays } from '../../../domain/planner/PlanningPeriod';
import type { PlannerRoute } from '../PlannerNavigation';
import { AppIcon, type AppIconName } from '../../components/AppIcon';
import './analytics.css';

type AnalyticsRoute = Extract<PlannerRoute, { view: 'analytics' }>;
type Metric = 'time' | 'results' | 'state';
const labels: Record<AnalyticsTopic, string> = {
  overview: 'Обзор',
  results: 'Действия',
  time: 'Время',
  goals: 'Цели',
  balance: 'Баланс',
  state: 'Состояние',
  rest: 'Восстановление',
  memory: 'Память жизни',
};
const topics: readonly AnalyticsTopic[] = [
  'overview',
  'results',
  'time',
  'goals',
  'balance',
  'state',
];
const number = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value);
const shortDate = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(
    new Date(`${value}T12:00:00`),
  );
const periodLabel = (start: string, end: string) => `${shortDate(start)} — ${shortDate(end)}`;
function time(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes === 0) return '0 мин';
  const hours = Math.floor(minutes / 60);
  return `${hours ? `${hours} ч` : ''}${hours && minutes % 60 ? ' ' : ''}${minutes % 60 ? `${minutes % 60} мин` : ''}`;
}
function monthOffset(start: string, offset: number): string {
  if (offset < 0) return `${addDays(start, -1).slice(0, 7)}-01`;
  const next = addDays(start, 32);
  return `${next.slice(0, 7)}-01`;
}
function difference(value: number | null, format: (value: number) => string): string {
  if (value === null) return 'Сравнение недоступно';
  if (value === 0) return 'Без изменения за сопоставимые дни';
  return `${value > 0 ? 'Больше на' : 'Меньше на'} ${format(Math.abs(value))} за сопоставимые дни`;
}

export function PlannerAnalytics({
  service,
  route,
  onNavigate,
  onOpenAction,
}: {
  readonly service: GetAnalyticsOverview | undefined;
  readonly route: AnalyticsRoute;
  readonly onNavigate: (route: PlannerRoute) => Promise<boolean> | void;
  readonly onOpenAction?: (id: string) => Promise<boolean> | void;
}) {
  const periodKind = route.period ?? 'week';
  const topic = route.topic ?? 'overview';
  const [metric, setMetric] = useState<Metric>('time');
  const [report, setReport] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const [notice, setNotice] = useState('');
  const generation = useRef(0);
  const changeRevision = useRef(0);
  const today = localAnalyticsDate(new Date());
  const selection = useMemo(
    () => resolveAnalyticsPeriod(periodKind, route.date, today),
    [periodKind, route.date, today],
  );
  const displayed =
    report && report.period.start === selection.start && report.period.kind === periodKind
      ? report
      : null;
  const go = (next: Omit<Partial<AnalyticsRoute>, 'day'> & { day?: string | undefined }) => {
    const { day, ...rest } = next;
    void onNavigate({
      view: 'analytics',
      period: periodKind,
      date: selection.start,
      ...rest,
      ...(day ? { day } : {}),
    });
  };
  const load = useCallback(
    async (isRefresh = false) => {
      if (!service) return;
      const current = ++generation.current;
      const startedAtRevision = changeRevision.current;
      setLoading(true);
      setError('');
      try {
        const value = await service.execute({ period: periodKind, date: selection.start });
        if (current !== generation.current) return;
        setReport(value);
        setStale(changeRevision.current !== startedAtRevision);
        if (isRefresh) setNotice('Обзор обновлён');
      } catch (failure: unknown) {
        if (current !== generation.current) return;
        setError(failure instanceof Error ? failure.message : 'Не удалось прочитать данные.');
      } finally {
        if (current === generation.current) setLoading(false);
      }
    },
    [service, periodKind, selection.start],
  );
  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(timeout);
      generation.current += 1;
    };
  }, [load]);
  useEffect(
    () =>
      service?.subscribe(() => {
        changeRevision.current += 1;
        setStale(true);
      }),
    [service],
  );

  const toAction = (id: string) => void (onOpenAction?.(id) ?? onNavigate({ view: 'action', id }));
  const periodStep = (offset: number) => {
    const date =
      periodKind === 'week'
        ? addDays(selection.start, offset * 7)
        : monthOffset(selection.start, offset);
    go({ date, day: undefined });
  };
  const nextStart =
    periodKind === 'week' ? addDays(selection.start, 7) : monthOffset(selection.start, 1);
  const currentStart = resolveAnalyticsPeriod(periodKind, today, today).start;
  const selectedDay =
    route.day && displayed?.days.some((day) => day.date === route.day) ? route.day : null;
  const dayFiltered = (date: string) => !selectedDay || selectedDay === date;
  const hasRecords =
    displayed &&
    (displayed.completedCount > 0 ||
      displayed.timeMilliseconds > 0 ||
      displayed.goalRows.length > 0 ||
      displayed.completedDiaryDays > 0 ||
      displayed.walks.completedCount > 0 ||
      displayed.memory.length > 0 ||
      displayed.preparation.allDone > 0 ||
      displayed.preparation.withSkips > 0 ||
      displayed.balance.some((item) => item.effectiveScore !== null));

  const link = (next: AnalyticsTopic, text: string) => (
    <button
      type="button"
      className="analytics-link"
      onClick={() => go({ topic: next, day: undefined })}
    >
      {text} ↗
    </button>
  );
  const header = (title: string, next: AnalyticsTopic, subtitle: string) => (
    <div className="analytics-section-heading">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {link(next, 'Подробнее')}
    </div>
  );
  const timeChartInMinutes =
    Math.max(
      0,
      ...(displayed?.days.map((day) => day.timeMilliseconds) ?? []),
      ...(displayed?.previousDays.map((day) => day.timeMilliseconds) ?? []),
    ) < 3_600_000;
  const dayValues = (target: Metric) =>
    displayed?.days.map((day) =>
      target === 'time'
        ? day.timeMilliseconds / (timeChartInMinutes ? 60_000 : 3_600_000)
        : target === 'results'
          ? day.completed.length
          : day.energy,
    ) ?? [];
  const previousValues = (target: Metric) =>
    displayed?.previousDays.map((day) =>
      target === 'time'
        ? day.timeMilliseconds / (timeChartInMinutes ? 60_000 : 3_600_000)
        : target === 'results'
          ? day.completed.length
          : day.energy,
    ) ?? [];
  const chart = () => {
    if (!displayed) return null;
    const values = dayValues(metric);
    const old = previousValues(metric);
    const maximum = Math.max(
      1,
      ...values.map((value) => value ?? 0),
      ...old.map((value) => value ?? 0),
    );
    const metricTopic = metric === 'results' ? 'results' : metric === 'state' ? 'state' : 'time';
    return (
      <section className="analytics-chart-panel" aria-label="Динамика за период">
        <div className="analytics-section-heading">
          <div>
            <span className="analytics-kicker">
              Ритм {periodKind === 'week' ? 'недели' : 'месяца'}
            </span>
            <h2>
              {metric === 'time'
                ? 'Куда уходит время'
                : metric === 'results'
                  ? 'Выполненные действия'
                  : 'Энергия по дневнику'}
            </h2>
          </div>
          <div className="planner-segments" aria-label="Показатель графика">
            {(
              [
                ['time', 'Время'],
                ['results', 'Действия'],
                ['state', 'Энергия'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={metric === key}
                onClick={() => setMetric(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="analytics-chart-summary">
          <strong>
            {metric === 'time'
              ? time(displayed.timeMilliseconds)
              : metric === 'results'
                ? displayed.completedCount
                : displayed.energy === null
                  ? '—'
                  : `${number(displayed.energy)} / 5`}
          </strong>
          <span>
            {metric === 'time'
              ? 'по записанным сессиям'
              : metric === 'state'
                ? `${displayed.energySamples} дней с оценкой`
                : 'действительных выполнений'}
          </span>
        </div>
        <div className="analytics-legend">
          <span>
            <i /> Выбранный период
          </span>
          <span>
            <i className="is-previous" /> Предыдущий период
          </span>
        </div>
        <div className="analytics-plot">
          <div className="analytics-y-axis">
            <small>
              {metric === 'state'
                ? 'Оценка'
                : metric === 'time'
                  ? timeChartInMinutes
                    ? 'Минуты'
                    : 'Часы'
                  : 'Действия'}
            </small>
            <span>{number(maximum)}</span>
            <span>{number(maximum / 2)}</span>
            <span>0</span>
          </div>
          <div className="analytics-bars">
            {displayed.days.map((day, index) => {
              const value = values[index] ?? null;
              const prior = old[index] ?? null;
              const label = `${shortDate(day.date)}: ${value === null ? 'Нет оценки' : metric === 'time' ? time(day.timeMilliseconds) : metric === 'results' ? `${value} действий` : `${number(value)} из 5`}`;
              return (
                <div key={day.date} className="analytics-day" role="img" aria-label={label}>
                  <span className="analytics-bar-pair">
                    <i
                      className="analytics-bar is-previous"
                      style={{ height: `${((prior ?? 0) / maximum) * 100}%` }}
                    />
                    {value === null ? (
                      <span className="analytics-missing">—</span>
                    ) : (
                      <i
                        className="analytics-bar"
                        style={{ height: `${(value / maximum) * 100}%` }}
                      />
                    )}
                  </span>
                  <span className="analytics-day-label">
                    {periodKind === 'week'
                      ? new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(
                          new Date(`${day.date}T12:00:00`),
                        )
                      : index % 5 === 0
                        ? day.date.slice(-2)
                        : ''}
                    <small>{periodKind === 'week' ? day.date.slice(-2) : ''}</small>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="analytics-chart-footer">
          <span>Выберите день, чтобы увидеть записи</span>
          <select
            aria-label="Записи выбранного дня"
            value=""
            onChange={(event) => go({ topic: metricTopic, day: event.target.value })}
          >
            <option value="" disabled>
              Выбрать день
            </option>
            {displayed.days.map((day) => (
              <option key={day.date} value={day.date}>
                {shortDate(day.date)}
              </option>
            ))}
          </select>
          {link(metricTopic, 'Все записи')}
        </div>
      </section>
    );
  };
  const panel = (
    title: string,
    next: AnalyticsTopic,
    subtitle: string,
    children: React.ReactNode,
  ) => (
    <section className="analytics-secondary-panel">
      {header(title, next, subtitle)}
      {children}
    </section>
  );
  const spheres = displayed?.sphereTime ?? [];
  const goals = displayed?.goalRows ?? [];
  const ratings = displayed
    ? ([
        ['Энергия', displayed.energy],
        ['Настроение', displayed.mood],
        ['Продуктивность', displayed.productivity],
        ['Оценка дня', displayed.overall],
      ] as const)
    : [];
  const spherePanel = panel(
    'Внимание к сферам',
    'balance',
    'Распределение учтённого времени',
    <>
      <div className="analytics-distribution">
        {spheres.length ? (
          spheres.map((row) => (
            <button
              className="analytics-sphere-row"
              key={row.id ?? 'none'}
              onClick={() => go({ topic: 'balance' })}
            >
              <span>{row.name}</span>
              <strong>{time(row.milliseconds)}</strong>
              <span className="analytics-track">
                <i
                  style={{
                    width: `${Math.round((100 * row.milliseconds) / Math.max(displayed?.timeMilliseconds ?? 1, 1))}%`,
                  }}
                />
              </span>
            </button>
          ))
        ) : (
          <p className="analytics-footnote">Сессий с распределением пока нет.</p>
        )}
      </div>
      <p className="analytics-footnote">
        По текущим связям целей со сферами. Учтённое время не равно всему дню.
      </p>
    </>,
  );
  const goalsPanel = panel(
    'Движение к целям',
    'goals',
    'Результаты за период · текущая конфигурация',
    <div className="analytics-goal-list">
      {goals.length ? (
        goals.slice(0, 5).map((row) => (
          <button
            className="analytics-goal-row"
            key={row.goal.id.toString()}
            onClick={() => go({ topic: 'goals' })}
          >
            <div>
              <strong>{row.goal.title}</strong>
              <small>
                {row.contributions.length} записей
                {row.pending ? ` · ${row.pending} ожидают результата` : ''}
              </small>
            </div>
            <span className="analytics-goal-gain">
              {number(row.knownAmount)} {row.goal.measurement?.unit ?? ''}
            </span>
            <span className="analytics-goal-progress">
              {row.currentProgress?.percent !== null &&
                row.currentProgress?.percent !== undefined && (
                  <span className="analytics-track">
                    <i style={{ width: `${row.currentProgress.percent}%` }} />
                  </span>
                )}
              <small>
                {row.currentProgress
                  ? `${number(row.currentProgress.current)} из ${number(row.currentProgress.target)} ${row.goal.measurement?.unit ?? ''}`
                  : 'Текущий прогресс не задан'}
              </small>
            </span>
          </button>
        ))
      ) : (
        <p className="analytics-footnote">В этом периоде нет вкладов в цели.</p>
      )}
    </div>,
  );
  const statePanel = panel(
    'Состояние',
    'state',
    `Самооценки из дневника · ${displayed?.completedDiaryDays ?? 0} дней с записями`,
    displayed?.completedDiaryDays ? (
      <div className="analytics-ratings">
        {ratings.map(([label, value]) => (
          <button key={label} onClick={() => go({ topic: 'state' })}>
            <span>{label}</span>
            <strong>
              {value === null ? '—' : number(value)}
              <small> / 5</small>
            </strong>
            <span className="analytics-rating-dots" aria-hidden="true">
              {[1, 2, 3, 4, 5].map((n) => (
                <i
                  key={n}
                  className={value !== null && n <= Math.round(value) ? 'is-filled' : ''}
                />
              ))}
            </span>
          </button>
        ))}
      </div>
    ) : (
      <div className="analytics-inline-empty">
        <p>В этом периоде ещё нет завершённых записей дневника.</p>
        <button
          className="analytics-link"
          onClick={() => void onNavigate({ view: 'diary', period: 'day' })}
        >
          Открыть дневник ↗
        </button>
      </div>
    ),
  );
  const context = (
    <aside className="analytics-context">
      <h2>Что заметно</h2>
      <article>
        <span className="analytics-observation-mark">01</span>
        <p>
          <strong>Завершённые действия</strong>
          <span>
            {displayed?.completedCount ?? 0} за период.{' '}
            {displayed ? difference(displayed.comparison.completedDifference, number) : ''}
          </span>
        </p>
      </article>
      <article>
        <span className="analytics-observation-mark">02</span>
        <p>
          <strong>Учтённое время</strong>
          <span>
            {time(displayed?.timeMilliseconds ?? 0)} по сессиям.{' '}
            {displayed ? difference(displayed.comparison.timeDifferenceMs, time) : ''}
          </span>
        </p>
      </article>
      <article>
        <span className="analytics-observation-mark">03</span>
        <p>
          <strong>Энергия по дневнику</strong>
          <span>
            {displayed?.energy === null ? 'Нет оценки' : `${number(displayed?.energy ?? 0)} из 5`} ·{' '}
            {displayed?.energySamples ?? 0} дней с оценкой.
          </span>
        </p>
      </article>
      <div className="analytics-coverage">
        <AppIcon name="history" />
        <div>
          <strong>Из чего сложился период</strong>
          <span>Выполнения, сессии и {displayed?.completedDiaryDays ?? 0} записей дневника.</span>
          {link('time', 'Посмотреть источники')}
        </div>
      </div>
    </aside>
  );
  const overview = displayed && (
    <>
      <div className="analytics-kpis">
        {(
          [
            [
              'results',
              'completed',
              'Выполнено действий',
              String(displayed.completedCount),
              difference(displayed.comparison.completedDifference, number),
            ],
            [
              'time',
              'routine',
              'Учтено времени',
              time(displayed.timeMilliseconds),
              difference(displayed.comparison.timeDifferenceMs, time),
            ],
            [
              'goals',
              'goals',
              'Целей с вкладом',
              String(displayed.goalsWithContribution),
              displayed.goalsWithContribution
                ? 'Есть записанные результаты'
                : 'Пока нет записанных результатов',
            ],
            [
              'state',
              'focus',
              'Энергия',
              displayed.energy === null ? '—' : `${number(displayed.energy)} / 5`,
              `${displayed.energySamples} дней с оценкой`,
            ],
          ] as const
        ).map(([next, icon, title, value, note]) => (
          <button key={next} className="analytics-kpi" onClick={() => go({ topic: next })}>
            <span>
              <AppIcon name={icon as AppIconName} />
              {title}
              <span className="analytics-kpi-arrow">↗</span>
            </span>
            <strong>{value}</strong>
            <small>{note}</small>
          </button>
        ))}
      </div>
      <div className="analytics-primary-grid">
        {chart()}
        {context}
      </div>
      <div className="analytics-secondary-grid">
        {spherePanel}
        {goalsPanel}
      </div>
      <div className="analytics-secondary-grid">
        {statePanel}
        {panel(
          'Восстановление и события',
          'rest',
          'То, что было помимо рабочих задач',
          <>
            <button className="analytics-life-row" onClick={() => go({ topic: 'rest' })}>
              <AppIcon name="walks" />
              <span>
                Прогулки<small>{displayed.walks.completedCount} завершено</small>
              </span>
              <b>{time(displayed.walks.durationMs)}</b>
              <span>↗</span>
            </button>
            <button className="analytics-life-row" onClick={() => go({ topic: 'rest' })}>
              <AppIcon name="routine" />
              <span>
                Подготовка ко сну<small>Дни с завершённой подготовкой</small>
              </span>
              <b>{displayed.preparation.allDone} дн.</b>
              <span>↗</span>
            </button>
            <button className="analytics-life-row" onClick={() => go({ topic: 'memory' })}>
              <AppIcon name="history" />
              <span>
                Память жизни<small>Сохранённые события</small>
              </span>
              <b>{displayed.memory.length}</b>
              <span>↗</span>
            </button>
          </>,
        )}
      </div>
    </>
  );

  const detail = displayed && (
    <section className="analytics-details">
      <div className="analytics-section-heading">
        <div>
          <span className="analytics-kicker">
            {selectedDay ? shortDate(selectedDay) : 'Весь период'}
          </span>
          <h2>{labels[topic]}</h2>
        </div>
        {selectedDay && <button onClick={() => go({ day: undefined })}>Все дни</button>}
      </div>
      {topic === 'results' && (
        <>
          <p>Сохранённые действительные выполнения, включая архивные.</p>
          {!displayed.days.some((day) => dayFiltered(day.date) && day.completed.length) && (
            <p>В выбранные дни выполнений не было.</p>
          )}
          {displayed.days
            .filter((day) => dayFiltered(day.date) && (selectedDay || day.completed.length > 0))
            .map((day) => (
              <div className="analytics-day-detail" key={day.date}>
                <h3>
                  {shortDate(day.date)} <span>{day.completed.length} действий</span>
                </h3>
                {day.completed.map((action) => (
                  <div className="analytics-detail-row" key={action.id.toString()}>
                    <strong>{action.title.toString()}</strong>
                    <small>Выполнено</small>
                    <button
                      className="analytics-link"
                      onClick={() => toAction(action.id.toString())}
                    >
                      Открыть ↗
                    </button>
                  </div>
                ))}
              </div>
            ))}
        </>
      )}
      {topic === 'time' && (
        <>
          <p>Рабочие интервалы без пауз; ручная общая оценка времени не прибавляется.</p>
          {!displayed.days.some((day) => dayFiltered(day.date) && day.timeMilliseconds > 0) && (
            <p>В выбранные дни рабочих сессий не было.</p>
          )}
          {displayed.days
            .filter((day) => dayFiltered(day.date) && (selectedDay || day.timeMilliseconds > 0))
            .map((day) => (
              <div className="analytics-day-detail" key={day.date}>
                <h3>
                  {shortDate(day.date)} <span>{time(day.timeMilliseconds)}</span>
                </h3>
                {displayed.timeEvidence
                  .find((entry) => entry.date === day.date)
                  ?.rows.map((row) => (
                    <div className="analytics-detail-row" key={row.actionId}>
                      <strong>
                        {displayed.sources.actions.some(
                          (action) => action.id.toString() === row.actionId && !action.isDeleted(),
                        )
                          ? row.title
                          : 'Действие недоступно'}
                      </strong>
                      <span>{time(row.actualMilliseconds)}</span>
                      {displayed.sources.actions.some(
                        (action) => action.id.toString() === row.actionId && !action.isDeleted(),
                      ) ? (
                        <button className="analytics-link" onClick={() => toAction(row.actionId)}>
                          Открыть ↗
                        </button>
                      ) : (
                        <small>Действие недоступно</small>
                      )}
                    </div>
                  ))}
              </div>
            ))}
        </>
      )}
      {topic === 'goals' && (
        <>
          <p>Начальные значения исключены. Единицы показаны по текущим настройкам целей.</p>
          {goals
            .filter(
              (row) =>
                !selectedDay ||
                row.contributions.some((fact) => fact.effectiveDate === selectedDay),
            )
            .map((row) => (
              <div className="analytics-day-detail" key={row.goal.id.toString()}>
                <h3>
                  {row.goal.title}{' '}
                  <span>
                    {number(row.knownAmount)} {row.goal.measurement?.unit ?? ''}
                  </span>
                </h3>
                {row.contributions
                  .filter((fact) => !selectedDay || fact.effectiveDate === selectedDay)
                  .map((fact) => (
                    <div className="analytics-detail-row" key={fact.id}>
                      <strong>{fact.reason || 'Вклад в цель'}</strong>
                      <span>{shortDate(fact.effectiveDate)}</span>
                      <small>
                        {fact.amount === null ? 'Ожидает результата' : number(fact.amount)}
                      </small>
                      {fact.actionId &&
                      displayed.sources.actions.some(
                        (action) => action.id.toString() === fact.actionId && !action.isDeleted(),
                      ) ? (
                        <button className="analytics-link" onClick={() => toAction(fact.actionId!)}>
                          Открыть действие ↗
                        </button>
                      ) : fact.actionId ? (
                        <small>Действие недоступно</small>
                      ) : null}
                    </div>
                  ))}
                <button
                  className="analytics-link"
                  onClick={() => void onNavigate({ view: 'goal', id: row.goal.id.toString() })}
                >
                  Открыть цель ↗
                </button>
              </div>
            ))}
        </>
      )}
      {topic === 'balance' && (
        <>
          {spherePanel}
          <h3>Состояние сфер</h3>
          {displayed.balance.length ? (
            displayed.balance.map((item) => (
              <div className="analytics-detail-row" key={item.id}>
                <strong>
                  {displayed.sources.spheres.find(
                    (sphere) => sphere.id.toString() === item.entityId,
                  )?.name ?? 'Сфера недоступна'}
                </strong>
                <span>
                  {item.effectiveScore === null
                    ? 'Нет оценки'
                    : `${number(item.effectiveScore)} / 10`}
                </span>
                <small>Месячный снимок: {item.month}</small>
              </div>
            ))
          ) : (
            <p>Для этого месяца нет сохранённого снимка баланса.</p>
          )}
        </>
      )}
      {topic === 'state' && (
        <>
          <p>
            Средние только по заполненным оценкам завершённых дневных записей. Пропуск не равен
            нулю.
          </p>
          {displayed.days
            .filter((day) => dayFiltered(day.date) && (selectedDay || day.energy !== null))
            .map((day) => (
              <div className="analytics-detail-row" key={day.date}>
                <strong>{shortDate(day.date)}</strong>
                <span>{day.energy === null ? 'Нет оценки' : `${number(day.energy)} / 5`}</span>
                <button
                  className="analytics-link"
                  onClick={() => void onNavigate({ view: 'diary', period: 'day', date: day.date })}
                >
                  Открыть дневник ↗
                </button>
              </div>
            ))}
        </>
      )}
      {topic === 'rest' && (
        <>
          <p>
            {displayed.walks.completedCount} прогулок · {time(displayed.walks.durationMs)}.
            Подготовка завершена в {displayed.preparation.allDone} днях; с пропусками —{' '}
            {displayed.preparation.withSkips}. Это не длительность сна.
          </p>
          {displayed.sources.walks
            .filter(
              (walk) =>
                walk.deletedAt === null &&
                walk.status === 'completed' &&
                walk.date.toString() >= displayed.period.start &&
                walk.date.toString() <= displayed.period.end &&
                dayFiltered(walk.date.toString()),
            )
            .map((walk) => (
              <div className="analytics-detail-row" key={walk.id.toString()}>
                <strong>Прогулка · {shortDate(walk.date.toString())}</strong>
                <span>{time(walk.actualDurationMilliseconds ?? 0)}</span>
                <button
                  className="analytics-link"
                  onClick={() => void onNavigate({ view: 'walks', id: walk.id.toString() })}
                >
                  Открыть ↗
                </button>
              </div>
            ))}
          {displayed.sources.sleep?.nightCycles
            .filter(
              (cycle) =>
                cycle.cycleDate >= displayed.period.start &&
                cycle.cycleDate <= displayed.period.end &&
                dayFiltered(cycle.cycleDate) &&
                (cycle.preparationCompletionKind === 'ALL_DONE' ||
                  cycle.preparationCompletionKind === 'WITH_SKIPS'),
            )
            .map((cycle) => (
              <div className="analytics-detail-row" key={cycle.id}>
                <strong>Подготовка ко сну · {shortDate(cycle.cycleDate)}</strong>
                <span>
                  {cycle.preparationCompletionKind === 'ALL_DONE'
                    ? 'Всё завершено'
                    : 'Завершено с пропусками'}
                </span>
                <button
                  className="analytics-link"
                  onClick={() => void onNavigate({ view: 'sleep' })}
                >
                  Открыть ↗
                </button>
              </div>
            ))}
        </>
      )}
      {topic === 'memory' && (
        <>
          <p>События дают контекст. Число записей не оценивает насыщенность жизни.</p>
          {displayed.memory
            .filter((event) => dayFiltered(event.occurredOn.toString()))
            .map((event) => (
              <div className="analytics-detail-row" key={event.id.toString()}>
                <strong>{event.title}</strong>
                <span>{shortDate(event.occurredOn.toString())}</span>
                <button
                  className="analytics-link"
                  onClick={() => void onNavigate({ view: 'memory', id: event.id.toString() })}
                >
                  Открыть ↗
                </button>
              </div>
            ))}
        </>
      )}
      <details className="analytics-method">
        <summary>Как считается показатель</summary>
        <p>
          Числа и строки получены из одного снимка данных на{' '}
          {displayed.asOf.toLocaleString('ru-RU')}. Архив сохраняет выполнения, а повторно открытые
          и удалённые действия исключаются. Пропуски дневника не считаются нулём.
        </p>
      </details>
    </section>
  );

  return (
    <div className="analytics-page">
      <header className="planner-page-heading">
        <div>
          <h1>Аналитика</h1>
          <p className="planner-eyebrow">
            Общая картина жизни · результаты, время, баланс и тенденции
          </p>
        </div>
        <div className="planner-segments" aria-label="Период аналитики">
          {(['week', 'month'] as const).map((kind) => (
            <button
              key={kind}
              aria-pressed={periodKind === kind}
              onClick={() => void onNavigate({ view: 'analytics', period: kind })}
            >
              {kind === 'week' ? 'Неделя' : 'Месяц'}
            </button>
          ))}
        </div>
      </header>
      <div className="analytics-period">
        <div className="analytics-date">
          <button aria-label="Предыдущий период" onClick={() => periodStep(-1)}>
            ‹
          </button>
          <strong>{periodLabel(selection.start, selection.end)}</strong>
          <button
            aria-label="Следующий период"
            disabled={nextStart > currentStart}
            onClick={() => periodStep(1)}
          >
            ›
          </button>
        </div>
        <span>
          {selection.comparisonCurrentEnd
            ? `Сравнение: ${periodLabel(selection.start, selection.comparisonCurrentEnd)} и ${periodLabel(selection.previousStart, selection.comparisonPreviousEnd!)}`
            : 'Для сравнения пока нет завершённых дней'}
        </span>
      </div>
      <nav className="analytics-tabs" aria-label="Раздел аналитики">
        {topics.map((item) => (
          <button
            key={item}
            aria-current={topic === item ? 'page' : undefined}
            onClick={() => go({ topic: item, day: undefined })}
          >
            {labels[item]}
          </button>
        ))}
      </nav>
      {topic !== 'overview' && (
        <button
          className="analytics-back"
          onClick={() => go({ topic: 'overview', day: undefined })}
        >
          ← К обзору
        </button>
      )}
      {stale && (
        <p className="analytics-notice" role="status">
          Данные изменились — <button onClick={() => void load(true)}>Обновить</button>
        </p>
      )}
      {error && displayed && (
        <p className="analytics-notice" role="alert">
          Не удалось обновить обзор: {error}.{' '}
          <button onClick={() => void load(true)}>Повторить</button>
        </p>
      )}
      {notice && (
        <p className="analytics-notice" role="status">
          {notice}
        </p>
      )}
      {!service ? (
        <section className="analytics-empty">
          <h2>Аналитика недоступна</h2>
          <p>Не удалось подключить чтение данных.</p>
        </section>
      ) : (loading || (!displayed && !error)) && !displayed ? (
        <section className="analytics-loading" aria-busy="true" aria-label="Загрузка аналитики">
          <div className="analytics-kpis">
            {[1, 2, 3, 4].map((key) => (
              <span key={key} />
            ))}
          </div>
          <div className="analytics-skeleton-chart" />
        </section>
      ) : error && !displayed ? (
        <section className="analytics-empty" role="alert">
          <h2>Не удалось загрузить аналитику</h2>
          <p>{error}</p>
          <button className="planner-primary" onClick={() => void load(true)}>
            Повторить
          </button>
        </section>
      ) : displayed && !hasRecords ? (
        <section className="analytics-empty">
          <h2>Пока нет записей за этот период</h2>
          <p>Выберите другой период или начните с записей дня — показатели появятся здесь.</p>
          <button className="planner-primary" onClick={() => void onNavigate({ view: 'today' })}>
            Открыть сегодня
          </button>
        </section>
      ) : topic === 'overview' ? (
        overview
      ) : (
        detail
      )}
      <footer className="analytics-footer">
        <span>Данные LifeOS · {periodKind === 'week' ? 'недельный' : 'месячный'} обзор</span>
        <details>
          <summary>О данных и расчётах</summary>
          <p>
            Время учитывается по сессиям без пауз. Оценки состояния — по завершённым записям
            дневника. Отсутствие записи не означает ноль. Показатели пересчитываются при обновлении.
          </p>
        </details>
      </footer>
    </div>
  );
}
