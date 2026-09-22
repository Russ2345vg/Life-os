import { RecurrenceBadge } from './RecurrenceBadge';
import { PlanningActionDetails } from './PlanningActionDetails';
import { editPlannerField, plannerFieldState, type PlannerFieldDraft } from './plannerActionDraft';
import { useState, type ReactNode } from 'react';
import type { Direction, Goal, LifeAction, Sphere } from '../../domain';
import { VoiceField } from '../voice-input/VoiceField';
import { VoiceTextInput } from '../voice-input/VoiceTextInput';
import { EntityContextMenu, type EntityMenuAction } from './EntityContextMenu';
import {
  actionViewLabels,
  filterPlannerActions,
  groupPlannerActions,
  isOpenAction,
  type ActionView,
} from './plannerCatalogModel';
import { selectRecurringActionRepresentatives } from '../../application/planner/actionSelection';

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
  directions = [],
  spheres = [],
  today,
  onNew,
  selectedId,
  viewSwitcher,
  initialView = 'open',
  ...operations
}: PlannerActionOperations & {
  readonly actions: readonly LifeAction[];
  readonly goals: readonly Goal[];
  readonly directions?: readonly Direction[];
  readonly spheres?: readonly Sphere[];
  readonly today: string;
  readonly onNew: () => void;
  readonly selectedId: string | null;
  readonly viewSwitcher?: ReactNode;
  readonly initialView?: ActionView;
}) {
  const [view, setView] = useState<ActionView>(initialView);
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [goalFilter, setGoalFilter] = useState('');
  const [directionFilter, setDirectionFilter] = useState('');
  const [sphereFilter, setSphereFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sort, setSort] = useState<'date' | 'title'>('date');
  const visible = filterPlannerActions(actions, view, search, today).filter(
    (action) =>
      (!goalFilter || action.goalId?.toString() === goalFilter) &&
      (!directionFilter ||
        (!action.goalId && action.directionId?.toString() === directionFilter) ||
        goals.some(
          (g) =>
            g.id.toString() === action.goalId?.toString() &&
            g.directionId?.toString() === directionFilter,
        )) &&
      (!sphereFilter ||
        (!action.goalId &&
          (
            directions.find((d) => d.id.toString() === action.directionId?.toString())?.sphereId ??
            action.sphereId
          )?.toString() === sphereFilter) ||
        goals.some(
          (g) =>
            g.id.toString() === action.goalId?.toString() &&
            (
              g.sphereId ??
              directions.find((d) => d.id.toString() === g.directionId?.toString())?.sphereId
            )?.toString() === sphereFilter,
        )) &&
      (!overdueOnly ||
        (action.plannedDate !== null &&
          action.plannedDate.toString() < today &&
          isOpenAction(action))),
  );
  if (sort === 'title')
    visible.sort((a, b) => a.title.toString().localeCompare(b.title.toString(), 'ru'));
  const activeActions = selectRecurringActionRepresentatives(visible.filter(isOpenAction));
  const completedActions = visible.filter((action) => action.status === 'completed');
  const activeGroups = groupPlannerActions(activeActions, today);
  const completedGroups = groupPlannerActions(completedActions, today);
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
            <RecurrenceBadge action={selected} />
            <p className="planner-muted">
              {(() => {
                const goal = goals.find((g) => g.id.toString() === selected.goalId?.toString());
                const direction = directions.find(
                  (d) =>
                    d.id.toString() ===
                    (goal ? goal.directionId : selected.directionId)?.toString(),
                );
                return [
                  spheres.find(
                    (s) =>
                      s.id.toString() ===
                      (direction?.sphereId ?? goal?.sphereId ?? selected.sphereId)?.toString(),
                  )?.name,
                  direction?.name,
                  goal?.title,
                ]
                  .filter(Boolean)
                  .join(' / ');
              })()}
            </p>
            <PlannerActionRow
              action={selected}
              goals={goals}
              directions={directions}
              spheres={spheres}
              {...operations}
              expanded
            />
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
                          directions={directions}
                          spheres={spheres}
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
          className="planner-primary"
          aria-label="Новое действие"
          onClick={onNew}
        >
          + Новое действие
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
        <button
          type="button"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          Фильтр{goalFilter || directionFilter || sphereFilter || overdueOnly ? ' •' : ''}
        </button>
      </div>
      <div className="planner-segments" role="group" aria-label="Показать действия">
        {Object.entries(actionViewLabels).map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={view === value}
            onClick={() => setView(value as ActionView)}
          >
            {label}
          </button>
        ))}
      </div>
      {filtersOpen && (
        <section className="planner-filter-panel" aria-label="Фильтры действий">
          {spheres.length > 0 && (
            <label>
              <span>Сфера</span>
              <select
                value={sphereFilter}
                onChange={(event) => setSphereFilter(event.target.value)}
              >
                <option value="">Все сферы</option>
                {spheres.map((s) => (
                  <option key={s.id.toString()} value={s.id.toString()}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {directions.length > 0 && (
            <label>
              <span>Направление</span>
              <select
                value={directionFilter}
                onChange={(event) => setDirectionFilter(event.target.value)}
              >
                <option value="">Все направления</option>
                {directions.map((d) => (
                  <option key={d.id.toString()} value={d.id.toString()}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            <span>Цель</span>
            <select value={goalFilter} onChange={(event) => setGoalFilter(event.target.value)}>
              <option value="">Все цели</option>
              {goals.map((goal) => (
                <option key={goal.id.toString()} value={goal.id.toString()}>
                  {goal.title}
                </option>
              ))}
            </select>
          </label>
          <label className="planner-check-label">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(event) => setOverdueOnly(event.target.checked)}
            />
            Только просроченные
          </label>
          <label>
            <span>Сортировка</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as 'date' | 'title')}
            >
              <option value="date">По дате</option>
              <option value="title">По названию</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              setGoalFilter('');
              setDirectionFilter('');
              setSphereFilter('');
              setOverdueOnly(false);
              setSort('date');
            }}
          >
            Сбросить
          </button>
        </section>
      )}
      {visible.length === 0 && (
        <div className="planner-empty">
          <p>
            {search
              ? `По запросу «${search}» ничего не найдено.`
              : 'В этом списке пока нет действий.'}
          </p>
          {(view !== 'open' ||
            search ||
            goalFilter ||
            directionFilter ||
            sphereFilter ||
            overdueOnly) && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setView('open');
                setGoalFilter('');
                setDirectionFilter('');
                setSphereFilter('');
                setOverdueOnly(false);
              }}
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      )}
      <div className="planner-actions-catalog" aria-label="Список действий">
        {activeGroups.map(
          (group) =>
            group.actions.length > 0 && (
              <section
                className="planner-action-group"
                key={group.key}
                aria-labelledby={`planner-action-group-${group.key}`}
              >
                <h2 id={`planner-action-group-${group.key}`}>
                  {group.label} <span>{group.actions.length}</span>
                </h2>
                <ul className="planner-list">
                  {group.actions.map((action) => (
                    <li key={action.id.toString()}>
                      <PlannerActionRow
                        action={action}
                        goals={goals}
                        directions={directions}
                        spheres={spheres}
                        catalogMode
                        today={today}
                        {...operations}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ),
        )}
        {completedActions.length > 0 && (
          <section className="planner-action-group planner-action-group--completed">
            <h2>Выполненные</h2>
            {completedGroups.map(
              (group) =>
                group.actions.length > 0 && (
                  <section
                    className="planner-action-group planner-action-group--completed-subgroup"
                    key={group.key}
                    aria-labelledby={`planner-completed-group-${group.key}`}
                  >
                    <h3 id={`planner-completed-group-${group.key}`}>{group.label}</h3>
                    <ul className="planner-list">
                      {group.actions.map((action) => (
                        <li key={action.id.toString()}>
                          <PlannerActionRow
                            action={action}
                            goals={goals}
                            directions={directions}
                            spheres={spheres}
                            catalogMode
                            {...operations}
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                ),
            )}
          </section>
        )}
      </div>
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
  directions = [],
  spheres = [],
  busy,
  onComplete,
  onPlan,
  onLink,
  menuForAction,
  expanded = false,
  lazyDetails = false,
  goalContext = false,
  recurrenceLabel,
  catalogMode = false,
  today,
}: PlannerActionOperations & {
  readonly action: LifeAction;
  readonly goals: readonly Goal[];
  readonly directions?: readonly Direction[];
  readonly spheres?: readonly Sphere[];
  readonly expanded?: boolean;
  readonly lazyDetails?: boolean;
  readonly goalContext?: boolean;
  readonly recurrenceLabel?: string | null;
  readonly catalogMode?: boolean;
  readonly today?: string;
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
  const direction = directions.find(
    (d) => d.id.toString() === (goal ? goal.directionId : action.directionId)?.toString(),
  );
  const sphere = spheres.find(
    (s) =>
      s.id.toString() === (direction?.sphereId ?? goal?.sphereId ?? action.sphereId)?.toString(),
  );
  const context = [sphere?.name, direction?.name, goal?.title].filter(Boolean).join(' / ');
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
          className={`planner-action-row${action.status === 'completed' ? ' planner-action-row--completed' : ''}${catalogMode ? ' planner-action-row--catalog' : ''}`}
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
            {catalogMode ? (
              <div className="planner-action-meta">
                <span>{context || (action.goalId ? 'Связанная цель недоступна' : 'Без цели')}</span>
                <span
                  className={
                    today && savedDate && savedDate < today && isOpenAction(action)
                      ? 'planner-due planner-due--overdue'
                      : 'planner-due'
                  }
                >
                  {today && savedDate === today ? 'Сегодня' : savedDate || 'Без даты'}
                </span>
                {action.priority && <span>{priorityLabel(action.priority)}</span>}
                <RecurrenceBadge action={action} label={recurrenceLabel} />
                {(goalNext || action.isNext) && <span>{goalNext ? 'Следующее' : 'Главное'}</span>}
                {action.status === 'completed' && <span>Выполнено</span>}
                {action.status === 'cancelled' && <span>Отменено</span>}
              </div>
            ) : (
              <>
                {!goalContext && (
                  <span className="planner-muted">
                    {context || (action.goalId ? 'Связанная цель недоступна' : 'Без цели')}
                  </span>
                )}
                <span className="planner-muted">
                  {action.plannedDate?.toString() ?? 'Без даты'}
                  {goalContext && action.priority === 'high' ? ' · Высокий приоритет' : ''}

                  {goalNext ? ' · Следующее' : !goalContext && action.isNext ? ' · Главное' : ''}
                  {action.status === 'completed' ? ' · Выполнено' : ''}
                  {action.status === 'cancelled' ? ' · Отменено' : ''}
                </span>
                <RecurrenceBadge action={action} label={recurrenceLabel} />
              </>
            )}
          </div>
        </div>
        {!catalogMode && (
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
        )}
      </div>
    </EntityContextMenu>
  );
}

function priorityLabel(priority: NonNullable<LifeAction['priority']>): string {
  return priority === 'high'
    ? 'Высокий приоритет'
    : priority === 'low'
      ? 'Низкий приоритет'
      : 'Обычный приоритет';
}
