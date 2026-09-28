import type { AccountSync, Clock, CurrentDateProvider, SyncApplication } from '../../application';
import type { BalanceServices } from '../../application/balance/BalanceServices';
import type { PlanningServices } from '../../application/planner/PlanningServices';
import type { DayDate } from '../../domain';
import type { PlannerServices } from '../../presentation/planner-v2/PlannerWorkspace';
import type { PlannerScenarios } from '../../application/planner/PlannerScenarios';
import type { WorkSessions } from '../../application/time/WorkSessions';
import type { TimeCapacityService } from '../../application/time/TimeCapacityService';
import type { SetLifeActionTime } from '../../application/commands/SetLifeActionTime';

/** The application surface consumed by the current LifeOS workspace. */
export interface LifeOsApplication extends PlannerServices {
  readonly workSessions: WorkSessions;
  readonly timeCapacity: TimeCapacityService;
  readonly setLifeActionTime: SetLifeActionTime;
  readonly plannerScenarios: PlannerScenarios;
  readonly balance: BalanceServices;
  readonly planning: PlanningServices;
  readonly sync: SyncApplication;
  readonly accountSync: AccountSync;
  readonly clock: Clock;
  readonly currentDateProvider: CurrentDateProvider;
  readonly currentDate: DayDate;
  close(): void;
}
