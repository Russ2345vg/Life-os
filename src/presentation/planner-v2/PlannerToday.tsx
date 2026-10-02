import { RecurrenceBadge } from './RecurrenceBadge';
import { ActionGoalProgress } from './ActionGoalProgress';
import { useQuickAccessGuard } from './QuickAccessContext';
import { AppIcon } from '../components/AppIcon';
import { PlannerScenariosPanel, type ScenarioService } from './PlannerScenariosPanel';
import { PlannerOverdueActions } from './PlannerOverdueActions';
import { selectRepeatedPlanActions } from './plannerPlanReviewModel';
import type { ReactNode } from 'react';
import {
  selectActionOptions,
  type ActionSelection,
} from '../../application/planner/actionSelection';
import { usePlanning } from './PlanningContext';
import { PlanningActionDetails } from './PlanningActionDetails';
import { useRef, useState } from 'react';
import type { PlannerTodayOverview } from '../../application';
import type { DayDate, LifeAction } from '../../domain';
import { VoiceTextInput } from '../voice-input/VoiceTextInput';
import type { PlannerOption } from './PlannerActionForm';
import { EntityContextMenu, type EntityMenuAction } from './EntityContextMenu';
import type { SleepTodayEntry } from '../../application/sleep/SleepTodayEntry';
import { buildTimeScheduleDay } from '../../application/queries/GetTimeSchedule';
import { clockTime, durationLabel } from './timePresentation';
import {
  MonthlyDirectionFocusCard,
  type MonthlyDirectionFocusView,
} from './MonthlyDirectionFocusCard';

