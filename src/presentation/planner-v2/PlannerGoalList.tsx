import { PlanningProgress } from './PlanningProgress';
import { resolveGoalNeed } from '../../domain/planner/resolveEntityNeed';
import { EntityNeedText } from './EntityNeedText';
import { usePlanning } from './PlanningContext';
import { useRef, useState } from 'react';
import {
  currentGoalPeriod,
  filterGoalsByPeriod,
  type GoalPeriodFilter,
} from './plannerPeriodFilter';
import { EntityContextMenu, type EntityMenuAction } from './EntityContextMenu';
import type { Direction, Goal, LifeAction, Sphere } from '../../domain';
import { VoiceField } from '../voice-input/VoiceField';
import { VoiceTextInput } from '../voice-input/VoiceTextInput';
import { actionResultsForGoal } from './actionResultsModel';
import {
  emptyGoalFilters,
  filterPlannerGoals,
  selectGoalCardActions,
  horizonLabels,
  importanceLabels,
  measuredGoalProgress,
  statusLabels,
  type GoalFilters,
} from './plannerCatalogModel';

const periodOptions: readonly [GoalPeriodFilter, string, string][] = [
  ['all', 'Все периоды', 'Не ограничивать цели периодом планирования.'],
  ['week', 'Текущая неделя', 'Цели, добавленные в план текущей недели.'],
  ['thirty_days', 'Текущий 30-дневный цикл', 'Цели, добавленные в текущий 30-дневный цикл.'],
  ['quarter', 'Текущий квартал', 'Цели, добавленные в план текущего квартала.'],
  ['year', 'Текущий год', 'Цели, добавленные в план текущего года.'],
  ['none', 'Без периода', 'Цели, не добавленные ни в один период планирования.'],
];

