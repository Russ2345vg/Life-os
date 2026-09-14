import type { Sphere, Direction, Goal, LifeAction } from '../../domain';
import type { DirectionIndicator } from '../../domain/balance/DirectionIndicator';
import type { BalanceMonthlySnapshot } from '../../domain/balance/BalanceMonthlySnapshot';
import type { ProgressContribution } from '../../domain/planner/ProgressContribution';
import type {
  PlanningPeriod,
  PeriodMembership,
  PeriodDecision,
} from '../../domain/planner/PlanningPeriod';
export interface BalanceState {
  readonly spheres: readonly Sphere[];
  readonly directions: readonly Direction[];
  readonly goals: Goal[];
  readonly actions: LifeAction[];
  readonly contributions: ProgressContribution[];
  readonly periods: readonly PlanningPeriod[];
  readonly memberships: readonly PeriodMembership[];
  readonly decisions: readonly PeriodDecision[];
  readonly indicators: readonly DirectionIndicator[];
  readonly snapshots: readonly BalanceMonthlySnapshot[];
}
export interface BalanceRepository {
  read(): Promise<BalanceState>;
  changeIndicators<T>(
    work: (state: BalanceState) => { readonly result: T; readonly indicator: DirectionIndicator },
  ): Promise<T>;
  refreshSnapshots(): Promise<void>;
}
