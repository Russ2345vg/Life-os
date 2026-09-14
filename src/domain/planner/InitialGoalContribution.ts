import type { Goal } from '../goal/Goal';
import type { ProgressContribution } from './ProgressContribution';
export function initialGoalContribution(goal: Goal): ProgressContribution | null {
  if (!goal.measurement) return null;
  const now = goal.createdAt.toISOString();
  return {
    id: `initial:${goal.id.toString()}`,
    goalId: goal.id.toString(),
    amount: goal.measurement.mode === 'recurring' ? 0 : (goal.measurement.start ?? 0),
    source: 'initial',
    actionId: null,
    completionKey: null,
    linkId: null,
    effectiveDate: now.slice(0, 10),
    occurredAt: now,
    voided: false,
    reason: 'Начальное значение',
    version: 1,
    schemaVersion: 1,
    updatedAt: now,
  };
}
