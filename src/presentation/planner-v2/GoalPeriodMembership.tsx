import { useState } from 'react';
import { currentGoalPeriod } from './plannerPeriodFilter';
import { usePlanning } from './PlanningContext';
import type {
  PeriodKind,
  PlanningPeriod,
  PeriodMembership,
} from '../../domain/planner/PlanningPeriod';

const labels: Record<PeriodKind, string> = {
  year: 'Год',
  quarter: 'Квартал',
  thirty_days: '30 дней',
  week: 'Неделя',
};

export function GoalPeriodMembership({
  goalId,
  today,
  periods = [],
  memberships = [],
}: {
  readonly goalId: string;
  readonly today: string;
  readonly periods?: readonly PlanningPeriod[];
  readonly memberships?: readonly PeriodMembership[];
}) {
  const context = usePlanning();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const linkedPeriods = new Set(
    memberships
      .filter((item) => item.entityType === 'goal' && item.entityId === goalId && !item.removed)
      .map((item) => item.periodId),
  );
  const kinds = new Set(
    (Object.keys(labels) as PeriodKind[]).filter((kind) => {
      const period = currentGoalPeriod(kind, today, periods);
      return period !== null && linkedPeriods.has(period.id);
    }),
  );
  const metadata =
    Object.entries(labels)
      .filter(([kind]) => kinds.has(kind as PeriodKind))
      .map(([, label]) => label)
      .join(' · ') || 'Без периода';
  if (!context?.state)
    return (
      <p className="planner-muted" aria-label="Периоды цели">
        {metadata}
      </p>
    );
  const state = context.state;
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      await context.refresh();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Не удалось изменить период.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="planner-goal-periods">
      <summary>Периоды цели: {metadata}</summary>
      <p className="planner-muted">
        Цель может входить в несколько периодов. Удаление связи не удаляет цель.
      </p>
      {Object.entries(labels).map(([kind, label]) => {
        const period = currentGoalPeriod(kind as PeriodKind, today, state.periods);
        const checked = Boolean(
          period &&
          state.memberships.some(
            (item) =>
              item.periodId === period.id &&
              item.entityType === 'goal' &&
              item.entityId === goalId &&
              !item.removed,
          ),
        );
        return (
          <div key={kind}>
            <label className="planner-check-label">
              <input
                type="checkbox"
                checked={checked}
                disabled={busy || !period}
                onChange={(event) => {
                  if (!period) return;
                  void run(() =>
                    context.services.periods.participate(
                      kind as PeriodKind,
                      period.startDate,
                      'goal',
                      goalId,
                      !event.target.checked,
                    ),
                  );
                }}
              />
              {label}
            </label>
            {kind === 'thirty_days' && !period && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void run(() => context.services.periods.startCycle(today));
                }}
              >
                Начать 30-дневный цикл
              </button>
            )}
          </div>
        );
      })}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
