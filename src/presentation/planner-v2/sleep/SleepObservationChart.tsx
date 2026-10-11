import { useMemo, useState } from 'react';
import {
  summarizeSleepObservations,
  isConfirmedSleepObservation,
  timeInBedMilliseconds,
  type SleepObservation,
} from '../../../domain/sleep/SleepObservation';
import type { NightCycle } from '../../../domain/sleep/SleepSchedule';
import { selectSleepChartDays, type SleepChartPeriod } from './sleepObservationChartModel';
import { morningFeedbackLabels } from './sleepMorningFeedbackModel';

export function SleepObservationChart({
  observations,
  plans,
  loading,
  error,
  endCycleDate,
  onRecord,
  onRetry,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
}: {
  readonly observations: readonly SleepObservation[];
  readonly plans: readonly NightCycle[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly endCycleDate: string;
  readonly onRecord?: () => void;
  readonly onRetry?: () => void;
  readonly timeZone?: string;
}) {
  const [period, setPeriod] = useState<SleepChartPeriod>(7);
  const days = useMemo(
    () => selectSleepChartDays(observations, period, endCycleDate),
    [observations, period, endCycleDate],
  );
  const selected = days.flatMap(({ observation }) =>
    observation && isConfirmedSleepObservation(observation) ? [observation] : [],
  );
  const planByDate = useMemo(() => new Map(plans.map((plan) => [plan.cycleDate, plan])), [plans]);

  if (loading) {
    return (
      <section
        className="sleep-observation-chart sleep-observation-chart--state"
        aria-live="polite"
      >
        <p>Загружаем наблюдения…</p>
      </section>
    );
  }
  if (error) {
    return (
      <section className="sleep-observation-chart sleep-observation-chart--state">
        <p role="alert">{error}</p>
        {onRetry ? (
          <button type="button" onClick={onRetry}>
            Повторить загрузку
          </button>
        ) : null}
      </section>
    );
  }

  const summary = summarizeSleepObservations(selected);
  return (
    <section className="sleep-observation-chart" aria-labelledby="sleep-chart-title">
      <header className="sleep-observation-chart__header">
        <div>
          <p className="planner-eyebrow">
            {dateLabel(days.at(-1)!.cycleDate)} — {dateLabel(endCycleDate)}
          </p>
          <h2 id="sleep-chart-title">Режим сна</h2>
          <p>
            {summary.averageTimeInBedMinutes === null
              ? 'Сохраните ночь, чтобы увидеть фактическое время в постели.'
              : `Среднее время в постели: ${durationLabel(summary.averageTimeInBedMinutes)}`}
          </p>
        </div>
        <div className="planner-segments" aria-label="Период графика">
          {([7, 30] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
            >
              {value} дней
            </button>
          ))}
        </div>
      </header>
      {selected.length === 0 && onRecord ? (
        <button type="button" className="planner-button" onClick={onRecord}>
          Записать сон
        </button>
      ) : null}

      <div className="sleep-observation-chart__desktop" aria-hidden="true">
        <div className="sleep-observation-chart__axis">
          <span>18:00</span>
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
        </div>
        <svg
          viewBox={`0 0 100 ${days.length * 15 + 5}`}
          preserveAspectRatio="none"
          style={{ height: `calc(${days.length} * var(--space-6))` }}
        >
          {days.map(({ cycleDate, observation }, index) => {
            const y = index * 15 + 4;
            const fact =
              observation && isConfirmedSleepObservation(observation)
                ? intervalBar(observation.wentToBedAt, observation.wokeAt, observation.timeZone)
                : null;
            const plan = planByDate.get(cycleDate);
            const planned = plan
              ? intervalBar(
                  plan.plannedSleepAt,
                  plan.plannedWakeAt,
                  observation?.timeZone ?? timeZone,
                )
              : null;
            return (
              <g key={cycleDate}>
                <line
                  x1="0"
                  x2="100"
                  y1={y + 3}
                  y2={y + 3}
                  className="sleep-observation-chart__gap"
                />
                {planned ? (
                  <rect
                    className="sleep-observation-chart__plan"
                    x={planned.x}
                    y={y}
                    width={planned.width}
                    height="7"
                    rx="2"
                  />
                ) : null}
                {fact ? (
                  <rect
                    className="sleep-observation-chart__fact"
                    x={fact.x}
                    y={y + 2}
                    width={fact.width}
                    height="3"
                    rx="1.5"
                  />
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      <ul className="sleep-observation-chart__mobile">
        {days.map(({ cycleDate, observation }) => {
          const plan = planByDate.get(cycleDate);
          const feedback = morningFeedbackLabels(observation?.morningFeedback);
          const confirmed =
            observation !== null && isConfirmedSleepObservation(observation) ? observation : null;
          return (
            <li key={cycleDate}>
              <time dateTime={cycleDate}>{dateLabel(cycleDate)}</time>
              <div>
                {confirmed ? (
                  <strong>
                    Факт: {timeRange(confirmed.wentToBedAt, confirmed.wokeAt, confirmed.timeZone)}
                  </strong>
                ) : (
                  <span>
                    {observation
                      ? observation.wentToBedAt === null && observation.wokeAt === null
                        ? 'Время сна не записано'
                        : 'Не подтверждено'
                      : 'Нет записи'}
                  </span>
                )}
                <span>
                  {plan
                    ? `План: ${timeRange(plan.plannedSleepAt, plan.plannedWakeAt, observation?.timeZone ?? timeZone)}`
                    : confirmed
                      ? 'План для этой ночи недоступен'
                      : ''}
                </span>
                {confirmed ? (
                  <small>
                    Время в постели: {durationLabel(timeInBedMilliseconds(confirmed) / 60_000)}
                  </small>
                ) : null}
                {feedback.sleepQuality ? (
                  <small>Качество сна: {feedback.sleepQuality}</small>
                ) : null}
                {feedback.energy ? <small>Утром: {feedback.energy}</small> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function intervalBar(start: Date, end: Date, timeZone: string): { x: number; width: number } {
  const startMinute = scaleMinute(start, timeZone);
  let endMinute = scaleMinute(end, timeZone);
  if (endMinute <= startMinute) endMinute += 24 * 60;
  const scaleStart = 18 * 60;
  const scaleDuration = 18 * 60;
  const x = clamp(((startMinute - scaleStart) / scaleDuration) * 100, 0, 100);
  const endX = clamp(((endMinute - scaleStart) / scaleDuration) * 100, 0, 100);
  return { x, width: Math.max(1, endX - x) };
}

function scaleMinute(value: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const hour = Number(parts.find(({ type }) => type === 'hour')?.value);
  const minute = Number(parts.find(({ type }) => type === 'minute')?.value);
  const total = hour * 60 + minute;
  return total < 12 * 60 ? total + 24 * 60 : total;
}

function timeRange(start: Date, end: Date, timeZone: string): string {
  return `${timeLabel(start, timeZone)}–${timeLabel(end, timeZone)}`;
}

function timeLabel(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(value);
}

function dateLabel(cycleDate: string): string {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(
    new Date(`${cycleDate}T12:00:00.000Z`),
  );
}

function durationLabel(minutes: number): string {
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${hours} ч ${remainder} мин`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
