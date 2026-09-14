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
  onQuickAdd,
  onNewAction,
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
  readonly onPlan: (id: string, main: boolean) => void;
  readonly onQuickAdd: (title: string) => Promise<void>;
  readonly onNewAction: () => void;
  readonly menuForAction?: (action: LifeAction) => readonly EntityMenuAction[];
}) {
  const [title, setTitle] = useState('');
  const adding = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const candidates = availableActions.filter(
    (action) =>
      !action.isArchived() &&
      action.status === 'draft' &&
      action.plannedDate?.toString() !== date.toString(),
  );
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
                onClick={() => onOpenAction(id)}
              >
                {action.title.toString()}
              </button>
              {goal ? <span className="planner-muted">{goal.title}</span> : null}
              {mode === 'completed' && (
                <PlanningActionDetails action={action} today={date.toString()} />
              )}
              {action.description ? (
                <p className="planner-action-note">{action.description}</p>
              ) : null}
              {action.actualResult ? (
                <p className="planner-action-note">{action.actualResult.toString()}</p>
              ) : null}
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
    <div className="planner-today">
      <header className="planner-page-heading">
        <div>
          <p className="planner-eyebrow">{dateLabel}</p>
          <h1>{day === 'tomorrow' ? 'Завтра' : 'Сегодня'}</h1>
        </div>
        <button
          type="button"
          className="planner-add-icon"
          onClick={onNewAction}
          aria-label="Открыть форму нового действия"
        >
          +
        </button>
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
              setError(reason instanceof Error ? reason.message : 'Не удалось добавить действие.'),
            )
            .finally(() => {
              adding.current = false;
            });
        }}
      >
        <VoiceTextInput
          id="planner-quick-title"
          aria-label={day === 'tomorrow' ? 'Новое действие на завтра' : 'Новое действие на сегодня'}
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
              {candidates.length ? (
                <ul>
                  {candidates.map((action) => (
                    <li key={action.id.toString()}>
                      <span>{action.title.toString()}</span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          onPlan(action.id.toString(), false);
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
          <p className="planner-empty">Здесь появятся выполненные сегодня действия.</p>
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
  );
}
