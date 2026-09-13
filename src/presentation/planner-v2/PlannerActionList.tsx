import { editPlannerField, plannerFieldState, type PlannerFieldDraft } from './plannerActionDraft';
import { useState } from 'react';
import type { Goal, LifeAction } from '../../domain';
import { VoiceField } from '../voice-input/VoiceField';
import { VoiceTextInput } from '../voice-input/VoiceTextInput';
import {
  actionViewLabels,
  filterPlannerActions,
  isOpenAction,
  type ActionView,
} from './plannerCatalogModel';

export interface PlannerActionOperations {
  readonly busy: boolean;
  readonly onComplete: (id: string) => void;
  readonly onPlan: (id: string, date: string) => Promise<void>;
  readonly onLink: (id: string, goalId: string) => Promise<void>;
}
export function PlannerActionList({
  actions,
  goals,
  today,
  onNew,
  selectedId,
  ...operations
}: PlannerActionOperations & {
  readonly actions: readonly LifeAction[];
  readonly goals: readonly Goal[];
  readonly today: string;
  readonly onNew: () => void;
  readonly selectedId: string | null;
}) {
  const [view, setView] = useState<ActionView>('open');
  const [search, setSearch] = useState('');
  const visible = filterPlannerActions(actions, view, search, today);
  const selected = selectedId ? actions.find((a) => a.id.toString() === selectedId) : null;
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
export function PlannerActionRow({
  action,
  goals,
  busy,
  onComplete,
  onPlan,
  onLink,
  expanded = false,
}: PlannerActionOperations & {
  readonly action: LifeAction;
  readonly goals: readonly Goal[];
  readonly expanded?: boolean;
}) {
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
          {goal && <span className="planner-muted">{goal.title}</span>}
          <span className="planner-muted">
            {action.plannedDate?.toString()}
            {action.isNext ? ' · Главное' : ''}
            {action.status === 'completed' ? ' · Выполнено' : ''}
          </span>
        </div>
      </div>
      <details className="planner-row-details" open={expanded || undefined}>
        <summary>Открыть и изменить</summary>
        {conflict && (
          <div className="planner-error" role="alert">
            <p>
              Действие изменилось на другом экране или устройстве. Обновите поля перед сохранением.
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
          <p className="planner-muted">Выполнено: {action.completedAt.toLocaleString('ru')}</p>
        )}
        <div className="planner-form-columns">
          {isOpenAction(action) && (
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
      </details>
    </div>
  );
}
