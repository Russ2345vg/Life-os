import { useCallback, useEffect, useRef } from 'react';
import type {
  GetWalkAnalytics,
  WalkAnalytics,
  WalkAnalyticsMetric,
  WalkAnalyticsPeriod,
} from '../../application';
import type { DayDate, WalkIntent } from '../../domain';
import { useWalkCaptureQuery } from './useWalkCaptureQuery';
import { WALK_INTENT_OPTIONS, WALK_INTENT_PRESENTATION } from './WalkSessionPresentation';
import { formatActualDuration } from './walkPresentation';
import { WalkInsightsPanel } from './WalkInsightsPanel';
import { walkConfidenceLevel } from '../../application';
import {
  WALK_ANALYTICS_METRICS,
  formatWalkAnalyticsValue,
  walkAnalyticsDate,
  walkAnalyticsObservation,
  walkAnalyticsSample,
} from './WalkAnalyticsPresentation';

interface Navigation {
  readonly onStart: () => void;
  readonly onOpenHistory: (intent?: WalkIntent) => void;
}
interface Props extends Navigation {
  readonly getWalkAnalytics: Pick<GetWalkAnalytics, 'execute'>;
  readonly currentDate: DayDate;
  readonly period: WalkAnalyticsPeriod;
  readonly onPeriodChange: (period: WalkAnalyticsPeriod) => void;
  readonly onBack: () => void;
}

export function WalkAnalyticsScreen(props: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.closest('[data-walk-focus-stage]')?.scrollIntoView({ block: 'start' });
  }, []);
  return (
    <section
      className="walk-analytics"
      aria-labelledby="walk-analytics-title"
      data-walk-focus-stage
    >
      <button type="button" className="secondary-button walk-analytics-back" onClick={props.onBack}>
        ← К прогулкам
      </button>
      <header className="walk-analytics-header">
        <div>
          <p className="section-page-eyebrow">Прогулки · Наблюдения</p>
          <h1 ref={heading} tabIndex={-1} id="walk-analytics-title">
            Аналитика прогулок
          </h1>
          <p className="walk-analytics-muted">Только завершённые прогулки и сохранённые оценки.</p>
        </div>
        <div className="walk-analytics-period" role="group" aria-label="Период аналитики">
          <button
            type="button"
            className="secondary-button"
            aria-pressed={props.period === 'last7Days'}
            onClick={() => props.onPeriodChange('last7Days')}
          >
            7 дней
          </button>
          <button
            type="button"
            className="secondary-button"
            aria-pressed={props.period === 'last30Days'}
            onClick={() => props.onPeriodChange('last30Days')}
          >
            30 дней
          </button>
        </div>
      </header>
      <AnalyticsQuery key={`${props.period}:${props.currentDate.toString()}`} {...props} />
    </section>
  );
}

function AnalyticsQuery(props: Props) {
  const load = useCallback(
    () => props.getWalkAnalytics.execute(props.period),
    [props.getWalkAnalytics, props.period],
  );
  const { state, reload } = useWalkCaptureQuery(load);
  if (state.status === 'loading') return <p role="status">Загружаем аналитику…</p>;
  if (state.status === 'error')
    return (
      <div role="alert" className="walk-analytics-error">
        <p>Не удалось загрузить аналитику. Сохранённые данные не изменены.</p>
        <button className="secondary-button" type="button" onClick={reload}>
          Повторить
        </button>
      </div>
    );
  return (
    <WalkAnalyticsView
      analytics={state.value}
      onStart={props.onStart}
      onOpenHistory={props.onOpenHistory}
    />
  );
}

