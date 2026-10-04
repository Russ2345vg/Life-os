import { useMemo, useState } from 'react';
import {
  summarizeSleepObservations,
  timeInBedMilliseconds,
  type SleepObservation,
} from '../../../domain/sleep/SleepObservation';
import type { NightCycle } from '../../../domain/sleep/SleepSchedule';
import { selectChartObservations, type SleepChartPeriod } from './sleepObservationChartModel';

export function SleepObservationChart({
  observations,
  plans,
  loading,
  error,
}: {
  readonly observations: readonly SleepObservation[];
  readonly plans: readonly NightCycle[];
  readonly loading: boolean;
  readonly error: string | null;
}) {
  const [period, setPeriod] = useState<SleepChartPeriod>(7);
  const selected = useMemo(
    () => selectChartObservations(observations, period),
    [observations, period],
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
      </section>
    );
  }
  if (selected.length === 0) {
    return (
      <section className="sleep-observation-chart sleep-observation-chart--state">
        <h2>Режим сна</h2>
        <p>График появится после первой подтверждённой ночи.</p>
      </section>
    );
  }

  const summary = summarizeSleepObservations(selected);
  return (
    <section className="sleep-observation-chart" aria-labelledby="sleep-chart-title">
      <header className="sleep-observation-chart__header">
        <div>
          <p className="planner-eyebrow">Подтверждённые наблюдения</p>
          <h2 id="sleep-chart-title">Режим сна</h2>
          <p>
            {summary.averageTimeInBedMinutes === null
              ? 'Недостаточно данных'
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

      <div className="sleep-observation-chart__desktop" aria-hidden="true">
        <div className="sleep-observation-chart__axis">
          <span>18:00</span>
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
        </div>
        <svg viewBox={`0 0 100 ${selected.length * 15 + 5}`} preserveAspectRatio="none">
          {selected.map((observation, index) => {
            const y = index * 15 + 4;
            const fact = intervalBar(
              observation.wentToBedAt,
              observation.wokeAt,
              observation.timeZone,
            );
            const plan = planByDate.get(observation.cycleDate);
            const planned = plan
              ? intervalBar(plan.plannedSleepAt, plan.plannedWakeAt, observation.timeZone)
              : null;
            return (
              <g key={observation.id}>
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
                <rect
                  className="sleep-observation-chart__fact"
                  x={fact.x}
                  y={y + 2}
                  width={fact.width}
                  height="3"
                  rx="1.5"
                />
              </g>
            );
          })}
        </svg>
      </div>

      <ul className="sleep-observation-chart__mobile">
        {selected.map((observation) => {
          const plan = planByDate.get(observation.cycleDate);
          return (
            <li key={observation.id}>
              <time dateTime={observation.cycleDate}>{dateLabel(observation.cycleDate)}</time>
              <div>
                <strong>
                  Факт:{' '}
                  {timeRange(observation.wentToBedAt, observation.wokeAt, observation.timeZone)}
                </strong>
                <span>
                  {plan
                    ? `План: ${timeRange(plan.plannedSleepAt, plan.plannedWakeAt, observation.timeZone)}`
                    : 'План для этой ночи недоступен'}
                </span>
                <small>
                  Время в постели: {durationLabel(timeInBedMilliseconds(observation) / 60_000)}
                </small>
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
