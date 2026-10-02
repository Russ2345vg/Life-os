import type {
  AccountSync,
  Clock,
  CurrentDateProvider,
  DiaryService,
  SyncApplication,
} from '../../application';
import type { BalanceServices } from '../../application/balance/BalanceServices';
import type { GetAnalyticsOverview } from '../../application/analytics/GetAnalyticsOverview';
import type { SetLifeActionTime } from '../../application/commands/SetLifeActionTime';
import type { MemoryServices } from '../../application/memory/MemoryServices';
import type { PlannerScenarios } from '../../application/planner/PlannerScenarios';
import type { PlannerServices } from '../../application/planner/PlannerServices';
import type { PlanningServices } from '../../application/planner/PlanningServices';
import type { TimeCapacityService } from '../../application/time/TimeCapacityService';
import type { WorkSessions } from '../../application/time/WorkSessions';
import type { DayDate } from '../../domain';

/** The application surface consumed by the current LifeOS workspace. */
export interface LifeOsApplication extends PlannerServices {
  readonly analytics: GetAnalyticsOverview;
  readonly workSessions: WorkSessions;
  readonly timeCapacity: TimeCapacityService;
  readonly setLifeActionTime: SetLifeActionTime;
  readonly plannerScenarios: PlannerScenarios;
  readonly balance: BalanceServices;
  readonly planning: PlanningServices;
  readonly diary: DiaryService;
  readonly memory: MemoryServices;
  readonly sync: SyncApplication;
  readonly accountSync: AccountSync;
  readonly clock: Clock;
  readonly currentDateProvider: CurrentDateProvider;
  readonly currentDate: DayDate;
  close(): void;
}