export function PlannerGoalList({
  goals,
  directions,
  spheres,
  actions,
  focusIds,
  initialSphereId = '',
  initialPeriod = 'all',
  today,
  menuForGoal,
}: {
  readonly goals: readonly Goal[];
  readonly directions: readonly Direction[];
  readonly spheres: readonly Sphere[];
  readonly actions: readonly LifeAction[];
  readonly focusIds: readonly string[];
  readonly initialSphereId?: string;
  readonly initialPeriod?: GoalPeriodFilter;
  readonly today: string;
  readonly menuForGoal?: (goal: Goal) => readonly EntityMenuAction[];
}) {
  const planning = usePlanning();
  const [filters, setFilters] = useState({ ...emptyGoalFilters(), sphereId: initialSphereId });
  const [periodFilter, setPeriodFilter] = useState<GoalPeriodFilter>(initialPeriod);
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const filterButton = useRef<HTMLButtonElement>(null);
  const closeFilters = () => {
    setOpen(false);
    filterButton.current?.focus();
  };
  const resetFilters = () => {
    setFilters(emptyGoalFilters());
    setPeriodFilter('all');
    setPeriodError(null);
  };
  const change = <K extends keyof GoalFilters>(key: K, value: GoalFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const selected = planning?.state
    ? filterGoalsByPeriod(
        goals,
        periodFilter,
        today,
        planning.state.periods,
        planning.state.memberships,
      )
    : periodFilter === 'all'
      ? [...goals]
      : [];
  const visible = filterPlannerGoals(selected, filters, search, directions, focusIds);
  const cycle = planning?.state
    ? currentGoalPeriod('thirty_days', today, planning.state.periods)
    : null;
  const active = Object.entries(filters).filter(([, v]) => Boolean(v));
  const filterCount = active.length + Number(periodFilter !== 'all');
  const periodOption = periodOptions.find(([value]) => value === periodFilter)!;
  const label = (key: string, value: string | boolean) => {
    switch (key) {
      case 'showCompleted':
        return 'Показать выполненные';
      case 'unassigned':
        return 'Без направления';
      case 'undated':
        return 'Без даты завершения';
      case 'status':
        return statusLabels[value as keyof typeof statusLabels];
      case 'importance':
        return importanceLabels[value as keyof typeof importanceLabels];
      case 'horizon':
        return horizonLabels[value as keyof typeof horizonLabels];
      case 'focus':
        return value === 'yes' ? 'В фокусе' : 'Не в фокусе';
      case 'sphereId':
        return spheres.find((s) => s.id.toString() === value)?.name ?? 'Сфера';
      default:
        return directions.find((d) => d.id.toString() === value)?.name ?? 'Направление';
    }
  };
  return (
    <>
      <div className="planner-toolbar">
        <VoiceField>
          <span>Поиск целей</span>
          <VoiceTextInput
            id="goals-search"
            value={search}
            onValueChange={setSearch}
            placeholder="Название или контекст"
          />
        </VoiceField>
        <button
          type="button"
          ref={filterButton}
          aria-expanded={open}
          aria-controls="goal-filters"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && open) closeFilters();
          }}
          onClick={() => setOpen(!open)}
        >
          Фильтры{filterCount ? ` · ${filterCount}` : ''}
        </button>
      </div>
      {periodError && <p role="alert">{periodError}</p>}
      {periodFilter !== 'all' && !planning?.state && <p role="status">Загружаем периоды…</p>}
      {open && (
        <section
          id="goal-filters"
          className="planner-filter-panel"
          aria-label="Фильтры целей"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              closeFilters();
            }
          }}
        >
          <div className="planner-form-columns">
            <label>
              <span>Плановый период</span>
              <select
                value={periodFilter}
                aria-label="Плановый период"
                aria-describedby="goal-period-help"
                onChange={(event) => {
                  setPeriodFilter(event.target.value as GoalPeriodFilter);
                  setPeriodError(null);
                }}
              >
                {periodOptions.map(([value, title]) => (
                  <option key={value} value={value}>
                    {title}
                  </option>
                ))}
              </select>
              <small id="goal-period-help" className="planner-muted">
                {periodOption[2]}
              </small>
            </label>
            <label>
              <span>Состояние</span>
              <select
                value={filters.status}
                onChange={(e) => change('status', e.target.value as GoalFilters['status'])}
              >
                <option value="">{filters.showCompleted ? 'Все' : 'Все незавершённые'}</option>
                {Object.entries(statusLabels).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="planner-check-label">
              <input
                type="checkbox"
                checked={filters.showCompleted}
                onChange={(e) => change('showCompleted', e.target.checked)}
              />
              Показать выполненные
            </label>
            <label>
              <span>Сфера</span>
              <select value={filters.sphereId} onChange={(e) => change('sphereId', e.target.value)}>
                <option value="">Все сферы</option>
                {spheres.map((s) => (
                  <option key={s.id.toString()} value={s.id.toString()}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Направление</span>
              <select
                value={filters.directionId}
                onChange={(e) => change('directionId', e.target.value)}
              >
                <option value="">Все направления</option>
                {directions.map((d) => (
                  <option key={d.id.toString()} value={d.id.toString()}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Важность / намерение</span>
              <select
                value={filters.importance}
                onChange={(e) => change('importance', e.target.value as GoalFilters['importance'])}
              >
                <option value="">Любая</option>
                {Object.entries(importanceLabels).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Горизонт</span>
              <select
                aria-label="Горизонт"
                aria-describedby="goal-horizon-help"
                value={filters.horizon}
                onChange={(e) => change('horizon', e.target.value as GoalFilters['horizon'])}
              >
                <option value="">Любой</option>
                {Object.entries(horizonLabels).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <small id="goal-horizon-help" className="planner-muted">
                Когда вы намерены заниматься целью. «Сейчас» не означает включение в план недели.
              </small>
            </label>
            <label>
              <span>Фокус текущей недели</span>
              <select
                value={filters.focus}
                onChange={(e) => change('focus', e.target.value as GoalFilters['focus'])}
              >
                <option value="">Все</option>
                <option value="yes">В фокусе</option>
                <option value="no">Не в фокусе</option>
              </select>
            </label>
            <label className="planner-check-label">
              <input
                type="checkbox"
                checked={filters.unassigned}
                onChange={(e) => change('unassigned', e.target.checked)}
              />
              Без направления
            </label>
            <label className="planner-check-label">
              <input
                type="checkbox"
                checked={filters.undated}
                onChange={(e) => change('undated', e.target.checked)}
              />
              Только без даты завершения
            </label>
          </div>
          {periodFilter === 'thirty_days' && !cycle && planning?.state && (
            <button
              type="button"
              onClick={() => {
                void planning.services.periods
                  .startCycle(today)
                  .then(() => planning.refresh())
                  .catch((error: unknown) =>
                    setPeriodError(
                      error instanceof Error ? error.message : 'Не удалось начать цикл.',
                    ),
                  );
              }}
            >
              Начать 30-дневный цикл
            </button>
          )}
          <div className="planner-inline-actions">
            <button type="button" onClick={resetFilters}>
              Сбросить все
            </button>
            <button className="planner-primary" type="button" onClick={closeFilters}>
              Показать: {visible.length}
            </button>
          </div>
        </section>
      )}
      {filterCount > 0 && (
        <div className="planner-active-filters" aria-label="Активные фильтры">
          {periodFilter !== 'all' && (
            <button
              type="button"
              aria-label={`Убрать фильтр: ${periodOption[1]}`}
              onClick={() => {
                setPeriodFilter('all');
                setPeriodError(null);
                filterButton.current?.focus();
              }}
            >
              {periodOption[1]} ×
            </button>
          )}
          {active.map(([key, value]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setFilters((f) => ({ ...f, [key]: typeof value === 'boolean' ? false : '' }));
                filterButton.current?.focus();
              }}
              aria-label={`Убрать фильтр: ${label(key, value)}`}
            >
              {label(key, value)} ×
            </button>
          ))}
        </div>
      )}
      <p className="planner-muted">
        Показано: {visible.length} из {goals.length}
      </p>
      {visible.length === 0 && (
        <div className="planner-empty">
          <p>
            {search
              ? `По запросу «${search}» ничего не найдено.`
              : filterCount
                ? 'Нет целей с выбранными условиями.'
                : goals.some((goal) => goal.status === 'achieved')
                  ? 'Нет незавершённых целей. Включите «Показать выполненные» в фильтрах.'
                  : 'Здесь пока нет целей.'}
          </p>
          {(search || filterCount > 0) && (
            <button
              type="button"
              onClick={() => {
                resetFilters();
                setSearch('');
                filterButton.current?.focus();
              }}
            >
              Сбросить фильтры и поиск
            </button>
          )}
        </div>
      )}
      {[
        {
          title: 'В фокусе',
          goals: visible.filter((goal) => focusIds.includes(goal.id.toString())),
        },
        {
          title: focusIds.length ? 'Другие цели' : 'Все цели',
          goals: visible.filter((goal) => !focusIds.includes(goal.id.toString())),
        },
      ]
        .filter((group) => group.goals.length)
        .map((group) => (
          <section className="planner-goal-group" key={group.title} aria-label={group.title}>
            <h2>
              {group.title} <small>{group.goals.length}</small>
            </h2>
            <ul className="planner-list">
              {group.goals.map((goal) => {
                const { next, open, completed } = selectGoalCardActions(goal, actions);
                const latestResult = actionResultsForGoal(actions, goal.id.toString())[0];
                const detailHref = `#/v2/goals/${encodeURIComponent(goal.id.toString())}`;
                const periods = planning?.state?.periods.filter(
                  (period) =>
                    period.startDate <= today &&
                    period.endDate >= today &&
                    planning.state?.memberships.some(
                      (m) =>
                        m.periodId === period.id &&
                        m.entityType === 'goal' &&
                        m.entityId === goal.id.toString() &&
                        !m.removed,
                    ),
                );
                const periodLabels = {
                  week: 'Неделя',
                  thirty_days: '30 дней',
                  quarter: 'Квартал',
                  year: 'Год',
                };
                return (
                  <li key={goal.id.toString()} className="planner-catalog-row planner-goal-card">
                    <EntityContextMenu
                      title={goal.title}
                      entityLabel="цель"
                      actions={menuForGoal?.(goal) ?? []}
                    >
                      <div className="planner-goal-card-main">
                        <a className="planner-goal-title" href={detailHref}>
                          {goal.title}
                        </a>
                        <EntityNeedText need={resolveGoalNeed(goal, directions)} prominent />
                        <PlannerGoalContext goal={goal} directions={directions} spheres={spheres} />
                        {(open.length > 0 || completed.length > 0) && (
                          <a className="planner-text-link" href={detailHref}>
                            Действия · {open.length}
                            {completed.length > 0 && ` · выполнено ${completed.length}`}
                          </a>
                        )}
                        {latestResult && (
                          <p className="planner-goal-latest-result">
                            <strong>Последний итог · {latestResult.title.toString()}</strong>
                            <span>{latestResult.actualResult?.toString()}</span>
                          </p>
                        )}
                        {next || goal.nextProgress ? (
                          <p className="planner-goal-next-link">
                            Следующий шаг:{' '}
                            {next ? (
                              <a href={`#/v2/actions/${encodeURIComponent(next.id.toString())}`}>
                                {next.title.toString()}
                              </a>
                            ) : (
                              goal.nextProgress
                            )}
                          </p>
                        ) : (
                          <a
                            className="planner-text-link"
                            href={
                              open.length > 0
                                ? detailHref
                                : `#/v2/actions/new?${new URLSearchParams({ goalId: goal.id.toString(), returnToGoals: '1' })}`
                            }
                          >
                            {open.length > 0 ? 'Выбрать следующий шаг' : 'Добавить следующий шаг'}
                          </a>
                        )}
                      </div>
                      <div className="planner-goal-card-progress">
                        <span className="planner-muted">
                          {periods?.length
                            ? periods.map((p) => periodLabels[p.kind]).join(' · ')
                            : goal.horizon
                              ? horizonLabels[goal.horizon]
                              : 'Без срока'}
                        </span>
                        <PlannerGoalProgress goal={goal} />
                      </div>
                    </EntityContextMenu>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
    </>
  );
}
export function PlannerGoalContext({
  goal,
  directions,
  spheres,
}: {
  readonly goal: Goal;
  readonly directions: readonly Direction[];
  readonly spheres: readonly Sphere[];
}) {
  const direction = directions.find((d) => d.id.toString() === goal.directionId?.toString());
  const sphere = spheres.find(
    (s) => s.id.toString() === (goal.sphereId ?? direction?.sphereId)?.toString(),
  );
  const context = [sphere?.name, direction?.name].filter(Boolean).join(' › ');
  return context ? <p className="planner-muted">{context}</p> : null;
}
export function PlannerGoalProgress({ goal }: { readonly goal: Goal }) {
  const planning = usePlanning();
  if (goal.measurement && planning)
    return (
      <PlanningProgress
        goal={planning.state?.goals.find((g) => g.id.toString() === goal.id.toString()) ?? goal}
        date={planning.today}
      />
    );
  const progress = measuredGoalProgress(goal);
  return progress ? (
    <div className="planner-measured-progress">
      <progress max={100} value={progress.percent} aria-label={`Прогресс цели: ${goal.title}`} />
      <span>
        {progress.label} · {progress.percent}%
      </span>
    </div>
  ) : null;
}
