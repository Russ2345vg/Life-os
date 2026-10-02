import { useEffect, useState } from 'react';
import type { WalkServices } from '../../../application/walk/WalkServices';
import type { WalkAnalyticsResult } from '../../../application/walk/WalkAnalytics';
import { describeWalkInsights } from '../../../application/walk/WalkInsights';
import { addDays } from '../../../domain/planner/PlanningPeriod';
import { walkError } from './useWalkState';
export function WalkAnalyticsView({
  services,
  today,
  onOpen,
  compact = false,
}: {
  services: WalkServices;
  today: string;
  onOpen: (id: string) => void;
  compact?: boolean;
}) {
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const [value, setValue] = useState<WalkAnalyticsResult | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    const refresh = () => {
      void services.analytics
        .get(from, to)
        .then((next) => {
          if (!disposed) {
            setValue(next);
            setError('');
          }
        })
        .catch((failure: unknown) => {
          if (!disposed) setError(walkError(failure));
        });
    };
    refresh();
    const off = services.changes.subscribe(refresh);
    return () => {
      disposed = true;
      off();
    };
  }, [services, from, to]);
  return (
    <section>
      <h2>{compact ? 'За последние 7 дней' : 'Ритм прогулок'}</h2>
      {!compact && (
        <>
          <div className="walk-start-actions">
            {[7, 30, 90].map((days) => (
              <button
                key={days}
                onClick={() => {
                  setFrom(addDays(today, 1 - days));
                  setTo(today);
                }}
              >
                {days} дней
              </button>
            ))}
          </div>
          <div className="walk-history-filters">
            <label>
              С<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label>
              По
              <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </label>
          </div>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {!value ? (
        <p role="status">Считаем прогулки…</p>
      ) : (
        <>
          <div className="walk-week">
            <div>
              <strong>{value.completedCount}</strong>
              <span>прогулок</span>
            </div>
            <div>
              <strong>{Math.round(value.durationMs / 60000)}</strong>
              <span>минут</span>
            </div>
          </div>
          {!compact && (
            <>
              <p>
                Дней с прогулками: {value.activeDays}. Медиана:{' '}
                {value.medianDurationMs === null
                  ? '—'
                  : `${Math.round(value.medianDurationMs / 60000)} мин`}
                . Прервано: {value.abandonedCount}.
              </p>
              <div className="walk-chart" aria-label="Минуты по дням">
                {value.days.map((day) => (
                  <div key={day.date}>
                    <span>{day.date}</span>
                    <meter
                      min={0}
                      max={Math.max(1, ...value.days.map((d) => d.durationMs))}
                      value={day.durationMs}
                      aria-label={`${day.date}: ${Math.round(day.durationMs / 60000)} минут`}
                    />
                    <strong>{Math.round(day.durationMs / 60000)} мин</strong>
                  </div>
                ))}
              </div>
              <details>
                <summary>Таблица по дням</summary>
                <table>
                  <thead>
                    <tr>
                      <th>Дата</th>
                      <th>Прогулки</th>
                      <th>Минуты</th>
                    </tr>
                  </thead>
                  <tbody>
                    {value.days.map((day) => (
                      <tr key={day.date}>
                        <td>{day.date}</td>
                        <td>{day.count}</td>
                        <td>{Math.round(day.durationMs / 60000)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
              <h3>Наблюдения по оценкам</h3>
              {value.pairedCount < 5 ? (
                <p>Пока мало оценок для сравнения — {value.pairedCount} из 5 пар.</p>
              ) : (
                <div>
                  {describeWalkInsights(value).map((insight) => (
                    <p key={insight.kind}>
                      {insight.kind === 'energy'
                        ? 'Энергия'
                        : insight.kind === 'tension'
                          ? 'Напряжение'
                          : 'Ясность'}
                      :{' '}
                      {insight.direction === 'increased'
                        ? 'рост'
                        : insight.direction === 'decreased'
                          ? 'снижение'
                          : 'без изменения'}{' '}
                      в среднем на {Math.abs(insight.meanChange).toFixed(1)} в {insight.sampleSize}{' '}
                      прогулках с оценками до и после.
                    </p>
                  ))}
                  <p>Это описание ваших записей, а не причина изменений.</p>
                </div>
              )}
              <details>
                <summary>Прогулки, вошедшие в расчёт ({value.sourceIds.length})</summary>
                {value.sourceIds.map((id, i) => (
                  <button key={id} onClick={() => onOpen(id)}>
                    Открыть прогулку {i + 1}
                    {value.pairedSourceIds.includes(id) ? ' · есть пара оценок' : ''}
                  </button>
                ))}
              </details>
            </>
          )}
        </>
      )}
    </section>
  );
}
