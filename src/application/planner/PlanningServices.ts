import type { PeriodPlanning } from './PeriodPlanning';
import type { GoalContributions } from './GoalContributions';
import type { RecurringActions } from './RecurringActions';
export interface PlanningServices {
  readonly periods: PeriodPlanning;
  readonly progress: GoalContributions;
  readonly recurrence: RecurringActions;
}