export function PlannerToday({
  date,
  day,
  overview,
  goals,
  directions = [],
  spheres = [],
  availableActions,
  monthlyDirectionFocus,
  busy,
  onSelectDay,
  onOpenAction,
  onMonthlyDirectionChange,
  onComplete,
  onPlan,
  onReschedule,
  onSelectAction,
  onQuickAdd,
  onNewAction,
  onOpenSleep,
  onOpenGoalGuidance,
  sleepEntry,
  scenarios,
  menuForAction,
  capacityMinutes = null,
}: {
  readonly date: DayDate;
  readonly day: 'today' | 'tomorrow';
  readonly overview: PlannerTodayOverview;
  readonly goals: readonly PlannerOption[];
  readonly directions?: readonly PlannerOption[];
  readonly spheres?: readonly PlannerOption[];
  readonly availableActions: readonly LifeAction[];
  readonly monthlyDirectionFocus: MonthlyDirectionFocusView;
  readonly busy: boolean;
  readonly onSelectDay: (day: 'today' | 'tomorrow') => void;
  readonly onOpenAction: (id: string) => void;
  readonly onMonthlyDirectionChange: (id: string | null) => void;
  readonly onComplete: (id: string) => void;
  readonly onSelectAction?: (selection: ActionSelection) => void;
  readonly onPlan: (id: string, main: boolean) => void;
  readonly onReschedule: (id: string, date: string) => Promise<void>;
  readonly onQuickAdd: (title: string) => Promise<void>;
  readonly onNewAction: () => void;
  readonly onOpenSleep: () => void;
  readonly onOpenGoalGuidance?: () => void;
  readonly sleepEntry?: SleepTodayEntry;
  readonly scenarios?: ScenarioService | undefined;
  readonly menuForAction?: (action: LifeAction) => readonly EntityMenuAction[];
  readonly capacityMinutes?: number | null;
}) {
  const [title, setTitle] = useState('');
  const [reviewed, setReviewed] = useState<readonly string[]>([]);
  const reviewKey = (action: LifeAction) =>
    `${date.toString()}:${action.id.toString()}:${action.plannedDate?.toString()}:${action.rescheduleCount}`;
  const repeatedActions = selectRepeatedPlanActions(overview).filter(
    (action) => !reviewed.includes(reviewKey(action)),
  );
  const reviewCount = overview.overdue.length + repeatedActions.length;
  const heading = useRef<HTMLHeadingElement>(null);
  const adding = useRef(false);
  useQuickAccessGuard(() => ({ dirty: title !== '', busy: busy || adding.current }));
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const planning = usePlanning();
  const [search, setSearch] = useState('');
  const candidates = selectActionOptions(
    availableActions,
    planning?.state?.rules ?? [],
    search,
  ).filter((option) =>
    option.selection.kind === 'action'
      ? !availableActions.some(
          (a) =>
            a.id.toString() ===
              (option.selection.kind === 'action' ? option.selection.actionId : '') &&
            a.plannedDate?.toString() === date.toString(),
        )
      : !availableActions.some(
          (a) =>
            a.occurrence?.ruleId ===
              (option.selection.kind === 'series' ? option.selection.ruleId : '') &&
            a.plannedDate?.toString() === date.toString() &&
            !a.isArchived() &&
            a.status !== 'cancelled',
        ),
  );

  const total = overview.actions.length + overview.completed.length + (overview.main ? 1 : 0);
  const plannedCount = overview.actions.length + (overview.main ? 1 : 0);
  const schedule = buildTimeScheduleDay(date.toString(), availableActions, capacityMinutes);
  const percent = total ? Math.round((overview.completed.length / total) * 100) : 0;
  const dateLabel = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${date.toString()}T12:00:00`));
  const row = (
    action: LifeAction,
    mode: 'main' | 'today' | 'unscheduled' | 'completed' | 'scenario' | 'overdue',
    extra?: ReactNode,
  ) => {
    const id = action.id.toString();
    const goal = goals.find((item) => item.id === action.goalId?.toString());
    const direction = directions.find(
      (item) => item.id === (goal ? goal.directionId : action.directionId?.toString()),
    );
    const sphere = spheres.find(
      (item) => item.id === (direction?.sphereId ?? goal?.sphereId ?? action.sphereId?.toString()),
    );
    const hasContext = Boolean(sphere || direction);
    const contextId = `planner-action-context-${id}`;
    return (
      <li key={id}>
        <EntityContextMenu
          title={action.title.toString()}
          entityLabel="действие"
          actions={menuForAction?.(action) ?? []}
        >
          <div className={`planner-action-row planner-action-row--${mode}`}>
            <input
              className="planner-check"
              type="checkbox"
              aria-label={`Выполнить: ${action.title.toString()}`}
              checked={mode === 'completed'}
              disabled={busy || mode === 'completed'}
              onChange={() => onComplete(id)}
            />
            <div className="planner-action-copy">
              <button
                className="planner-action-title planner-action-open"
                type="button"
                data-planner-action-id={id}
                aria-label={action.title.toString()}
                aria-describedby={hasContext ? contextId : undefined}
                onClick={() => onOpenAction(id)}
              >
                <span>
                  {action.title.toString()} <RecurrenceBadge action={action} />
                </span>
                <ActionGoalProgress action={action} />
                {goal ? <span className="planner-muted">{goal.title}</span> : null}
                {hasContext ? (
                  <span className="planner-action-context" id={contextId}>
                    {sphere ? (
                      <span>
                        <span className="planner-action-context__label">Сфера</span> {sphere.title}
                      </span>
                    ) : null}
                    {direction ? (
                      <span>
                        <span className="planner-action-context__label">Направление</span>{' '}
                        {direction.title}
                      </span>
                    ) : null}
                  </span>
                ) : null}
                {action.scheduledStartMinute !== null ? (
                  <span className="planner-muted">
                    {clockTime(action.scheduledStartMinute)}–
                    {clockTime(action.scheduledStartMinute + action.scheduledDurationMinutes!)}
                  </span>
                ) : action.estimateMinutes !== null ? (
                  <span className="planner-muted">
                    Оценка: {durationLabel(action.estimateMinutes)}
                  </span>
                ) : null}
                {action.description ? (
                  <span className="planner-action-note">{action.description}</span>
                ) : null}
                {action.actualResult ? (
                  <span className="planner-action-note">{action.actualResult.toString()}</span>
                ) : null}
              </button>
              {mode === 'completed' && extra === undefined && (
                <PlanningActionDetails action={action} today={date.toString()} />
              )}
            </div>
            {extra}
            {mode === 'unscheduled' ? (
              <button type="button" disabled={busy} onClick={() => onPlan(id, false)}>
                {day === 'tomorrow' ? 'На завтра' : 'На сегодня'}
              </button>
            ) : null}
            {mode === 'today' || mode === 'main' ? (
              <button
                type="button"
                className="planner-main-toggle"
                aria-label={
                  mode === 'main'
                    ? `Убрать главный приоритет: ${action.title.toString()}`
                    : `Сделать главным: ${action.title.toString()}`
                }
                aria-pressed={mode === 'main'}
                disabled={busy}
                onClick={() => onPlan(id, mode !== 'main')}
              >
                {mode === 'main' ? '★' : '☆'}
              </button>
            ) : null}
          </div>
        </EntityContextMenu>
      </li>
    );
  };
  return (
    <div className="planner-today planner-today-layout">
      <div className="planner-today-main">
        <header className="planner-page-heading">
          <div>
            <h1 ref={heading} tabIndex={-1}>
              {day === 'tomorrow' ? 'Завтра' : 'Сегодня'}
            </h1>
            <p className="planner-eyebrow">{dateLabel}</p>
            <div className="planner-today-heading-links">
              <a className="planner-text-link" href="#/v2/actions?view=time">
                Рабочее время
              </a>
              {day === 'today' && (
                <a className="planner-text-link" href="#/v2/walks?origin=today">
                  Прогулка
                </a>
              )}
              {day === 'today' && onOpenGoalGuidance ? (
                <button
                  aria-label="Выбрать шаг к цели"
                  className="planner-text-link"
                  type="button"
                  onClick={onOpenGoalGuidance}
                >
                  <span className="planner-today-guidance-label">Выбрать шаг к цели</span>
                  <span className="planner-today-guidance-label--short" aria-hidden="true">
                    Шаг к цели
                  </span>
                </button>
              ) : null}
            </div>
          </div>
          <div className="planner-day-switch" role="group" aria-label="План на день">
            <button
              type="button"
              aria-pressed={day === 'today'}
              onClick={() => onSelectDay('today')}
            >
              Сегодня
            </button>
            <button
              type="button"
              aria-pressed={day === 'tomorrow'}
              onClick={() => onSelectDay('tomorrow')}
            >
              Завтра
            </button>
          </div>
        </header>
        <section
          className="planner-day-workspace"
          aria-label={day === 'tomorrow' ? 'План на завтра' : 'План на сегодня'}
        >
          <header className="planner-day-center__header">
            <div>
              <span className="planner-eyebrow">
                {day === 'tomorrow' ? 'Планирование следующего дня' : 'Центр дня'}
              </span>
              <h2 id="planner-day-center-title">
                {day === 'tomorrow' ? 'План на завтра' : 'План на сегодня'}
              </h2>
            </div>
            <div className="planner-day-center__stats" role="group" aria-label="Состояние плана">
              <span>
                В плане <strong>{plannedCount}</strong>
              </span>
              <span>
                Готово <strong>{overview.completed.length}</strong>
              </span>
            </div>
          </header>
          <section className="planner-quick-create" aria-labelledby="planner-day-center-title">
            {(schedule.timed.length + schedule.untimed.length > 0 || capacityMinutes !== null) && (
              <p
                className={`planner-day-center__capacity ${
                  schedule.overCapacity ? 'planner-error' : 'planner-muted'
                }`}
              >
                План: {durationLabel(schedule.plannedMinutes)} ·{' '}
                {capacityMinutes === null
                  ? 'Доступное время не задано'
                  : `Доступно: ${durationLabel(capacityMinutes)}`}
                {schedule.unknownEstimateCount > 0 && (
                  <> · Без оценки: {schedule.unknownEstimateCount}</>
                )}
                {schedule.overCapacity && <> · План превышает доступное время</>}
              </p>
            )}
            <form
              className="planner-quick-add"
              aria-label={
                day === 'tomorrow' ? 'Быстро добавить на завтра' : 'Быстро добавить на сегодня'
              }
              onSubmit={(event) => {
                event.preventDefault();
                if (adding.current || busy || !title.trim()) return;
                adding.current = true;
                setError(null);
                void onQuickAdd(title)
                  .then(() => setTitle(''))
                  .catch((reason: unknown) =>
                    setError(
                      reason instanceof Error ? reason.message : 'Не удалось добавить действие.',
                    ),
                  )
                  .finally(() => {
                    adding.current = false;
                  });
              }}
            >
              <VoiceTextInput
                id="planner-quick-title"
                aria-label={
                  day === 'tomorrow' ? 'Новое действие на завтра' : 'Новое действие на сегодня'
                }
                placeholder="Что нужно сделать?"
                value={title}
                onValueChange={setTitle}
                readOnly={busy}
                required
                maxLength={200}
              />
              <button className="planner-primary" type="submit" disabled={busy || !title.trim()}>
                Создать
              </button>
              <button type="button" className="planner-quick-options" onClick={onNewAction}>
                Создать с параметрами
              </button>
            </form>
          </section>
          {day === 'tomorrow' && (
            <div className="planner-tomorrow-choose">
              <button
                type="button"
                onClick={() => setChoosing((value) => !value)}
                aria-expanded={choosing}
              >
                + Выбрать существующее действие
              </button>
              {choosing && (
                <div className="planner-tomorrow-candidates">
                  <VoiceTextInput
                    id="tomorrow-action-search"
                    aria-label="Поиск действия"
                    value={search}
                    onValueChange={setSearch}
                  />
                  {candidates.length ? (
                    <ul>
                      {candidates.map((option) => (
                        <li key={option.key}>
                          <span>
                            {option.title} <RecurrenceBadge rule={option.rule} />
                          </span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              if (onSelectAction) onSelectAction(option.selection);
                              else if (option.selection.kind === 'action')
                                onPlan(option.selection.actionId, false);
                              setChoosing(false);
                            }}
                          >
                            На завтра
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="planner-empty">Свободных действий пока нет.</p>
                  )}
                </div>
              )}
            </div>
          )}
          {error ? (
            <p role="alert" className="planner-error">
              {error}
            </p>
          ) : null}
          <PlannerScenariosPanel
            key={date.toString()}
            service={scenarios}
            date={date.toString()}
            actions={availableActions}
            busy={busy}
            renderAction={(action, remove) =>
              row(action, action.status === 'completed' ? 'completed' : 'scenario', remove)
            }
          >
            {overview.main ? (
              <section className="planner-main">
                <h2>Главное действие</h2>
                <ul>{row(overview.main, 'main')}</ul>
              </section>
            ) : null}
            <section className="planner-today-list">
              <h2>
                {day === 'tomorrow' ? 'На завтра' : overview.main ? 'Ещё на сегодня' : 'На сегодня'}{' '}
                <span>{overview.actions.length}</span>
              </h2>
              {overview.actions.length === 0 ? (
                <p className="planner-empty">
                  {overview.main
                    ? 'Остальное можно добавить позже.'
                    : day === 'tomorrow'
                      ? 'На завтра пока ничего не запланировано.'
                      : overview.completed.length
                        ? 'Всё выполнено. Можно спокойно завершить день.'
                        : 'На сегодня пока ничего не запланировано.'}
                </p>
              ) : (
                <ul>{overview.actions.map((action) => row(action, 'today'))}</ul>
              )}
            </section>
            <details className="planner-details planner-completed">
              <summary>
                Выполнено <span>{overview.completed.length}</span>
              </summary>
              {overview.completed.length ? (
                <ul>{overview.completed.map((action) => row(action, 'completed'))}</ul>
              ) : (
                <p className="planner-empty">Здесь появятся действия, выполненные в этот день.</p>
              )}
            </details>
            {overview.unscheduled.length ? (
              <details className="planner-details">
                <summary>
                  Без даты <span>{overview.unscheduled.length}</span>
                </summary>
                <ul>{overview.unscheduled.map((action) => row(action, 'unscheduled'))}</ul>
              </details>
            ) : null}
          </PlannerScenariosPanel>
          {day === 'today' && (
            <details
              className="planner-details planner-plan-review"
              open
              hidden={reviewCount === 0}
            >
              <summary>Разобрать план · {reviewCount} требуют решения</summary>
              <p className="planner-muted">
                На сегодня: {overview.actions.length + (overview.main ? 1 : 0)}.{' '}
                {overview.main
                  ? `Главное: ${overview.main.title.toString()}.`
                  : 'Главное ещё не выбрано: отметьте звёздочкой одно действие в плане.'}
              </p>
              <PlannerOverdueActions
                actions={overview.overdue}
                today={date.toString()}
                busy={busy}
                onReschedule={onReschedule}
                onListResolved={() => heading.current?.focus()}
                renderAction={(action, controls) => row(action, 'overdue', controls)}
              />
              <PlannerOverdueActions
                title="Повторно перенесено на сегодня"
                headingId="planner-repeated-title"
                actions={repeatedActions}
                todayLabel="Оставить на сегодня"
                description="Оставьте на сегодня или выберите новую дату. Подтверждение действует до выхода со страницы."
                today={date.toString()}
                busy={busy}
                onReschedule={async (id, nextDate) => {
                  if (nextDate === date.toString()) {
                    const action = repeatedActions.find((item) => item.id.toString() === id);
                    if (action) setReviewed((keys) => [...keys, reviewKey(action)]);
                  } else await onReschedule(id, nextDate);
                }}
                onListResolved={() => heading.current?.focus()}
                renderAction={(action, controls) => row(action, 'overdue', controls)}
              />
              {repeatedActions.length > 0 ? (
                <p className="planner-muted">
                  Счётчик учитывает переносы подготовленных действий. Изменения дат черновиков в
                  него не входят.
                </p>
              ) : null}
            </details>
          )}
        </section>
      </div>
      <aside className="planner-today-sidebar" aria-label="Обзор дня">
        <MonthlyDirectionFocusCard
          value={monthlyDirectionFocus}
          busy={busy}
          onChange={onMonthlyDirectionChange}
        />
        <section className="planner-day-progress">
          <h2>Прогресс дня</h2>
          <div hidden={!total}>
            <strong>
              {overview.completed.length} из {total}
            </strong>
            <span>{total ? `${percent}%` : 'Пока нет плана'}</span>
          </div>
          {total > 0 && <progress max={100} value={percent} aria-label="Прогресс дня" />}
          {total === 0 && <div className="planner-progress-empty" aria-hidden="true" />}
          <p className="planner-muted">
            {total
              ? `${total - overview.completed.length} осталось · ${overview.completed.length} выполнено`
              : 'Добавьте первое действие — здесь появится прогресс дня.'}
          </p>
        </section>
        <section className="planner-day-shortcuts">
          <h2>Быстрые действия</h2>
          <button type="button" onClick={() => onSelectDay(day === 'today' ? 'tomorrow' : 'today')}>
            <AppIcon name="today" />
            {day === 'today' ? 'Планировать завтра' : 'Вернуться к сегодня'}
          </button>
          <a href="#/v2/inbox">
            <AppIcon name="history" />
            Открыть входящие →
          </a>
          <a href="#/v2/actions?view=calendar">
            <AppIcon name="today" />
            Открыть календарь →
          </a>
        </section>
        {day === 'today' ? (
          <button
            className={`planner-sleep-entry${sleepEntry?.active ? ' planner-sleep-entry--active' : ''}`}
            type="button"
            onClick={onOpenSleep}
          >
            <span className="planner-sleep-entry__icon" aria-hidden="true">
              ☾
            </span>
            <span>
              <strong>Подготовка ко сну</strong>
              <small>
                {sleepEntry?.active
                  ? 'Вечерняя подготовка уже доступна'
                  : 'Настроить вечерний список и отметить готовность'}
              </small>
            </span>
            <span aria-hidden="true">→</span>
          </button>
        ) : null}
      </aside>
    </div>
  );
}
