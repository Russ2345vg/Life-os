import type { Goal } from '../../domain';
import { usePlanning } from './PlanningContext';
import { PlanningProgress } from './PlanningProgress';
import { PlannerActionRow } from './PlannerActionList';
import type { PlannerViewOperations } from './PlannerViewParts';
export function PlanningGoalDetail({
  id,
  today,
  ...operations
}: { readonly id: string; readonly today: string } & PlannerViewOperations) {
  const c = usePlanning();
  if (!c?.state) return <p role="status">Загружаем цель…</p>;
  const s = c.state,
    g = s.goals.find((g) => g.id.toString() === id);
  if (!g) return <p>Цель не найдена.</p>;
  const links = s.links.filter((l) => l.goalId === id && !l.removed),
    facts = s.contributions
      .filter((p) => p.goalId === id)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const achieve = () => {
    void operations.onGoalStatus(g, 'achieved');
  };
  return (
    <section className="planning-workspace">
      <a href="#/v2/goals">← Все цели</a>
      <header className="planner-page-heading">
        <h1>{g.title}</h1>
      </header>
      {g.achievementCriteria && <p>{g.achievementCriteria}</p>}
      <PlanningProgress key={id} goal={g} date={today} editable onAchieve={achieve} />
      <p className="planner-muted">
        {s.memberships
          .filter((m) => !m.removed && m.entityType === 'goal' && m.entityId === id)
          .map((m) => s.periods.find((p) => p.id === m.periodId))
          .filter(Boolean)
          .map((p) => `${p!.startDate} — ${p!.endDate}`)
          .join(' · ') || 'Без периода'}
      </p>
      <a href="#/v2/goals/plans">Выбрать период и фокус</a>
      <h2>Действия</h2>
      {s.actions
        .filter(
          (a) =>
            !a.isArchived() &&
            (a.goalId?.toString() === id ||
              links.some((l) =>
                l.sourceType === 'action'
                  ? l.sourceId === a.id.toString()
                  : l.sourceId === a.occurrence?.ruleId,
              )),
        )
        .slice(0, 30)
        .map((a) => (
          <PlannerActionRow
            key={a.id.toString()}
            action={a}
            goals={s.goals as readonly Goal[]}
            {...operations}
            lazyDetails
          />
        ))}
      <a href={`#/v2/actions/new?goalId=${encodeURIComponent(id)}`}>Добавить действие</a>
      <details>
        <summary>История прогресса · {facts.length}</summary>
        {facts.slice(0, 100).map((f) => (
          <div key={f.id} className="planning-contribution">
            <p>
              {f.effectiveDate} · {f.amount ?? 'Ожидает значения'} {g.measurement?.unit}
              {f.voided ? ' · Отменено' : ''}
            </p>
            <p className="planner-muted">
              {f.reason}
              {f.source === 'manual'
                ? ' · Ручная корректировка'
                : f.source === 'initial'
                  ? ' · Начальное значение'
                  : ''}
            </p>
            {f.actionId && (
              <a href={`#/v2/actions/${encodeURIComponent(f.actionId)}`}>Исходное выполнение</a>
            )}
          </div>
        ))}
      </details>
      <a href={`#/goals/${encodeURIComponent(id)}`}>Описание и остальные свойства цели</a>
    </section>
  );
}
