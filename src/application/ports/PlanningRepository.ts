import type { Goal, LifeAction, JournalEntry } from '../../domain';
import type {
  PlanningPeriod,
  PeriodMembership,
  PeriodDecision,
} from '../../domain/planner/PlanningPeriod';
import type {
  ContributionLink,
  ProgressContribution,
} from '../../domain/planner/ProgressContribution';
import type { RecurrenceRule } from '../../domain/planner/RecurrenceRule';
import type { FocusPeriod } from '../../domain/planner/FocusPeriod';
export interface PlanningState {
  goals: Goal[];
  actions: LifeAction[];
  periods: PlanningPeriod[];
  memberships: PeriodMembership[];
  decisions: PeriodDecision[];
  links: ContributionLink[];
  contributions: ProgressContribution[];
  rules: RecurrenceRule[];
  legacyFocus: FocusPeriod[];
  /** Only newly created journal entries; historical events remain in the existing Journal. */
  journal: JournalEntry[];
}
export interface PlanningRepository {
  read(): Promise<PlanningState>;
  change<T>(work: (state: PlanningState) => T): Promise<T>;
}
