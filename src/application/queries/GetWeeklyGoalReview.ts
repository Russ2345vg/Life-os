import { DayDate } from '../../domain';
import { addDays, automaticPeriod } from '../../domain/planner/PlanningPeriod';
import { contributionIsEffective } from '../../domain/planner/CompletionContributions';
import type { PlanningState } from '../ports/PlanningRepository';
import { createGoalProgressReader } from '../planner/GoalContributions';
import { localDate } from '../planner/planningSupport';

export function selectReviewWeek(today: string, selected?: string) {
  const current = automaticPeriod('week', today);
  let requested = addDays(current.startDate, -7);
  if (selected) {
    try {
      requested = DayDate.create(selected).toString();
    } catch {
      // Invalid links fall back to the last fully completed week.
    }
  }
  return automaticPeriod('week', requested > current.startDate ? current.startDate : requested);
}

/** Uses the loaded canonical state; no second repository or historical snapshot. */
export function buildWeeklyGoalReview(state: PlanningState, today: string, selected?: string) {
  const week = selectReviewWeek(today, selected);
  const cutoff = week.endDate < today ? week.endDate : today;
  const within = (date: string | null) => Boolean(date && date >= week.startDate && date <= cutoff);
  const actions = state.actions.filter((action) => !action.isArchived() && !action.isDeleted());
  const completed = actions.filter(
    (action) =>
      action.status === 'completed' &&
      within(action.completedOn ?? (action.completedAt ? localDate(action.completedAt) : null)),
  );
  const unfinished = actions.filter(
    (action) =>
      ['draft', 'ready', 'in_progress'].includes(action.status) &&
      within(action.plannedDate?.toString() ?? null),
  );
  const actionMap = new Map(state.actions.map((action) => [action.id.toString(), action]));
  const reader = createGoalProgressReader(state);
  const goals = state.goals
    .filter((goal) => goal.status === 'active' && !goal.isDeleted())
    .map((goal) => {
      const records = state.contributions.filter(
        (record) =>
          record.goalId === goal.id.toString() &&
          record.source !== 'initial' &&
          within(record.effectiveDate) &&
          contributionIsEffective(record, actionMap),
      );
      const progress = reader(goal.id.toString(), today);
      const openActions = actions.filter(
        (action) =>
          action.goalId?.equals(goal.id) &&
          ['draft', 'ready', 'in_progress'].includes(action.status),
      );
      return {
        goal,
        openActions,
        nextAction: openActions.find((action) => goal.nextActionId?.equals(action.id)) ?? null,
        progress,
        recordCount: records.filter((record) => record.amount !== null).length,
        pending: records.filter((record) => record.amount === null).length,
        weeklyAmount: records.reduce((sum, record) => sum + (record.amount ?? 0), 0),
        records,
        completedCount: completed.filter((action) => action.goalId?.equals(goal.id)).length,
      };
    });
  return {
    week,
    current: week.endDate >= today,
    completed,
    unfinished,
    goals,
    withRecords: goals.filter((row) => row.recordCount > 0).length,
    withoutRecords: goals.filter(
      (row) => row.recordCount === 0 && row.pending === 0 && row.progress?.complete !== false,
    ).length,
  };
}

export type WeeklyGoalReview = ReturnType<typeof buildWeeklyGoalReview>;
