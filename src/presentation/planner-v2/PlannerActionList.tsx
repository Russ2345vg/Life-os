import { resolveActionNeed } from '../../domain/planner/resolveEntityNeed';
import { EntityNeedText } from './EntityNeedText';
import { NeedPicker } from './NeedPicker';
import { plannerDisplayDate } from './plannerDisplayDate';
import { QuickAccessGuardScope, useQuickAccessGuard } from './QuickAccessContext';
import { RecurrenceBadge } from './RecurrenceBadge';
import { ActionGoalProgress } from './ActionGoalProgress';
import { PlanningActionDetails } from './PlanningActionDetails';
import { editPlannerField, plannerFieldState, type PlannerFieldDraft } from './plannerActionDraft';
import { useRef, useState, type ReactNode } from 'react';
import type { Direction, Goal, LifeAction, Sphere } from '../../domain';
import { VoiceField } from '../voice-input/VoiceField';
import { VoiceTextInput } from '../voice-input/VoiceTextInput';
import { EntityContextMenu } from './EntityContextMenu';
import type { PlannerActionOperations } from './plannerActionOperations';
import {
  actionViewLabels,
  filterPlannerActions,
  groupPlannerActions,
  isOpenAction,
  type ActionView,
} from './plannerCatalogModel';
import { selectRecurringActionRepresentatives } from '../../application/planner/actionSelection';
import { addDays } from '../../domain/planner/PlanningPeriod';
import { PlannerActionTimeSheet, type SetActionTime } from './PlannerActionTimeSheet';
import { clockTime, durationLabel } from './timePresentation';
import { PlannerDisclosureCard } from './PlannerDisclosureCard';

