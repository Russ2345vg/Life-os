import { useEffect, useState, type CSSProperties, type FormEvent, type MouseEvent } from 'react';
import { DayDate, type LifeAction } from '../../domain';
import type {
  DayAutopilotService,
  AutopilotDaySchedule,
} from '../../application/planner/DayAutopilotService';
import {
  buildTimeScheduleDay,
  suggestFreeTimeStarts,
} from '../../application/queries/GetTimeSchedule';
import { PlannerSheet } from './PlannerSheet';
import { plannerDateLabel, type PlannerViews } from './plannerViewsModel';
import { PlannerActionTimeSheet } from './PlannerActionTimeSheet';
import { clockTime, durationLabel } from './timePresentation';
import './planner-time-calendar.css';

interface Props {
  readonly autopilot?: Pick<DayAutopilotService, 'readSchedule'> | undefined;
  readonly data: PlannerViews;
  readonly today: string;
  readonly mode: 'week' | 'day';
  readonly busy: boolean;
  readonly capacity: readonly (number | null)[];
  readonly onSetTime: (
    id: string,
    estimateMinutes: number | null,
    scheduledStartMinute: number | null,
    scheduledDurationMinutes: number | null,
    expectedVersion: number,
  ) => Promise<void>;
  readonly onSetCapacity: (weekday: number, minutes: number | null) => Promise<void>;
  readonly onOpenAction?: ((id: string) => void) | undefined;
}

