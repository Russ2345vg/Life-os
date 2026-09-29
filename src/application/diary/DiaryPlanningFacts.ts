import type { DayDate } from '../../domain';
import { contributionIsEffective } from '../../domain/planner/CompletionContributions';
import type { PlanningState } from '../ports/PlanningRepository';
import { createGoalProgressReader } from '../planner/GoalContributions';
import { localDate } from '../planner/planningSupport';
import { buildWeeklyGoalReview } from '../queries/GetWeeklyGoalReview';

export function buildDiaryWeekPlanningFacts(
  state: PlanningState,
  weekStart: DayDate,
  today: DayDate,
) {
  return buildWeeklyGoalReview(state, today.toString(), weekStart.toString());
}

export function buildDiaryMonthPlanningFacts(
  state: PlanningState,
  monthStart: DayDate,
  today: DayDate,
) {
  const start = monthStart.toString();
  const month = `${start.slice(0, 7)}-`;
  const monthEnd = new Date(`${start.slice(0, 7)}-01T12:00:00Z`);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  monthEnd.setUTCDate(0);
  const end = monthEnd.toISOString().slice(0, 10);
  const cutoff = today.toString() < end ? today.toString() : end;
  const within = (date: string | null) => Boolean(date && date.startsWith(month) && date <= cutoff);
  const actions = state.actions.filter((action) => !action.isArchived() && !action.isDeleted());
  const completed = actions.filter(
    (action) =>
      action.status === 'completed' &&
      within(action.completedOn ?? (action.completedAt ? localDate(action.completedAt) : null)),
  );
  const actionMap = new Map(state.actions.map((action) => [action.id.toString(), action]));
  const progress = createGoalProgressReader(state);
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
      return {
        goal,
        progress: progress(goal.id.toString(), cutoff),
        completedCount: completed.filter((action) => action.goalId?.equals(goal.id)).length,
        recordCount: records.filter((record) => record.amount !== null).length,
        pending: records.filter((record) => record.amount === null).length,
        amount: records.reduce((sum, record) => sum + (record.amount ?? 0), 0),
        records,
      };
    });
  return {
    startDate: start,
    endDate: end,
    cutoff,
    completed,
    goals,
    withRecords: goals.filter((goal) => goal.recordCount > 0).length,
    withoutRecords: goals.filter(
      (goal) => goal.recordCount === 0 && goal.pending === 0 && goal.progress?.complete !== false,
    ).length,
  };
}

export type DiaryWeekPlanningFacts = ReturnType<typeof buildDiaryWeekPlanningFacts>;
export type DiaryMonthPlanningFacts = ReturnType<typeof buildDiaryMonthPlanningFacts>;
