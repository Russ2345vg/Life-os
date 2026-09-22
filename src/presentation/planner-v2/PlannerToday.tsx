import { RecurrenceBadge } from './RecurrenceBadge';
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

export function PlannerToday({
  date,
  day,
  overview,
  goals,
  availableActions,
  mainDirectionId,
  directionChoices,
  busy,
  onSelectDay,
  onOpenAction,
  onMainDirection,
  onComplete,
  onPlan,
  onSelectAction,
  onQuickAdd,
  onNewAction,
  onOpenSleep,
  menuForAction,
}: {
  readonly date: DayDate;
  readonly day: 'today' | 'tomorrow';
  readonly overview: PlannerTodayOverview;
  readonly goals: readonly PlannerOption[];
  readonly availableActions: readonly LifeAction[];
  readonly mainDirectionId: string | null;
  readonly directionChoices: readonly PlannerOption[];
  readonly busy: boolean;
  readonly onSelectDay: (day: 'today' | 'tomorrow') => void;
  readonly onOpenAction: (id: string) => void;
  readonly onMainDirection: (id: string | null) => void;
  readonly onComplete: (id: string) => void;
  readonly onSelectAction?: (selection: ActionSelection) => void;
  readonly onPlan: (id: string, main: boolean) => void;
  readonly onQuickAdd: (title: string) => Promise<void>;
  readonly onNewAction: () => void;
  readonly onOpenSleep: () => void;
  readonly menuForAction?: (action: LifeAction) => readonly EntityMenuAction[];
}) {
  const [title, setTitle] = useState('');
  const adding = useRef(false);
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
  const percent = total ? Math.round((overview.completed.length / total) * 100) : 0;
  const dateLabel = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${date.toString()}T12:00:00`));
  const row = (action: LifeAction, mode: 'main' | 'today' | 'unscheduled' | 'completed') => {
    const id = action.id.toString();
    const goal = goals.find((item) => item.id === action.goalId?.toString());
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
                aria-label={action.title.toString()}
                onClick={() => onOpenAction(id)}
              >
                <span>
                  {action.title.toString()} <RecurrenceBadge action={action} />
                </span>
                {goal ? <span className="planner-muted">{goal.title}</span> : null}
                {action.description ? (
                  <span className="planner-action-note">{action.description}</span>
                ) : null}
                {action.actualResult ? (
                  <span className="planner-action-note">{action.actualResult.toString()}</span>
                ) : null}
              </button>
              {mode === 'completed' && (
                <PlanningActionDetails action={action} today={date.toString()} />
              )}
            </div>
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
            <h1>{day === 'tomorrow' ? 'Завтра' : 'Сегодня'}</h1>
            <p className="planner-eyebrow">{dateLabel}</p>
          </div>
        </header>
        <div className="planner-day-switch" role="group" aria-label="План на день">
          <button type="button" aria-pressed={day === 'today'} onClick={() => onSelectDay('today')}>
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
        <section className="planner-main-direction">
          <label htmlFor="planner-main-direction">
            <span>Главное направление</span>
          </label>
          <select
            id="planner-main-direction"
            value={mainDirectionId ?? ''}
            disabled={busy}
            onChange={(event) => onMainDirection(event.target.value || null)}
          >
            <option value="">Не выбрано</option>
            {mainDirectionId && !directionChoices.some((item) => item.id === mainDirectionId) ? (
              <option value={mainDirectionId}>Недоступное направление</option>
            ) : null}
            {directionChoices.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </section>
        <form
          className="planner-quick-add"
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
            placeholder={
              day === 'tomorrow' ? 'Добавить действие на завтра' : 'Добавить действие на сегодня'
            }
            value={title}
            onValueChange={setTitle}
            readOnly={busy}
            required
            maxLength={200}
          />
          <button className="planner-primary" type="submit" disabled={busy || !title.trim()}>
            Добавить
          </button>
          <button
            type="button"
            className="planner-quick-options"
            onClick={onNewAction}
            aria-label="Открыть форму нового действия"
            title="Параметры нового действия"
          >
            ⋯
          </button>
        </form>
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
      </div>
      <aside className="planner-today-sidebar" aria-label="Обзор дня">
        <section className="planner-day-progress">
          <h2>Прогресс дня</h2>
          <div>
            <strong>
              {overview.completed.length} из {total}
            </strong>
            <span>{total ? `${percent}%` : 'Пока нет плана'}</span>
          </div>
          <progress max={100} value={percent} aria-label="Прогресс дня" />
          <p className="planner-muted">
            {total - overview.completed.length} осталось · {overview.completed.length} выполнено
          </p>
        </section>
        <section className="planner-day-shortcuts">
          <h2>Быстрые действия</h2>
          <button type="button" onClick={() => onSelectDay(day === 'today' ? 'tomorrow' : 'today')}>
            {day === 'today' ? 'Планировать завтра' : 'Вернуться к сегодня'}
          </button>
          <a href="#/v2/inbox">Открыть входящие →</a>
          <a href="#/v2/actions?view=calendar">Открыть календарь →</a>
        </section>
        {day === 'today' ? (
          <button className="planner-sleep-entry" type="button" onClick={onOpenSleep}>
            <span className="planner-sleep-entry__icon" aria-hidden="true">
              ☾
            </span>
            <span>
              <strong>Подготовка ко сну</strong>
              <small>Настроить вечерний список и отметить готовность</small>
            </span>
            <span aria-hidden="true">→</span>
          </button>
        ) : null}
      </aside>
    </div>
  );
}
