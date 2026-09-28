import type { PlannerTodayOverview } from '../../application/queries/GetPlannerToday';
export function selectRepeatedPlanActions(overview: PlannerTodayOverview) {
  return overview.actions.filter(
    (action) =>
      action.rescheduleCount >= 2 && (action.status === 'ready' || action.status === 'in_progress'),
  );
}
