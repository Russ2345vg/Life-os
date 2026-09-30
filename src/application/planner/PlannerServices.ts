import type { BalanceServices } from '../balance/BalanceServices';
import type { CreateGoal } from '../commands/CreateGoal';
import type { CreateLifeActionDraft } from '../commands/CreateLifeActionDraft';
import type { CompleteLifeAction } from '../commands/CompleteLifeAction';
import type { SetLifeActionPlan } from '../commands/SetLifeActionPlan';
import type { DiaryService } from '../diary/DiaryService';
import type { MemoryServices } from '../memory/MemoryServices';
import type { GetPlannerToday } from '../queries/GetPlannerToday';
import type { GetGoals } from '../queries/GetGoals';
import type { GetDirections } from '../queries/GetDirections';
import type { ColdShowerService } from '../sleep/ColdShowerService';
import type { SleepScheduleService } from '../sleep/SleepScheduleService';
import type { AccountSync } from '../sync/account/AccountSyncService';
import type { DailyDirection } from './DailyDirection';
import type { MonthlyDirectionFocusService } from './MonthlyDirectionFocusService';
import type { PlannerLibraryServices } from './PlannerLibraryServices';
import type { PlannerScenarios } from './PlannerScenarios';
import type { PlanningServices } from './PlanningServices';

export type ScenarioService = Pick<
  PlannerScenarios,
  'list' | 'create' | 'update' | 'addAction' | 'removeAction' | 'archive'
>;

export interface PlannerServices extends PlannerLibraryServices {
  readonly memory?: MemoryServices;
  readonly diary: DiaryService;
  readonly coldShower?: ColdShowerService;
  readonly plannerScenarios?: ScenarioService;
  readonly balance?: BalanceServices;
  readonly planning?: PlanningServices;
  readonly createLifeActionDraft: Pick<CreateLifeActionDraft, 'execute'>;
  readonly createGoal: Pick<CreateGoal, 'execute'>;
  readonly completeLifeAction: Pick<CompleteLifeAction, 'execute'>;
  readonly setLifeActionPlan: Pick<SetLifeActionPlan, 'execute' | 'changeDate' | 'undoDate'>;
  readonly getPlannerToday: Pick<GetPlannerToday, 'execute'>;
  readonly getGoals: Pick<GetGoals, 'execute'>;
  readonly getDirections: Pick<GetDirections, 'execute'>;
  readonly dailyDirection: Pick<DailyDirection, 'get' | 'set'>;
  readonly monthlyDirectionFocus: Pick<MonthlyDirectionFocusService, 'get' | 'set'>;
  readonly sleepSchedule: SleepScheduleService;
  readonly accountSync: AccountSync;
}