export type { PlannerActionOperations } from './plannerActionOperations';
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
  onSetTime,
  presentation = 'page',
  onStartWalk,
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
  readonly onSetTime?: SetActionTime | undefined;
  readonly presentation?: 'page' | 'panel';
  readonly onStartWalk?: ((actionId: string, requestId: string) => Promise<void>) | undefined;
}) {
  const [view, setView] = useState<ActionView>(initialView);
  const [search, setSearch] = useState('');
  const [timeOpen, setTimeOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [goalFilter, setGoalFilter] = useState('');
  const [directionFilter, setDirectionFilter] = useState('');
  const [sphereFilter, setSphereFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sort, setSort] = useState<'date' | 'title'>('date');
  const filterButton = useRef<HTMLButtonElement>(null);
  const closeFilters = () => {
    setFiltersOpen(false);
    filterButton.current?.focus();
  };
  const resetFilters = () => {
    setView('open');
    setGoalFilter('');
    setDirectionFilter('');
    setSphereFilter('');
    setOverdueOnly(false);
    setSort('date');
  };
  const activeFilters = [
    ...(view !== 'open'
      ? [{ key: 'view', label: actionViewLabels[view], clear: () => setView('open') }]
      : []),
    ...(goalFilter
      ? [
          {
            key: 'goal',
            label: goals.find((g) => g.id.toString() === goalFilter)?.title ?? 'Цель',
            clear: () => setGoalFilter(''),
          },
        ]
      : []),
    ...(directionFilter
      ? [
          {
            key: 'direction',
            label:
              directions.find((d) => d.id.toString() === directionFilter)?.name ?? 'Направление',
            clear: () => setDirectionFilter(''),
          },
        ]
      : []),
    ...(sphereFilter
      ? [
          {
            key: 'sphere',
            label: spheres.find((s) => s.id.toString() === sphereFilter)?.name ?? 'Сфера',
            clear: () => setSphereFilter(''),
          },
        ]
      : []),
    ...(overdueOnly
      ? [{ key: 'overdue', label: 'Только просроченные', clear: () => setOverdueOnly(false) }]
      : []),
  ];
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
      <section
        className={`planner-action-detail-page${presentation === 'panel' ? ' planner-action-detail-page--panel' : ''}`}
      >
        {presentation === 'page' && (
          <a className="planner-text-link" href="#/v2/actions">
            ← Все действия
          </a>
        )}
        {selected ? (
          <>
            {presentation === 'page' && (
              <h1 className="planner-detail-title">{selected.title.toString()}</h1>
            )}
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
            {presentation === 'panel' &&
              (selected.status === 'draft' || selected.status === 'ready') &&
              operations.onEdit && (
                <PlannerActionEdit
                  key={selected.id.toString()}
                  action={selected}
                  onSave={operations.onEdit}
                  initiallyOpen
                  compact
                />
              )}
            <PlannerActionRow
              action={selected}
              goals={goals}
              directions={directions}
              spheres={spheres}
              today={today}
              {...operations}
              expanded
              panelSelected={presentation === 'panel'}
            />
            {presentation === 'panel' && selected.status === 'completed' && operations.onReopen && (
              <button
                type="button"
                className="planner-primary"
                disabled={operations.busy}
                onClick={() =>
                  void operations.onReopen?.(selected.id.toString())?.catch(() => undefined)
                }
              >
                Вернуть в работу
              </button>
            )}
            {presentation === 'page' &&
              (selected.status === 'draft' || selected.status === 'ready') &&
              operations.onEdit && (
                <PlannerActionEdit
                  key={selected.id.toString()}
                  action={selected}
                  onSave={operations.onEdit}
                />
              )}
            <PlanningActionDetails action={selected} today={today} onStartWalk={onStartWalk} />
            <section className="planner-subactions" aria-label="Время действия">
              <h2>Время</h2>
              <a
                className="planner-text-link"
                href={`#/v2/actions?view=time&${new URLSearchParams({ actionId: selected.id.toString() })}`}
              >
                Рабочее время
              </a>
              <p className="planner-muted">
                Оценка:{' '}
                {selected.estimateMinutes === null
                  ? 'не задана'
                  : durationLabel(selected.estimateMinutes)}
                {selected.scheduledStartMinute !== null && (
                  <>
                    {' '}
                    · {clockTime(selected.scheduledStartMinute)}–
                    {clockTime(selected.scheduledStartMinute + selected.scheduledDurationMinutes!)}
                  </>
                )}
              </p>
              {(selected.status === 'draft' || selected.status === 'ready') && onSetTime && (
                <button type="button" disabled={operations.busy} onClick={() => setTimeOpen(true)}>
                  Планировать время
                </button>
              )}
              {timeOpen && onSetTime && (
                <QuickAccessGuardScope scope={presentation === 'panel' ? 'action-time' : 'root'}>
                  <PlannerActionTimeSheet
                    action={selected}
                    onSave={onSetTime}
                    onClose={() => setTimeOpen(false)}
                  />
                </QuickAccessGuardScope>
              )}
            </section>
            {selected.parentActionId ? (
              <div className="planner-inline-actions">
                <a
                  className="planner-text-link"
                  href={`#/v2/actions/${encodeURIComponent(selected.parentActionId.toString())}`}
                  onClick={(event) => {
                    if (
                      !operations.onOpenAction ||
                      event.button !== 0 ||
                      event.ctrlKey ||
                      event.metaKey ||
                      event.shiftKey ||
                      event.altKey
                    )
                      return;
                    event.preventDefault();
                    operations.onOpenAction(selected.parentActionId!.toString());
                  }}
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
          ref={filterButton}
          aria-controls="action-filters"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && filtersOpen) closeFilters();
          }}
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          Фильтры{activeFilters.length ? ` · ${activeFilters.length}` : ''}
        </button>
      </div>
      {filtersOpen && (
        <section
          id="action-filters"
          className="planner-filter-panel"
          aria-label="Фильтры действий"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              closeFilters();
            }
          }}
        >
          <p className="planner-filter-label">Показать действия</p>
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
          {view === 'upcoming' && (
            <p className="planner-muted">Запланированные на ближайшие 7 дней, начиная с завтра.</p>
          )}
          <div className="planner-form-columns">
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
          </div>
          <div className="planner-inline-actions">
            <button type="button" onClick={resetFilters}>
              Сбросить
            </button>
            <button type="button" className="planner-primary" onClick={closeFilters}>
              Показать: {activeActions.length + completedActions.length}
            </button>
          </div>
        </section>
      )}
      {activeFilters.length > 0 && (
        <div className="planner-active-filters" aria-label="Активные фильтры">
          {activeFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              aria-label={`Убрать фильтр: ${filter.label}`}
              onClick={() => {
                filter.clear();
                filterButton.current?.focus();
              }}
            >
              {filter.label} ×
            </button>
          ))}
        </div>
      )}
      {sort === 'title' && <p className="planner-muted">Внутри групп: по названию</p>}
      {visible.length === 0 && (
        <div className="planner-empty">
          <p>
            {search
              ? `По запросу «${search}» ничего не найдено.`
              : activeFilters.length
                ? 'Нет действий с выбранными условиями.'
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
                resetFilters();
                filterButton.current?.focus();
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
  initiallyOpen = false,
  compact = false,
}: {
  readonly action: LifeAction;
  readonly onSave: (
    action: LifeAction,
    title: string,
    description: string,
    need?: string,
  ) => Promise<void>;
  readonly initiallyOpen?: boolean;
  readonly compact?: boolean;
}) {
  const [titleDraft, setTitleDraft] = useState<PlannerFieldDraft | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState<PlannerFieldDraft | null>(null);
  const [needDraft, setNeedDraft] = useState<PlannerFieldDraft | null>(null);
  const savedNeed = action.need ?? '';
  const needState = plannerFieldState(needDraft, savedNeed);
  const need = needState.value;
  const savedTitle = action.title.toString();
  const savedDescription = action.description ?? '';
  const titleState = plannerFieldState(titleDraft, savedTitle);
  const descriptionState = plannerFieldState(descriptionDraft, savedDescription);
  const title = titleState.value;
  const description = descriptionState.value;
  const conflict = titleState.conflict || descriptionState.conflict || needState.conflict;
  const [busy, setBusy] = useState(false);
  useQuickAccessGuard(() => ({
    dirty:
      title !== action.title.toString() ||
      description !== (action.description ?? '') ||
      need !== savedNeed,
    busy,
  }));
  const [error, setError] = useState<string | null>(null);
  const secondaryFields = (
    <>
      <NeedPicker
        id={`planner-action-edit-need-${action.id.toString()}`}
        value={need}
        disabled={busy}
        help="Пустой выбор использует потребность родителя."
        onValueChange={(value) =>
          setNeedDraft((current) => editPlannerField(current, savedNeed, value))
        }
      />
      <label>
        <span>Описание</span>
        <textarea
          value={description}
          disabled={busy}
          onChange={(event) =>
            setDescriptionDraft((current) =>
              editPlannerField(current, savedDescription, event.target.value),
            )
          }
        />
      </label>
    </>
  );
  return (
    <PlannerDisclosureCard
      className={`planner-action-edit${compact ? ' planner-action-edit--compact' : ''}`}
      icon="settings"
      title="Редактировать действие"
      description={compact ? 'Название и дополнительные поля' : 'Название, потребность и описание'}
      initiallyOpen={initiallyOpen}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (busy || conflict) return;
          setBusy(true);
          setError(null);
          void onSave(action, title, description, needDraft === null ? undefined : need)
            .then(() => {
              setTitleDraft(null);
              setDescriptionDraft(null);
              setNeedDraft(null);
            })
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
            onChange={(event) =>
              setTitleDraft((current) => editPlannerField(current, savedTitle, event.target.value))
            }
          />
        </label>
        {compact && (
          <button type="submit" disabled={busy || conflict || !title.trim()}>
            Сохранить название
          </button>
        )}
        {compact ? (
          <details className="planner-action-edit__more">
            <summary>Описание и потребность</summary>
            {secondaryFields}
          </details>
        ) : (
          secondaryFields
        )}
        {conflict && (
          <p role="alert">
            Действие изменилось. Ваш текст сохранён в форме.{' '}
            <button
              type="button"
              onClick={() => {
                setTitleDraft(null);
                setDescriptionDraft(null);
                setNeedDraft(null);
              }}
            >
              Загрузить сохранённое
            </button>
          </p>
        )}
        {!compact && (
          <button type="submit" disabled={busy || conflict || !title.trim()}>
            Сохранить
          </button>
        )}
        {error && (
          <p role="alert" className="planner-error">
            {error}
          </p>
        )}
      </form>
    </PlannerDisclosureCard>
  );
}
export function PlannerActionRow({
  action,
  goals,
  directions = [],
  spheres = [],
  busy,
  onComplete,
  onOpenAction,
  onPlan,
  onLink,
  menuForAction,
  expanded = false,
  lazyDetails = false,
  goalContext = false,
  recurrenceLabel,
  catalogMode = false,
  panelSelected = false,
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
  readonly panelSelected?: boolean;
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
  useQuickAccessGuard(() => ({
    dirty: date !== savedDate || goalId !== savedGoal || conflict,
    busy: busy || pending,
  }));
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
            {!panelSelected && (
              <a
                className="planner-action-title"
                href={`#/v2/actions/${encodeURIComponent(action.id.toString())}`}
                onClick={(event) => {
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
                  onOpenAction(action.id.toString());
                }}
              >
                {action.title.toString()}
              </a>
            )}
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
                  {today && savedDate === today ? 'Сегодня' : plannerDisplayDate(savedDate || null)}
                </span>
                {action.priority && <span>{priorityLabel(action.priority)}</span>}
                <RecurrenceBadge action={action} label={recurrenceLabel} />
                <ActionGoalProgress action={action} />
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
                <span
                  className={
                    today && savedDate && savedDate < today && isOpenAction(action)
                      ? 'planner-due planner-due--overdue'
                      : 'planner-muted'
                  }
                >
                  {plannerDisplayDate(action.plannedDate?.toString() ?? null)}
                  {goalContext && action.priority === 'high' ? ' · Высокий приоритет' : ''}

                  {goalNext ? ' · Следующее' : !goalContext && action.isNext ? ' · Главное' : ''}
                  {action.status === 'completed' ? ' · Выполнено' : ''}
                  {action.status === 'cancelled' ? ' · Отменено' : ''}
                </span>
                <RecurrenceBadge action={action} label={recurrenceLabel} />
                <ActionGoalProgress action={action} />
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
                <EntityNeedText need={resolveActionNeed(action, goals, directions)} />
                {action.description && <p className="planner-action-note">{action.description}</p>}
                {action.completedAt && (
                  <p className="planner-muted">
                    Выполнено: {action.completedAt.toLocaleString('ru')}
                  </p>
                )}
                {action.actualResult && (
                  <p className="planner-action-note">Итог: {action.actualResult.toString()}</p>
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
                        {today && (
                          <>
                            {[
                              { label: 'Сегодня', value: today },
                              { label: 'Завтра', value: addDays(today, 1) },
                            ].map((option) => (
                              <button
                                key={option.label}
                                type="button"
                                disabled={busy || pending || conflict || savedDate === option.value}
                                onClick={() => {
                                  void run(
                                    () => onPlan(action.id.toString(), option.value),
                                    () => setDateDraft(null),
                                  );
                                }}
                              >
                                {option.label}
                              </button>
                            ))}
                          </>
                        )}
                        <button disabled={busy || pending || conflict} type="submit">
                          Сохранить дату
                        </button>
                        {(action.status === 'draft' || action.status === 'completed') && (
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
                        )}
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
