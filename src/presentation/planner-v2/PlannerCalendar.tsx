import { useState } from 'react';
import { PlannerActionRow } from './PlannerActionList';
import {
  calendarMonthDays,
  plannerDateLabel,
  shiftCalendarMonth,
  type PlannerViews,
} from './plannerViewsModel';
import { PlannerBatch, PlannerGoalCard, type PlannerViewOperations } from './PlannerViewParts';
import { PlannerTimeCalendar } from './PlannerTimeCalendar';

export function PlannerCalendar({
  data,
  today,
  onSetTime,
  capacity,
  onSetCapacity,
  ...operations
}: PlannerViewOperations & {
  readonly data: PlannerViews;
  readonly today: string;
  readonly capacity: readonly (number | null)[];
  readonly onSetTime: (
    id: string,
    estimateMinutes: number | null,
    scheduledStartMinute: number | null,
    scheduledDurationMinutes: number | null,
    expectedVersion: number,
  ) => Promise<void>;
  readonly onSetCapacity: (weekday: number, minutes: number | null) => Promise<void>;
}) {
  const [mode, setMode] = useState<'week' | 'day' | 'month'>('week');
  return (
    <section aria-label="Календарь">
      <div className="planner-time-modes" aria-label="Масштаб календаря">
        {(['week', 'day', 'month'] as const).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={mode === item}
            onClick={() => setMode(item)}
          >
            {{ week: 'Неделя', day: 'День', month: 'Месяц' }[item]}
          </button>
        ))}
      </div>
      {mode === 'month' ? (
        <PlannerMonthCalendar data={data} today={today} {...operations} />
      ) : (
        <PlannerTimeCalendar
          data={data}
          today={today}
          mode={mode}
          busy={operations.busy}
          capacity={capacity}
          onSetTime={onSetTime}
          onSetCapacity={onSetCapacity}
          onOpenAction={operations.onOpenAction}
        />
      )}
    </section>
  );
}

function PlannerMonthCalendar({
  data,
  today,
  ...operations
}: PlannerViewOperations & {
  readonly data: PlannerViews;
  readonly today: string;
}) {
  const [selected, setSelected] = useState(today);
  const [undated, setUndated] = useState(false);
  const month = selected.slice(0, 7);
  const goals = data.goalsByDate.get(selected) ?? [];
  const actions = data.actionsByDate.get(selected) ?? [];
  return (
    <section aria-label="Календарь">
      <header className="planner-calendar-heading">
        <h2>{plannerDateLabel(selected, { month: 'long', year: 'numeric' })}</h2>
        <div className="planner-calendar-controls">
          <button
            type="button"
            aria-label="Предыдущий месяц"
            onClick={() => setSelected(shiftCalendarMonth(selected, -1))}
          >
            ‹
          </button>
          <button type="button" onClick={() => setSelected(today)}>
            Сегодня
          </button>
          <button
            type="button"
            aria-label="Следующий месяц"
            onClick={() => setSelected(shiftCalendarMonth(selected, 1))}
          >
            ›
          </button>
        </div>
      </header>
      <div className="planner-calendar-layout">
        <div className="planner-month" aria-label="Дни месяца">
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => (
            <span className="planner-weekday" key={day}>
              {day}
            </span>
          ))}
          {calendarMonthDays(selected).map((date) => {
            const deadlines = data.goalsByDate.get(date) ?? [];
            const items = data.actionsByDate.get(date) ?? [];
            return (
              <button
                type="button"
                key={date}
                className={`planner-calendar-day${date.slice(0, 7) !== month ? ' planner-calendar-day--outside' : ''}`}
                aria-label={`${plannerDateLabel(date)}: ${items.length} действий${deadlines.length ? `, ${deadlines.length} целей` : ''}`}
                aria-pressed={date === selected}
                aria-current={date === today ? 'date' : undefined}
                onClick={() => setSelected(date)}
              >
                <span className="planner-day-number">{Number(date.slice(-2))}</span>
                {items.length + deadlines.length > 0 && (
                  <span className="planner-day-count">{items.length + deadlines.length}</span>
                )}
                <span className="planner-day-preview" aria-hidden="true">
                  {items.slice(0, 2).map((a) => (
                    <span
                      key={a.id.toString()}
                      className={a.status === 'completed' ? 'planner-calendar-completed' : ''}
                    >
                      {a.status === 'completed' ? '✓ ' : ''}
                      {a.title.toString()}
                    </span>
                  ))}
                  {items.length > 2 && <span>+{items.length - 2}</span>}
                </span>
              </button>
            );
          })}
        </div>
        <section className="planner-day-agenda" aria-label="Выбранный день">
          <h3>{plannerDateLabel(selected, { weekday: 'short', day: 'numeric', month: 'long' })}</h3>
          <p className="planner-muted" role="status">
            Действий: {actions.length}
          </p>
          {!actions.length && !goals.length && (
            <p className="planner-empty">
              На этот день ничего не запланировано. Выберите дату у существующего действия.
            </p>
          )}
          {goals.map((goal) => (
            <PlannerGoalCard key={goal.id.toString()} goal={goal} data={data} {...operations} />
          ))}
          <PlannerBatch
            key={selected}
            items={actions}
            render={(a) => (
              <PlannerActionRow
                key={a.id.toString()}
                action={a}
                goals={data.goals}
                directions={data.directions}
                lazyDetails
                {...operations}
              />
            )}
          />
          <a className="planner-text-link" href="#/v2/actions/new">
            + Добавить действие
          </a>
        </section>
      </div>
      <details
        className="planner-undated"
        onToggle={(event) => setUndated(event.currentTarget.open)}
      >
        <summary>
          Без даты · {data.undatedActions.length} действий · {data.undatedGoals.length} целей
        </summary>
        {undated && (
          <>
            <p className="planner-muted">
              Дату можно выбрать позже. Горизонт цели не назначает день в календаре.
            </p>
            <PlannerBatch
              items={data.undatedActions}
              render={(a) => (
                <PlannerActionRow
                  key={a.id.toString()}
                  action={a}
                  goals={data.goals}
                  directions={data.directions}
                  lazyDetails
                  {...operations}
                />
              )}
            />
            <PlannerBatch
              items={data.undatedGoals}
              render={(goal) => (
                <PlannerGoalCard key={goal.id.toString()} goal={goal} data={data} {...operations} />
              )}
            />
            {!data.undatedActions.length && !data.undatedGoals.length && (
              <p className="planner-empty">Все элементы с датой доступны в календаре.</p>
            )}
          </>
        )}
      </details>
    </section>
  );
}