export function WalkAnalyticsView({
  analytics,
  onStart,
  onOpenHistory,
}: Navigation & { readonly analytics: WalkAnalytics }) {
  if (analytics.completedCount === 0)
    return (
      <div className="walk-analytics-empty">
        <p>Недостаточно данных для аналитики.</p>
        <button type="button" className="primary-button" onClick={onStart}>
          Начать прогулку
        </button>
      </div>
    );
  const kpis = [
    { key: 'count', label: 'Прогулок', value: String(analytics.completedCount) },
    {
      key: 'total',
      label: 'Общее время',
      value: formatActualDuration(analytics.totalDurationMilliseconds),
    },
    {
      key: 'average',
      label: 'Средняя длительность',
      value: formatActualDuration(analytics.averageDurationMilliseconds),
    },
    { key: 'days', label: 'Дней с прогулкой', value: String(analytics.daysWithWalks) },
  ];
  return (
    <>
      <p className="walk-analytics-muted" role="status">
        {walkAnalyticsDate(analytics.startDate)} — {walkAnalyticsDate(analytics.endDate)} · по дате
        прогулки
      </p>
      <dl className="walk-analytics-kpis">
        {kpis.map((kpi) => (
          <div key={kpi.key} data-walk-analytics-kpi={kpi.key}>
            <dt>{kpi.label}</dt>
            <dd>{kpi.value}</dd>
          </div>
        ))}
      </dl>
      <WalkInsightsPanel insights={analytics.insights} />
      <section className="walk-analytics-panel" aria-labelledby="walk-analytics-state-title">
        <div className="walk-analytics-section-heading">
          <h2 id="walk-analytics-state-title">Изменение состояния</h2>
          <p className="walk-analytics-muted">Среднее по парным оценкам до и после · шкала 0–10</p>
        </div>
        <p className="walk-analytics-muted">Среднее изменение после прогулок:</p>
        <div className="walk-analytics-states">
          {WALK_ANALYTICS_METRICS.map(({ key, label }) => (
            <StateMetric key={key} label={label} metric={analytics.state[key]} metricKey={key} />
          ))}
        </div>
      </section>
      <section
        className="walk-analytics-modes-section"
        aria-labelledby="walk-analytics-modes-title"
      >
        <h2 id="walk-analytics-modes-title">По режимам</h2>
        <div className="walk-analytics-modes">
          {WALK_INTENT_OPTIONS.map((intent) => {
            const mode = analytics.byIntent[intent];
            const label = WALK_INTENT_PRESENTATION[intent].shortLabel;
            return (
              <article
                key={intent}
                className="walk-analytics-panel"
                data-walk-analytics-mode={intent}
                aria-label={label}
              >
                <h3>{label}</h3>
                <dl className="walk-analytics-mode-facts">
                  <div>
                    <dt>Прогулок</dt>
                    <dd>{mode.count}</dd>
                  </div>
                  <div>
                    <dt>Средняя длительность</dt>
                    <dd>{formatActualDuration(mode.averageDurationMilliseconds)}</dd>
                  </div>
                </dl>
                <div className="walk-analytics-mode-states">
                  {WALK_ANALYTICS_METRICS.map(({ key, label: metricLabel }) => {
                    const metric = mode.state[key];
                    return (
                      <div key={key}>
                        <span>{metricLabel}</span>
                        {walkConfidenceLevel(metric.sampleSize) !== null ? (
                          <>
                            <strong>{formatWalkAnalyticsValue(metric.averageDelta, true)}</strong>
                            <small>{walkAnalyticsSample(metric.sampleSize)}</small>
                            <small>{walkAnalyticsObservation(metric.sampleSize)}</small>
                          </>
                        ) : (
                          <small>
                            Недостаточно данных для сравнения · пар оценок: {metric.sampleSize}
                          </small>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => onOpenHistory(intent)}
                  aria-label={`Посмотреть прогулки: ${label}`}
                >
                  Посмотреть прогулки
                </button>
              </article>
            );
          })}
        </div>
        {analytics.unclassifiedCount > 0 ? (
          <p className="walk-analytics-muted">
            Без указанного режима: {analytics.unclassifiedCount}. Учтены в общем итоге.
          </p>
        ) : null}
      </section>
      <DailyChart analytics={analytics} />
      <section className="walk-analytics-panel" aria-labelledby="walk-analytics-outcomes-title">
        <h2 id="walk-analytics-outcomes-title">Сохранённые результаты</h2>
        <dl className="walk-analytics-outcomes">
          <div>
            <dt>Лучше</dt>
            <dd>{analytics.impactCounts.better}</dd>
          </div>
          <div>
            <dt>Так же</dt>
            <dd>{analytics.impactCounts.same}</dd>
          </div>
          <div>
            <dt>Хуже</dt>
            <dd>{analytics.impactCounts.worse}</dd>
          </div>
          <div>
            <dt>С текстовым результатом</dt>
            <dd>{analytics.withTextResultCount}</dd>
          </div>
          <div>
            <dt>С сохранёнными мыслями</dt>
            <dd>{analytics.withCapturesCount}</dd>
          </div>
        </dl>
        <p className="walk-analytics-muted">
          Количество прогулок, не оценка эффективности. Всего мыслей: {analytics.captureCount}.
        </p>
      </section>
      <footer className="walk-analytics-footer">
        <button type="button" className="secondary-button" onClick={() => onOpenHistory()}>
          Посмотреть прогулки
        </button>
        <span className="walk-analytics-muted">История за всё время</span>
      </footer>
    </>
  );
}

function StateMetric({
  label,
  metric,
  metricKey,
}: {
  readonly label: string;
  readonly metric: WalkAnalyticsMetric;
  readonly metricKey: string;
}) {
  const observation = walkAnalyticsObservation(metric.sampleSize);
  return (
    <article
      className="walk-analytics-state"
      data-walk-analytics-metric={metricKey}
      aria-label={label}
    >
      <h3>{label}</h3>
      <strong className="walk-analytics-delta">
        {formatWalkAnalyticsValue(metric.averageDelta, true)}
      </strong>
      {metric.sampleSize === 0 ? (
        <p className="walk-analytics-muted">Нет пар оценок</p>
      ) : (
        <>
          <p className="walk-analytics-muted">
            До {formatWalkAnalyticsValue(metric.averageBefore)} → после{' '}
            {formatWalkAnalyticsValue(metric.averageAfter)}
          </p>
          <p className="walk-analytics-muted">{walkAnalyticsSample(metric.sampleSize)}</p>
        </>
      )}
      {observation === null ? null : <p className="walk-analytics-observation">{observation}</p>}
    </article>
  );
}

function DailyChart({ analytics }: { readonly analytics: WalkAnalytics }) {
  const maximum = Math.max(1, ...analytics.days.map((day) => day.count));
  const middle = analytics.days[Math.floor(analytics.days.length / 2)]!;
  return (
    <section className="walk-analytics-panel" aria-labelledby="walk-analytics-days-title">
      <div className="walk-analytics-section-heading">
        <h2 id="walk-analytics-days-title">Прогулки по дням</h2>
        <span className="walk-analytics-muted">Максимум за день: {maximum}</span>
      </div>
      <ol
        className="walk-analytics-day-bars"
        aria-label="Количество прогулок по дням"
        style={{ gridTemplateColumns: `repeat(${analytics.days.length}, minmax(0, 1fr))` }}
      >
        {analytics.days.map((day) => (
          <li
            key={day.date}
            data-walk-analytics-day={day.date}
            aria-label={`${walkAnalyticsDate(day.date)}: ${day.count}`}
            title={`${walkAnalyticsDate(day.date)}: ${day.count}`}
          >
            <span aria-hidden="true" style={{ height: `${(day.count / maximum) * 100}%` }} />
          </li>
        ))}
      </ol>
      <div className="walk-analytics-chart-labels" aria-hidden="true">
        <span>{walkAnalyticsDate(analytics.startDate)}</span>
        <span>{walkAnalyticsDate(middle.date)}</span>
        <span>{walkAnalyticsDate(analytics.endDate)}</span>
      </div>
    </section>
  );
}
