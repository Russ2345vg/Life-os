import { useState } from 'react';
import type { Direction, Goal, LifeAction, Sphere } from '../../domain';
import { focusWeek, type FocusPeriod, type FocusRole } from '../../domain/planner/FocusPeriod';
import { selectGoalCardActions } from './plannerCatalogModel';
import { PlannerGoalContext, PlannerGoalProgress } from './PlannerGoalList';

export function PlannerFocus({
  goals,
  actions,
  directions,
  spheres,
  period,
  today,
  busy,
  onRole,
  onComplete,
  onNewAction,
}: {
  readonly goals: readonly Goal[];
  readonly actions: readonly LifeAction[];
  readonly directions: readonly Direction[];
  readonly spheres: readonly Sphere[];
  readonly period: FocusPeriod | null;
  readonly today: string;
  readonly busy: boolean;
  readonly onRole: (goalId: string, role: FocusRole | null) => void;
  readonly onComplete: (id: string) => void;
  readonly onNewAction: (goal: Goal) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const links = (period?.goals ?? []).filter((link) =>
    goals.some((g) => g.id.toString() === link.goalId && g.status === 'active'),
  );
  const chosen =
    links.find((l) => l.goalId === selected) ?? links.find((l) => l.role === 'primary') ?? links[0];
  const goal = goals.find((g) => g.id.toString() === chosen?.goalId);
  const outside = goals.filter(
    (g) => g.status === 'active' && !links.some((l) => l.goalId === g.id.toString()),
  );
  const stale = (period?.goals ?? []).filter((l) => !links.includes(l));
  const selection = goal ? selectGoalCardActions(goal, actions) : null;
  const next = selection?.next;
  const steps = selection?.open ?? [];
  const week = focusWeek(today);
  const step = (action: LifeAction) => (
    <div className="planner-action-row" key={action.id.toString()}>
      <input
        type="checkbox"
        className="planner-check"
        checked={false}
        disabled={busy}
        aria-label={`Выполнить: ${action.title.toString()}`}
        onChange={() => onComplete(action.id.toString())}
      />
      <div className="planner-action-copy">
        <a href={`#/v2/actions/${encodeURIComponent(action.id.toString())}`}>
          {action.title.toString()}
        </a>
        {action.plannedDate && (
          <span className="planner-muted">{action.plannedDate.toString()}</span>
        )}
      </div>
    </div>
  );
  return (
    <section className="planner-focus">
      <p className="planner-muted">
        Фокус недели · {week.startDate} — {week.endDate}
      </p>
      {links.length > 0 && (
        <div className="planner-focus-strip" aria-label="Цели в фокусе">
          {links.map((link) => {
            const item = goals.find((g) => g.id.toString() === link.goalId)!;
            return (
              <button
                key={link.goalId}
                type="button"
                aria-pressed={chosen?.goalId === link.goalId}
                onClick={() => setSelected(link.goalId)}
              >
                <span>{link.role === 'primary' ? 'Главная' : 'Поддерживающая'}</span>
                <strong>{item.title}</strong>
              </button>
            );
          })}
        </div>
      )}
      {goal ? (
        <article className="planner-focus-hero">
          <PlannerGoalContext goal={goal} directions={directions} spheres={spheres} />
          <h2>{goal.title}</h2>
          {goal.achievementCriteria && (
            <div>
              <p className="planner-eyebrow">Желаемый результат</p>
              <p>{goal.achievementCriteria}</p>
            </div>
          )}
          <PlannerGoalProgress goal={goal} />
          {goal.progress?.type === 'qualitative' && (
            <p className="planner-muted">
              Текущий этап:{' '}
              {
                {
                  start: 'Начало',
                  moving: 'В движении',
                  close: 'Близко к результату',
                  done: 'Готово',
                }[goal.progress.stage]
              }
            </p>
          )}
          {next ? (
            <section className="planner-focus-next">
              <h3>Следующий шаг</h3>
              {step(next)}
            </section>
          ) : goal.nextProgress ? (
            <section className="planner-focus-next">
              <h3>Следующий шаг</h3>
              <p>{goal.nextProgress}</p>
              <button type="button" onClick={() => onNewAction(goal)}>
                Создать действие из шага
              </button>
            </section>
          ) : (
            <button type="button" onClick={() => onNewAction(goal)}>
              Добавить следующий шаг
            </button>
          )}
          {steps.length > 1 && (
            <section>
              <h3>После этого</h3>
              {steps
                .filter((action) => action !== next)
                .slice(0, 3)
                .map(step)}
            </section>
          )}
          <div className="planner-inline-actions">
            <a
              className="planner-text-link"
              href={`#/v2/goals/${encodeURIComponent(goal.id.toString())}`}
            >
              Полная карточка цели
            </a>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                onRole(goal.id.toString(), chosen?.role === 'primary' ? 'supporting' : 'primary')
              }
            >
              {chosen?.role === 'primary' ? 'Сделать поддерживающей' : 'Сделать главной'}
            </button>
            <button type="button" disabled={busy} onClick={() => onRole(goal.id.toString(), null)}>
              Убрать из фокуса
            </button>
          </div>
        </article>
      ) : (
        <div className="planner-empty">
          <h2>Выберите, что важно сейчас</h2>
          <p>Добавьте до пяти активных целей из блока ниже.</p>
        </div>
      )}
      <details className="planner-details">
        <summary>
          Не в фокусе сейчас <span>{outside.length}</span>
        </summary>
        <ul className="planner-list">
          {outside.map((g) => (
            <li key={g.id.toString()} className="planner-catalog-row">
              <strong>{g.title}</strong>
              <div className="planner-inline-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    onRole(g.id.toString(), links.length === 0 ? 'primary' : 'supporting')
                  }
                >
                  Добавить в фокус
                </button>
                <a
                  className="planner-text-link"
                  href={`#/v2/goals/${encodeURIComponent(g.id.toString())}`}
                >
                  Открыть
                </a>
              </div>
            </li>
          ))}
        </ul>
        {outside.length === 0 && <p className="planner-empty">Других активных целей нет.</p>}
        {(period?.goals.length ?? 0) > 4 && (
          <p className="planner-muted">
            Рекомендуется одна главная и до трёх поддерживающих целей. Вы можете оставить больше.
          </p>
        )}
        {stale.map((l) => (
          <div key={l.goalId} className="planner-inline-actions">
            <span>
              {goals.find((g) => g.id.toString() === l.goalId)?.title ?? 'Недоступная цель'} · не
              активна
            </span>
            <button type="button" disabled={busy} onClick={() => onRole(l.goalId, null)}>
              Убрать из фокуса
            </button>
          </div>
        ))}
      </details>
    </section>
  );
}
