import { PlanningActionDetails } from './PlanningActionDetails';
import { editPlannerField, plannerFieldState, type PlannerFieldDraft } from './plannerActionDraft';
import { useState, type ReactNode } from 'react';
import type { Goal, LifeAction } from '../../domain';
import { VoiceField } from '../voice-input/VoiceField';
import { VoiceTextInput } from '../voice-input/VoiceTextInput';
import { EntityContextMenu, type EntityMenuAction } from './EntityContextMenu';
import {
  actionViewLabels,
  filterPlannerActions,
  isOpenAction,
  type ActionView,
} from './plannerCatalogModel';

export interface PlannerActionOperations {
  readonly busy: boolean;
  readonly onComplete: (id: string) => void;
  readonly onPlan: (id: string, date: string, main?: boolean) => Promise<void>;
  readonly onLink: (id: string, goalId: string) => Promise<void>;
  readonly menuForAction?: (action: LifeAction) => readonly EntityMenuAction[];
  readonly onReopen?: ((id: string) => Promise<void>) | undefined;
  readonly onEdit?:
    ((action: LifeAction, title: string, description: string) => Promise<void>) | undefined;
  readonly onUnlink?: ((id: string) => Promise<void>) | undefined;
}
export function PlannerActionList({
  actions,
  goals,
  today,
  onNew,
  selectedId,
  viewSwitcher,
  ...operations
}: PlannerActionOperations & {
  readonly actions: readonly LifeAction[];
  readonly goals: readonly Goal[];
  readonly today: string;
  readonly onNew: () => void;
  readonly selectedId: string | null;
  readonly viewSwitcher?: ReactNode;
}) {
  const [view, setView] = useState<ActionView>('open');
  const [search, setSearch] = useState('');
  const visible = filterPlannerActions(actions, view, search, today);
  const selected = selectedId ? actions.find((a) => a.id.toString() === selectedId) : null;
  const children = selectedId
    ? actions.filter(
        (action) => action.parentActionId?.toString() === selectedId && !action.isArchived(),
      )
    : [];
  if (selectedId)
    return (
      <section>
        <a className="planner-text-link" href="#/v2/actions">
          ← Все действия
        </a>
        {selected ? (
          <>
            <h1 className="planner-detail-title">{selected.title.toString()}</h1>
            <PlannerActionRow action={selected} goals={goals} {...operations} expanded />
            {(selected.status === 'draft' || selected.status === 'ready') && operations.onEdit && (
              <PlannerActionEdit
                key={`${selected.id.toString()}:${selected.version}`}
                action={selected}
                onSave={operations.onEdit}
              />
            )}
            <PlanningActionDetails action={selected} today={today} />
            {selected.parentActionId ? (
              <div className="planner-inline-actions">
                <a
                  className="planner-text-link"
                  href={`#/v2/actions/${encodeURIComponent(selected.parentActionId.toString())}`}
                >
                  Открыть родительское действие
                </a>
                {operations.onUnlink && (
                  <button
                    type="button"
                    disabled={operations.busy}
                    onClick={() => {
                      void operations.onUnlink?.(selected.id.toString());
                    }}
                  >
                    Убрать из поддействий
                  </button>
                )}
              </div>
            ) : (
              <section className="planner-subactions" aria-label="Поддействия">
                <h2>
                  Поддействия · {children.filter((action) => action.status === 'completed').length}{' '}
                  / {children.length} выполнено
                </h2>
                {children.length ? (
                  <ul className="planner-list">
                    {children.map((action) => (
                      <li key={action.id.toString()}>
                        <PlannerActionRow
                          action={action}
                          goals={goals}
                          {...operations}
                          lazyDetails
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="planner-empty">Пока нет поддействий.</p>
                )}
                <a
                  className="planner-text-link"
                  href={`#/v2/actions/new?${new URLSearchParams({ parentActionId: selected.id.toString(), ...(selected.goalId ? { goalId: selected.goalId.toString() } : {}) })}`}
                >
                  + Добавить поддействие
                </a>
              </section>
            )}
          </>
        ) : (
          <p className="planner-empty">Действие не найдено или находится в архиве.</p>
        )}
      </section>
    );
  return (
    <section>
      <header className="planner-page-heading">
        <h1>Действия</h1>
        <button
          type="button"
          className="planner-add-icon"
          aria-label="Новое действие"
          onClick={onNew}
        >
          +
        </button>
      </header>
      {viewSwitcher}
      <div className="planner-toolbar">
        <VoiceField>
          <span>Поиск действий</span>
          <VoiceTextInput
            id="actions-search"
            value={search}
            onValueChange={setSearch}
            placeholder="Найти действие"
          />
        </VoiceField>
        <label>
          <span>Показать</span>
          <select value={view} onChange={(e) => setView(e.target.value as ActionView)}>
            {Object.entries(actionViewLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      {visible.length === 0 && (
        <div className="planner-empty">
          <p>
            {search
              ? `По запросу «${search}» ничего не найдено.`
              : 'В этом списке пока нет действий.'}
          </p>
          {(view !== 'open' || search) && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setView('open');
              }}
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      )}
      <ul className="planner-list">
        {visible.map((action) => (
          <li key={action.id.toString()}>
            <PlannerActionRow action={action} goals={goals} {...operations} />
          </li>
        ))}
      </ul>
    </section>
  );
}
function PlannerActionEdit({
  action,
  onSave,
}: {
  readonly action: LifeAction;
  readonly onSave: (action: LifeAction, title: string, description: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(action.title.toString());
  const [description, setDescription] = useState(action.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <details className="planner-action-edit">
      <summary>Редактировать действие</summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError(null);
          void onSave(action, title, description)
            .catch((reason: unknown) =>
              setError(reason instanceof Error ? reason.message : 'Не удалось сохранить действие.'),
            )
            .finally(() => setBusy(false));
        }}
      >
        <label>
          <span>Название</span>
          <input
            value={title}
            required
            maxLength={200}
            disabled={busy}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          <span>Описание</span>
          <textarea
            value={description}
            disabled={busy}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <button type="submit" disabled={busy || !title.trim()}>
          Сохранить
        </button>
        {error && (
          <p role="alert" className="planner-error">
            {error}
          </p>
        )}
      </form>
    </details>
  );
}
export function PlannerActionRow({
  action,
  goals,
  busy,
  onComplete,
  onPlan,
  onLink,
  menuForAction,
  expanded = false,
  lazyDetails = false,
  goalContext = false,
  recurrenceLabel,
}: PlannerActionOperations & {
  readonly action: LifeAction;
  readonly goals: readonly Goal[];
  readonly expanded?: boolean;
  readonly lazyDetails?: boolean;
  readonly goalContext?: boolean;
  readonly recurrenceLabel?: string | null;
}) {
  const [detailsOpen, setDetailsOpen] = useState(expanded);
  const [dateDraft, setDateDraft] = useState<PlannerFieldDraft | null>(null);
  const [goalDraft, setGoalDraft] = useState<PlannerFieldDraft | null>(null);
  const savedDate = action.plannedDate?.toString() ?? '';
  const savedGoal = action.goalId?.toString() ?? '';
  const dateState = plannerFieldState(dateDraft, savedDate);
  const goalState = plannerFieldState(goalDraft, savedGoal);
  const date = dateState.value;
  const goalId = goalState.value;
  const conflict = dateState.conflict || goalState.conflict;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const goal = goals.find((g) => g.id.toString() === action.goalId?.toString());
  const goalNext = goalContext
    ? goal?.nextActionId
      ? goal.nextActionId.equals(action.id)
      : action.isNext
    : false;
  const run = async (work: () => Promise<void>, clear: () => void) => {
    if (pending || conflict) return;
    setPending(true);
    setError(null);
    try {
      await work();
      clear();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить.');
    } finally {
      setPending(false);
    }
  };
  return (
    <EntityContextMenu
      title={action.title.toString()}
      entityLabel="действие"
      actions={menuForAction?.(action) ?? []}
    >
      <div className="planner-action-item">
        <div
          className={`planner-action-row${action.status === 'completed' ? ' planner-action-row--completed' : ''}`}
        >
          <input
            className="planner-check"
            type="checkbox"
            checked={action.status === 'completed'}
            disabled={busy || pending || !isOpenAction(action)}
            aria-label={`Выполнить: ${action.title.toString()}`}
            onChange={() => onComplete(action.id.toString())}
          />
          <div className="planner-action-copy">
            <a
              className="planner-action-title"
              href={`#/v2/actions/${encodeURIComponent(action.id.toString())}`}
            >
              {action.title.toString()}
            </a>
            {!goalContext && (
              <span className="planner-muted">
                {goal?.title ?? (action.goalId ? 'Связанная цель недоступна' : 'Без цели')}
              </span>
            )}
            <span className="planner-muted">
              {action.plannedDate?.toString() ?? 'Без даты'}
              {goalContext && action.priority === 'high' ? ' · Высокий приоритет' : ''}
              {goalContext && action.occurrence
                ? recurrenceLabel
                  ? ` · ${recurrenceLabel}`
                  : action.occurrence.manualDate
                    ? ' · Повтор · перенесено'
                    : ' · Повтор'
                : ''}
              {goalNext ? ' · Следующее' : !goalContext && action.isNext ? ' · Главное' : ''}
              {action.status === 'completed' ? ' · Выполнено' : ''}
              {action.status === 'cancelled' ? ' · Отменено' : ''}
            </span>
          </div>
        </div>
        <details
          className="planner-row-details"
          open={expanded || undefined}
          onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
        >
          <summary>Открыть и изменить</summary>
          {(!lazyDetails || detailsOpen) && (
            <>
              {conflict && (
                <div className="planner-error" role="alert">
                  <p>
                    Действие изменилось на другом экране или устройстве. Обновите поля перед
                    сохранением.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setDateDraft(null);
                      setGoalDraft(null);
                      setError(null);
                    }}
                  >
                    Загрузить актуальные поля
                  </button>
                </div>
              )}
              {action.description && <p className="planner-action-note">{action.description}</p>}
              {action.completedAt && (
                <p className="planner-muted">
                  Выполнено: {action.completedAt.toLocaleString('ru')}
                </p>
              )}
              {action.actualResult && (
                <p className="planner-action-note">Результат: {action.actualResult.toString()}</p>
              )}
              <div className="planner-form-columns">
                {(isOpenAction(action) || action.status === 'completed') && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(
                        () => onPlan(action.id.toString(), date),
                        () => setDateDraft(null),
                      );
                    }}
                  >
                    <label>
                      <span>Дата</span>
                      <input
                        type="date"
                        aria-label={`Плановая дата: ${action.title.toString()}`}
                        value={date}
                        onChange={(e) =>
                          setDateDraft((d) => editPlannerField(d, savedDate, e.target.value))
                        }
                        disabled={busy || pending || conflict}
                      />
                    </label>
                    <div className="planner-inline-actions">
                      <button disabled={busy || pending || conflict} type="submit">
                        Сохранить дату
                      </button>
                      <button
                        disabled={busy || pending || conflict}
                        type="button"
                        onClick={() => {
                          void run(
                            () => onPlan(action.id.toString(), ''),
                            () => setDateDraft(null),
                          );
                        }}
                      >
                        Без даты
                      </button>
                    </div>
                  </form>
                )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(
                      () => onLink(action.id.toString(), goalId),
                      () => setGoalDraft(null),
                    );
                  }}
                >
                  <label>
                    <span>Цель</span>
                    <select
                      aria-label={`Цель действия: ${action.title.toString()}`}
                      value={goalId}
                      onChange={(e) =>
                        setGoalDraft((d) => editPlannerField(d, savedGoal, e.target.value))
                      }
                      disabled={busy || pending || conflict}
                    >
                      <option value="">Без цели</option>
                      {goalId && !goals.some((g) => g.id.toString() === goalId) && (
                        <option value={goalId}>Связанная цель недоступна</option>
                      )}
                      {goals.map((g) => (
                        <option key={g.id.toString()} value={g.id.toString()}>
                          {g.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button disabled={busy || pending || conflict} type="submit">
                    Сохранить связь
                  </button>
                </form>
              </div>
              {error && (
                <p role="alert" className="planner-error">
                  {error}
                </p>
              )}
            </>
          )}
        </details>
      </div>
    </EntityContextMenu>
  );
}
