import type { BalanceServices } from '../balance/BalanceServices';
import type { DesktopFocusWindow } from '../ports/DesktopFocusWindow';
import type { PomodoroPreferences } from '../ports/PomodoroPreferences';
import type { AiAssistant } from '../ai/AiAssistant';
import type { ReadAiContext } from '../ai/AiContext';
import type { GetAnalyticsOverview } from '../analytics/GetAnalyticsOverview';
import type { WalkServices } from '../walk/WalkServices';
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
import type { SleepObservationService } from '../sleep/SleepObservationService';
import type { SleepAlarmObservationCoordinator } from '../sleep/SleepAlarmObservationCoordinator';
import type { AccountSync } from '../sync/account/AccountSyncService';
import type { DailyDirection } from './DailyDirection';
import type { MonthlyDirectionFocusService } from './MonthlyDirectionFocusService';
import type { PlannerLibraryServices } from './PlannerLibraryServices';
import type { PlannerScenarios } from './PlannerScenarios';
import type { PlanningServices } from './PlanningServices';
import type { MorningWorkoutService } from '../morning/MorningWorkoutService';
import type { DayAutopilotService } from './DayAutopilotService';
import type { GetConnections } from '../connections/GetConnections';

export type ScenarioService = Pick<
  PlannerScenarios,
  'list' | 'create' | 'update' | 'addAction' | 'removeAction' | 'archive'
>;

export interface PlannerServices extends PlannerLibraryServices {
  readonly desktopFocusWindow?: DesktopFocusWindow;
  readonly pomodoroPreferences?: PomodoroPreferences;
  readonly connections: Pick<GetConnections, 'read' | 'more'>;
  readonly aiAssistant?: AiAssistant;
  readonly aiContext?: ReadAiContext;
  readonly analytics?: GetAnalyticsOverview;
  readonly walks?: WalkServices;
  readonly memory?: MemoryServices;
  readonly diary: DiaryService;
  readonly coldShower?: ColdShowerService;
  readonly morningWorkout?: MorningWorkoutService;
  readonly plannerScenarios?: ScenarioService;
  readonly dayAutopilot?: Pick<DayAutopilotService, 'preview' | 'apply'>;
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
  readonly sleepObservations: SleepObservationService;
  readonly sleepAlarmObservations: SleepAlarmObservationCoordinator;
  readonly accountSync: AccountSync;
}