function shiftDays(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function weekday(date: string): number {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}

export function PlannerTimeCalendar({
  data,
  today,
  mode,
  busy,
  capacity,
  onSetTime,
  onSetCapacity,
  onOpenAction,
  autopilot,
}: Props) {
  const [selected, setSelected] = useState(today);
  const [editing, setEditing] = useState<LifeAction | null>(null);
  const [capacityOpen, setCapacityOpen] = useState(false);
  const [capacityDraft, setCapacityDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [suggestedFor, setSuggestedFor] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placementError, setPlacementError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<readonly AutopilotDaySchedule[]>([]);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const weekStart = shiftDays(selected, -weekday(selected));
  const dates = Array.from({ length: 7 }, (_, index) => shiftDays(weekStart, index));
  const visibleDates = mode === 'week' ? dates : [selected];
  const from = visibleDates[0]!,
    to = visibleDates.at(-1)!;
  useEffect(() => {
    let cancelled = false;
    if (autopilot)
      void autopilot
        .readSchedule(DayDate.create(from), DayDate.create(to))
        .then((value) => {
          if (!cancelled) {
            setSchedule(value);
            setScheduleError(null);
          }
        })
        .catch((reason: unknown) => {
          if (!cancelled) {
            setSchedule([]);
            setScheduleError(
              reason instanceof Error ? reason.message : 'Не удалось прочитать распорядок.',
            );
          }
        });
    return () => {
      cancelled = true;
    };
  }, [from, to, autopilot, data.actions]);
  const days = new Map(
    visibleDates.map((date) => [
      date,
      buildTimeScheduleDay(
        date,
        data.actions,
        capacity[weekday(date)] ?? null,
        schedule.find((day) => day.date === date)?.blocks,
      ),
    ]),
  );
  const selectedDay = buildTimeScheduleDay(
    selected,
    data.actions,
    capacity[weekday(selected)] ?? null,
    schedule.find((day) => day.date === selected)?.blocks,
  );
  const allTimed = [...days.values()].flatMap((day) => day.timed);
  const allRoutine = [...days.values()].flatMap((day) => day.blocks);
  const startHour = Math.min(
    7,
    ...allRoutine.map((block) => Math.floor(block.startMinute / 60)),
    ...allTimed.map((action) => Math.max(0, Math.floor(action.scheduledStartMinute! / 60) - 1)),
  );
  const endHour = Math.max(
    21,
    ...allRoutine.map((block) => Math.ceil(block.endMinute / 60)),
    ...allTimed.map((action) =>
      Math.min(
        24,
        Math.ceil((action.scheduledStartMinute! + action.scheduledDurationMinutes!) / 60) + 1,
      ),
    ),
  );
  const gridHeight = (endHour - startHour) * 48;
  const goals = data.goalsByDate.get(selected) ?? [];
  const now = new Date();
  const earliestMinute = selected === today ? now.getHours() * 60 + now.getMinutes() : 420;

  const openTime = (action: LifeAction) => {
    setEditing(action);
  };
  const placeInWindow = async (action: LifeAction, start: number) => {
    if (placing || busy || action.estimateMinutes === null) return;
    setPlacing(true);
    setPlacementError(null);
    try {
      await onSetTime(
        action.id.toString(),
        action.estimateMinutes,
        start,
        action.estimateMinutes,
        action.version,
      );
      setSuggestedFor(null);
    } catch (reason: unknown) {
      setPlacementError(reason instanceof Error ? reason.message : 'Не удалось назначить время.');
    } finally {
      setPlacing(false);
    }
  };
  const openAction = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (
      !onOpenAction ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    onOpenAction(id);
  };
  const saveCapacity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const hours = Number(capacityDraft);
    const minutes = Math.round(hours * 60);
    if (!Number.isFinite(hours) || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      setError('Укажите от 15 минут до 24 часов.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSetCapacity(weekday(selected), minutes);
      setCapacityOpen(false);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить доступное время.');
    } finally {
      setSaving(false);
    }
  };
  const clearCapacity = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSetCapacity(weekday(selected), null);
      setCapacityOpen(false);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Не удалось убрать настройку.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="planner-time">
      {scheduleError && (
        <p className="planner-error" role="alert">
          {scheduleError}
        </p>
      )}
      <header className="planner-time-heading">
        <div>
          <h2>{mode === 'week' ? 'Расписание недели' : 'Расписание дня'}</h2>
          <p className="planner-muted">
            {mode === 'week'
              ? `${plannerDateLabel(dates[0]!)} — ${plannerDateLabel(dates[6]!)}`
              : plannerDateLabel(selected, { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="planner-calendar-controls">
          <button
            type="button"
            aria-label={mode === 'week' ? 'Предыдущая неделя' : 'Предыдущий день'}
            onClick={() => setSelected(shiftDays(selected, mode === 'week' ? -7 : -1))}
          >
            ‹
          </button>
          <button type="button" onClick={() => setSelected(today)}>
            Сегодня
          </button>
          <button
            type="button"
            aria-label={mode === 'week' ? 'Следующая неделя' : 'Следующий день'}
            onClick={() => setSelected(shiftDays(selected, mode === 'week' ? 7 : 1))}
          >
            ›
          </button>
        </div>
      </header>
      <div className="planner-time-layout">
        <section
          className={`planner-time-calendar${mode === 'day' ? ' planner-time-calendar--day' : ''}`}
          aria-label={mode === 'week' ? 'Расписание недели' : 'Расписание дня'}
        >
          <div className="planner-time-dates">
            {dates.map((date) => (
              <button
                type="button"
                key={date}
                aria-pressed={date === selected}
                aria-current={date === today ? 'date' : undefined}
                aria-label={`${plannerDateLabel(date)}: ${(() => {
                  const schedule = buildTimeScheduleDay(
                    date,
                    data.actions,
                    capacity[weekday(date)] ?? null,
                  );
                  return schedule.timed.length + schedule.untimed.length;
                })()} действий`}
                onClick={() => setSelected(date)}
              >
                <span>{plannerDateLabel(date, { weekday: 'short' })}</span>
                <strong>{Number(date.slice(-2))}</strong>
              </button>
            ))}
          </div>
          <div
            className="planner-time-grid"
            style={{ '--time-columns': mode === 'day' ? 1 : 7 } as CSSProperties}
          >
            <div className="planner-time-axis" style={{ height: gridHeight }} aria-hidden="true">
              {Array.from({ length: endHour - startHour + 1 }, (_, index) => (
                <span key={index} style={{ top: index * 48 }}>
                  {clockTime((startHour + index) * 60)}
                </span>
              ))}
            </div>
            {visibleDates.map((date) => {
              const day = days.get(date)!;
              return (
                <div
                  key={date}
                  className={`planner-time-column${date === selected ? ' planner-time-column--selected' : ''}`}
                  style={{ height: gridHeight }}
                  aria-label={plannerDateLabel(date)}
                >
                  {day.blocks.map((block) => (
                    <div
                      key={block.id}
                      aria-hidden="true"
                      className={`planner-time-block planner-time-block--routine${day.conflictIds.has(block.id) ? ' planner-time-block--conflict' : ''}`}
                      style={{
                        top: ((block.startMinute - startHour * 60) / 60) * 48,
                        height: Math.max(2, ((block.endMinute - block.startMinute) / 60) * 48),
                      }}
                    >
                      <span>{clockTime(block.startMinute)}</span>
                      {block.endMinute - block.startMinute >= 30 && <strong>{block.title}</strong>}
                    </div>
                  ))}
                  {day.timed.map((action) => {
                    const interactive = action.scheduledDurationMinutes! >= 60;
                    const Block = interactive ? 'button' : 'div';
                    const position: CSSProperties = {
                      top: ((action.scheduledStartMinute! - startHour * 60) / 60) * 48,
                      height: (action.scheduledDurationMinutes! / 60) * 48 - (interactive ? 3 : 0),
                    };
                    return (
                      <Block
                        {...(interactive ? { type: 'button' as const } : { 'aria-hidden': true })}
                        key={action.id.toString()}
                        className={`planner-time-block${!interactive ? ' planner-time-block--short' : ''}${action.priority === 'high' ? ' planner-time-block--priority' : ''}${day.conflictIds.has(action.id.toString()) ? ' planner-time-block--conflict' : ''}`}
                        style={position}
                        onClick={
                          interactive
                            ? () => {
                                setSelected(date);
                                openTime(action);
                              }
                            : undefined
                        }
                        {...(interactive
                          ? { disabled: busy || action.status === 'completed' }
                          : {})}
                        aria-label={`${action.title}, ${clockTime(action.scheduledStartMinute!)}–${clockTime(action.scheduledStartMinute! + action.scheduledDurationMinutes!)}`}
                      >
                        <span>
                          {clockTime(action.scheduledStartMinute!)} ·{' '}
                          {durationLabel(action.scheduledDurationMinutes!)}
                        </span>
                        <strong>{action.title.toString()}</strong>
                      </Block>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>
        <aside className="planner-time-context" aria-label="Сведения о выбранном дне">
          {selectedDay.blocks.length > 0 && (
            <details className="planner-time-routine-list" open>
              <summary>Распорядок и отдых</summary>
              <ul>
                {selectedDay.blocks.map((block) => (
                  <li key={block.id}>
                    <time>
                      {clockTime(block.startMinute)}–{clockTime(block.endMinute)}
                    </time>
                    <span>
                      {block.title}
                      {selectedDay.conflictIds.has(block.id) ? ' · пересечение' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <section className="planner-time-capacity">
            <p className="planner-time-eyebrow">
              {plannerDateLabel(selected, { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <h3>План дня</h3>
            <p>
              <strong>{durationLabel(selectedDay.plannedMinutes)}</strong> запланировано
              {selectedDay.unknownEstimateCount
                ? ` · ${selectedDay.unknownEstimateCount} без оценки`
                : ''}
            </p>
            {selectedDay.capacityMinutes === null ? (
              <p className="planner-muted">Доступное время не задано</p>
            ) : (
              <>
                <progress
                  max={selectedDay.capacityMinutes}
                  value={Math.min(selectedDay.plannedMinutes, selectedDay.capacityMinutes)}
                  aria-label="Загрузка выбранного дня"
                />
                <p className="planner-muted">
                  Из {durationLabel(selectedDay.capacityMinutes)} доступных
                  {selectedDay.overCapacity
                    ? ` · превышение на ${durationLabel(selectedDay.plannedMinutes - selectedDay.capacityMinutes)}`
                    : ''}
                </p>
              </>
            )}
            <button
              type="button"
              className="planner-text-link"
              onClick={() => {
                setCapacityDraft(
                  selectedDay.capacityMinutes === null
                    ? ''
                    : String(selectedDay.capacityMinutes / 60),
                );
                setCapacityOpen(true);
                setError(null);
              }}
              disabled={busy}
            >
              Настроить доступное время
            </button>
          </section>
          {selectedDay.timed.length > 0 && (
            <section aria-label="Действия по времени">
              <h3>По времени</h3>
              {selectedDay.timed.map((action) => (
                <div className="planner-time-untimed" key={action.id.toString()}>
                  <a
                    href={`#/v2/actions/${encodeURIComponent(action.id.toString())}`}
                    onClick={(event) => openAction(event, action.id.toString())}
                  >
                    {action.title.toString()}
                  </a>
                  <span>
                    {clockTime(action.scheduledStartMinute!)}–
                    {clockTime(action.scheduledStartMinute! + action.scheduledDurationMinutes!)}
                    {action.status === 'completed' ? ' · Выполнено' : ''}
                  </span>
                  {(action.status === 'draft' || action.status === 'ready') && (
                    <button
                      type="button"
                      aria-label={`Изменить время: ${action.title}`}
                      disabled={busy}
                      onClick={() => openTime(action)}
                    >
                      Изменить время
                    </button>
                  )}
                </div>
              ))}
            </section>
          )}
          {selectedDay.conflictIds.size > 0 && (
            <section className="planner-time-conflicts" role="status">
              <h3>Пересечение во времени</h3>
              <p>
                Несколько действий занимают одно окно. Выберите другое время у одного из действий:
              </p>
              {selectedDay.timed
                .filter((action) => selectedDay.conflictIds.has(action.id.toString()))
                .map((action) => (
                  <button type="button" key={action.id.toString()} onClick={() => openTime(action)}>
                    {action.title.toString()}
                  </button>
                ))}
            </section>
          )}
          <section>
            <h3>
              Пока без времени <span className="planner-muted">{selectedDay.untimed.length}</span>
            </h3>
            <p className="planner-muted">
              Действия на выбранный день. Время можно оставить свободным.
            </p>
            {selectedDay.untimed.length === 0 && (
              <p className="planner-empty">
                {selectedDay.timed.length === 0
                  ? 'На этот день нет действий. Создайте действие с датой или выберите другой день.'
                  : 'Все действия дня получили время. Можно выбрать другой день.'}
              </p>
            )}
            {selectedDay.untimed.map((action) => {
              const suggestions =
                suggestedFor === action.id.toString() && action.estimateMinutes !== null
                  ? suggestFreeTimeStarts(selectedDay, action.estimateMinutes, earliestMinute)
                  : [];
              return (
                <div className="planner-time-untimed" key={action.id.toString()}>
                  <a
                    href={`#/v2/actions/${encodeURIComponent(action.id.toString())}`}
                    onClick={(event) => openAction(event, action.id.toString())}
                  >
                    {action.title.toString()}
                  </a>
                  <span>
                    {action.status === 'completed'
                      ? 'Выполнено'
                      : action.estimateMinutes === null
                        ? 'Длительность не задана'
                        : durationLabel(action.estimateMinutes)}
                  </span>
                  {(action.status === 'draft' || action.status === 'ready') && (
                    <>
                      {action.estimateMinutes !== null && (
                        <button
                          type="button"
                          aria-expanded={suggestedFor === action.id.toString()}
                          onClick={() => {
                            setSuggestedFor(
                              suggestedFor === action.id.toString() ? null : action.id.toString(),
                            );
                            setPlacementError(null);
                          }}
                          disabled={busy || placing}
                        >
                          Подобрать окно
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openTime(action)}
                        disabled={busy || placing}
                      >
                        Выбрать время
                      </button>
                      {suggestedFor === action.id.toString() && action.estimateMinutes !== null && (
                        <div
                          className="planner-time-suggestions"
                          aria-label={`Свободные окна: ${action.title}`}
                        >
                          <p className="planner-muted">Ближайшие свободные окна</p>
                          {suggestions.map((start) => (
                            <button
                              type="button"
                              key={start}
                              disabled={busy || placing}
                              onClick={() => void placeInWindow(action, start)}
                            >
                              Поставить {clockTime(start)}–
                              {clockTime(start + action.estimateMinutes!)}
                            </button>
                          ))}
                          {suggestions.length === 0 && (
                            <p className="planner-muted">
                              Подходящих окон до 21:00 нет. Выберите время вручную.
                            </p>
                          )}
                          {placementError && (
                            <p role="alert" className="planner-error">
                              {placementError}
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </section>
          {goals.length > 0 && (
            <section>
              <h3>Сроки целей</h3>
              {goals.map((goal) => (
                <a
                  className="planner-time-goal"
                  href={`#/v2/goals/${encodeURIComponent(goal.id.toString())}`}
                  key={goal.id.toString()}
                >
                  {goal.title}
                </a>
              ))}
            </section>
          )}
        </aside>
      </div>
      <details className="planner-undated">
        <summary>Без даты · {data.undatedActions.length} действий</summary>
        <p className="planner-muted">Назначьте дату в действии, чтобы увидеть его в расписании.</p>
        {data.undatedActions.map((action) => (
          <a
            className="planner-time-goal"
            href={`#/v2/actions/${encodeURIComponent(action.id.toString())}`}
            onClick={(event) => openAction(event, action.id.toString())}
            key={action.id.toString()}
          >
            {action.title.toString()}
          </a>
        ))}
      </details>
      {editing && (
        <PlannerActionTimeSheet
          action={editing}
          onSave={onSetTime}
          onClose={() => setEditing(null)}
        />
      )}
      {capacityOpen && (
        <PlannerSheet
          title="Доступное время"
          onClose={() => {
            if (!saving) setCapacityOpen(false);
          }}
        >
          <form className="planner-time-form" onSubmit={(event) => void saveCapacity(event)}>
            <h2>Доступное время</h2>
            <p className="planner-muted">
              {plannerDateLabel(selected, { weekday: 'long' })}: укажите чистое время для действий
              после обычных перерывов. Настройка повторяется каждую неделю.
            </p>
            <label>
              Часов в этот день недели{' '}
              <input
                type="number"
                min="0.25"
                max="24"
                step="0.25"
                value={capacityDraft}
                disabled={saving}
                onChange={(event) => setCapacityDraft(event.target.value)}
                required
              />
            </label>
            {error && (
              <p role="alert" className="planner-error">
                {error}
              </p>
            )}
            <div className="planner-time-form-actions">
              {selectedDay.capacityMinutes !== null && (
                <button type="button" onClick={() => void clearCapacity()} disabled={saving}>
                  Убрать настройку
                </button>
              )}
              <button type="button" onClick={() => setCapacityOpen(false)} disabled={saving}>
                Отмена
              </button>
              <button type="submit" className="planner-primary" disabled={saving}>
                Сохранить
              </button>
            </div>
          </form>
        </PlannerSheet>
      )}
    </div>
  );
}
