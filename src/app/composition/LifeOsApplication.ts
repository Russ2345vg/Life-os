import type { Clock, CurrentDateProvider, SyncApplication } from '../../application';
import type { BalanceServices } from '../../application/balance/BalanceServices';
import type { PlanningServices } from '../../application/planner/PlanningServices';
import type { DayDate } from '../../domain';
import type { PlannerServices } from '../../presentation/planner-v2/PlannerWorkspace';

/** The application surface consumed by the current LifeOS workspace. */
export interface LifeOsApplication extends PlannerServices {
  readonly balance: BalanceServices;
  readonly planning: PlanningServices;
  readonly sync: SyncApplication;
  readonly clock: Clock;
  readonly currentDateProvider: CurrentDateProvider;
  readonly currentDate: DayDate;
  close(): void;
}
