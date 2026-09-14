import type { BalanceServices } from '../../application/balance/BalanceServices';
import type { PlanningServices } from '../../application/planner/PlanningServices';
import { PlannerInbox } from '../../application/planner/PlannerInbox';
import { PlannerFocus } from '../../application/planner/PlannerFocus';
import { PlannerCatalog } from '../../application/planner/PlannerCatalog';
import type { DailyDirection } from '../../application/planner/DailyDirection';
import type { DeletePilotDirection } from '../../application/sync/pilot/DeletePilotDirection';
import type { DeletePilotSphere } from '../../application/sync/pilot/DeletePilotSphere';
import type { DeletePilotLifeAction } from '../../application/sync/pilot/DeletePilotLifeAction';
import type { ArchiveLifeAction } from '../../application/commands/ArchiveLifeAction';
import type { EditPlannerActionDraft } from '../../application/commands/EditPlannerActionDraft';
import type { SetLifeActionParent } from '../../application/commands/SetLifeActionParent';
import type { SelectGoalNextAction } from '../../application/commands/SelectGoalNextAction';
import type {
  ActionSessionRepository,
  SyncApplication,
  Clock,
  CompleteCurrentDay,
  CompleteEveningCycle,
  CorrectJournalData,
  CompleteActionSession,
  CompleteLifeAction,
  SetLifeActionGoal,
  SetLifeActionPlan,
  GetPlannerToday,
  CreateLifeActionDraft,
  VerifyLifeActionResult,
  CancelDecisionSafely,
  DeleteDecisionSafely,
  RestoreDeletedDecision,
  CancelLifeActionSafely,
  ConfirmDecisionFromActions,
  CreateDecisionForDate,
  CreateLifeActionForDecision,
  CurrentDateProvider,
  DayRepository,
  DecisionRepository,
  DetectEveningPatterns,
  GetEveningSignals,
  GetEveningRecommendations,
  GetEveningAnalytics,
  RecommendationApplicationRepository,
  RecommendationApplicationService,
  GetDecisionsForDate,
  GetDecisionsForProject,
  GetDeletedDecisions,
  GetEveningReview,
  GetEveningCycleReview,
  GetEveningHistory,
  GetEveningHistorySummary,
  GetApplicationMode,
  GetOpenLoopsForDay,
  GetDecisionById,
  GetDecisionOverview,
  GetLifeActionsForDecision,
  GetHistoryForDateRange,
  GetJournalTimeline,
  GetStatistics,
  GetActionListsForDate,
  GetLifeActionsForDate,
  GetActionSessionsForLifeAction,
  GetUnfinishedActionSession,
  GetOpenDayConflict,
  ResolveOpenDayConflict,
  ResolveOpenLoop,
  IdGenerator,
  LifeActionRepository,
  JournalRepository,
  PauseActionSession,
  ResumeActionSession,
  RescheduleDecisionSafely,
  RescheduleLifeActionSafely,
  StartCurrentDay,
  StartLifeActionSession,
  UpdateDecisionDetails,
  UpdateLifeActionDetails,
  RoutineBlockRepository,
  CreateRoutineBlock,
  UpdateRoutineBlock,
  DeleteRoutineBlock,
  GetRoutineBlocksForDate,
  GetRoutineActionOptions,
  GetRoutineActionDetails,
  RoutineOccurrenceOverrideRepository,
  DelayRoutineOccurrence,
  SkipRoutineOccurrence,
  RescheduleRoutineOccurrence,
  ShortenRoutineOccurrence,
  ReplaceRoutineOccurrenceAction,
  ClearRoutineOccurrenceOverride,
  RoutineOccurrenceExecutionRepository,
  GetRoutinePlanFactForDate,
  GetRoutineExecutionForOccurrence,
  GetRunningRoutineOccurrence,
  StartRoutineOccurrence,
  CompleteRoutineOccurrence,
  AbandonRoutineOccurrence,
  WalkRepository,
  WalkCaptureRepository,
  CreateWalkCapture,
  UpdateWalkCapture,
  ProcessWalkCapture,
  GetPendingWalkCaptures,
  GetWalkCaptures,
  GetWalkCaptureById,
  AdvanceWalkReflectionStage,
  AbandonWalk,
  CompleteWalk,
  CompleteWalkReentry,
  CloseWalkReentry,
  CreateWalk,
  DeleteWalk,
  DisableWalkReflectionGuidance,
  GetActiveWalk,
  GetPendingWalkReentry,
  GetWalkStatistics,
  GetWalkAnalytics,
  GetWalkRecommendation,
  GetWalksForDate,
  GetWalkHistory,
  GetWalkHistoryDetail,
  GetRunningWalk,
  PauseWalk,
  RecordWalkOutcome,
  ResumeWalk,
  StartRoutineWalk,
  StartDecisionWalk,
  GetLatestWalkOutcomeForDecision,
  StartWalk,
  UpdateWalkPhoto,
  UpdateWalkSphere,
  UpdateDayResultSphere,
  SphereRepository,
  CreateSphere,
  UpdateSphere,
  ArchiveSphere,
  RestoreSphere,
  GetSpheres,
  DirectionRepository,
  ProjectRepository,
  CreateDirection,
  UpdateDirection,
  ArchiveDirection,
  RestoreDirection,
  MakeDirectionMain,
  GetDirections,
  GetDirectionsForSphere,
  GetDirectionsOverview,
  GetDirectionDetails,
  CreateProject,
  UpdateProject,
  ArchiveProject,
  RestoreProject,
  CompleteProject,
  PauseProject,
  ResumeProject,
  MakeProjectMain,
  GetProjects,
  GetProjectsForSphere,
  GetProjectsForDirection,
  GetProjectById,
  GetProjectLifeActions,
  GetManagementOverview,
  GoalRepository,
  CreateGoal,
  UpdateGoal,
  ArchiveGoal,
  DeletePilotGoal,
  GetGoalById,
  GetGoals,
  ApplyDirectionStrategicReview,
  GetMorningCenterOverview,
  GetMorningCompletionOverview,
  GetMorningHistory,
  GetMorningOverview,
  MorningCycleApplicationService,
  MorningCycleRepository,
  ExerciseDefinitionRepository,
  GetMorningPhysicalActivationOverview,
  GetMorningPhysicalExecutionOverview,
  MorningExerciseCatalogService,
  EveningCycleApplicationService,
  EveningCycleRepository,
  GetReflectionContext,
  ReflectionApplicationService,
  TomorrowPlanRepository,
  TomorrowPlanService,
  PreparationPlanRepository,
  PreparationService,
  RelaxationApplicationService,
  SleepCheckApplicationService,
} from '../../application';
import { EnsureCurrentDay } from '../../application';
import type { Day, DayDate } from '../../domain';
import type { BrowserLocalSettingsStore } from '../settings/BrowserLocalSettingsStore';

interface LifeOsApplicationServices {
  readonly sync: SyncApplication;
  readonly localSettings: BrowserLocalSettingsStore;
  readonly dayRepository: DayRepository;
  readonly decisionRepository: DecisionRepository;
  readonly lifeActionRepository: LifeActionRepository;
  readonly actionSessionRepository: ActionSessionRepository;
  readonly morningCycleRepository: MorningCycleRepository;
  readonly exerciseDefinitionRepository: ExerciseDefinitionRepository;
  readonly eveningCycleRepository: EveningCycleRepository;
  readonly tomorrowPlanRepository: TomorrowPlanRepository;
  readonly preparationPlanRepository: PreparationPlanRepository;
  readonly recommendationApplicationRepository: RecommendationApplicationRepository;
  readonly routineBlockRepository: RoutineBlockRepository;
  readonly routineOccurrenceOverrideRepository: RoutineOccurrenceOverrideRepository;
  readonly routineOccurrenceExecutionRepository: RoutineOccurrenceExecutionRepository;
  readonly walkRepository: WalkRepository;
  readonly walkCaptureRepository: WalkCaptureRepository;
  readonly createWalkCapture: CreateWalkCapture;
  readonly updateWalkCapture: UpdateWalkCapture;
  readonly processWalkCapture: ProcessWalkCapture;
  readonly getPendingWalkCaptures: GetPendingWalkCaptures;
  readonly getWalkCaptures: GetWalkCaptures;
  readonly getWalkCaptureById: GetWalkCaptureById;
  readonly sphereRepository: SphereRepository;
  readonly directionRepository: DirectionRepository;
  readonly projectRepository: ProjectRepository;
  readonly goalRepository: GoalRepository;
  readonly journalRepository: JournalRepository;
  readonly clock: Clock;
  readonly currentDateProvider: CurrentDateProvider;
  readonly idGenerator: IdGenerator;
  readonly ensureCurrentDay: EnsureCurrentDay;
  readonly currentDay: Day;
  readonly currentDate: DayDate;
  readonly startCurrentDay: StartCurrentDay;
  readonly getEveningReview: GetEveningReview;
  readonly getEveningCycleReview: GetEveningCycleReview;
  readonly getEveningHistory: GetEveningHistory;
  readonly getEveningHistorySummary: GetEveningHistorySummary;
  readonly detectEveningPatterns: DetectEveningPatterns;
  readonly getEveningSignals: GetEveningSignals;
  readonly getEveningRecommendations: GetEveningRecommendations;
  readonly getEveningAnalytics: GetEveningAnalytics;
  readonly recommendationApplications: RecommendationApplicationService;
  readonly getApplicationMode: GetApplicationMode;
  readonly getOpenLoopsForDay: GetOpenLoopsForDay;
  readonly resolveOpenLoop: ResolveOpenLoop;
  readonly morningCycle: MorningCycleApplicationService;
  readonly morningExerciseCatalog: MorningExerciseCatalogService;
  readonly eveningCycle: EveningCycleApplicationService;
  readonly getReflectionContext: GetReflectionContext;
  readonly reflection: ReflectionApplicationService;
  readonly tomorrowPlan: TomorrowPlanService;
  readonly preparation: PreparationService;
  readonly relaxation: RelaxationApplicationService;
  readonly sleepCheck: SleepCheckApplicationService;
  readonly completeEveningCycle: CompleteEveningCycle;
  readonly completeCurrentDay: CompleteCurrentDay;
  readonly updateDayResultSphere: UpdateDayResultSphere;
  readonly createDecisionForDate: CreateDecisionForDate;
  readonly getDecisionsForDate: GetDecisionsForDate;
  readonly getDecisionsForProject: GetDecisionsForProject;
  readonly getProjectLifeActions: GetProjectLifeActions;
  readonly getDeletedDecisions: GetDeletedDecisions;
  readonly getDecisionById: GetDecisionById;
  readonly getDecisionOverview: GetDecisionOverview;
  readonly getActionListsForDate: GetActionListsForDate;
  readonly getLifeActionsForDate: GetLifeActionsForDate;
  readonly getLifeActionsForDecision: GetLifeActionsForDecision;
  readonly getHistoryForDateRange: GetHistoryForDateRange;
  readonly getJournalTimeline: GetJournalTimeline;
  readonly getStatistics: GetStatistics;
  readonly correctJournalData: CorrectJournalData;
  readonly createLifeActionForDecision: CreateLifeActionForDecision;
  readonly startLifeActionSession: StartLifeActionSession;
  readonly pauseActionSession: PauseActionSession;
  readonly resumeActionSession: ResumeActionSession;
  readonly completeActionSession: CompleteActionSession;
  readonly createLifeActionDraft: CreateLifeActionDraft;
  readonly setLifeActionGoal: SetLifeActionGoal;
  readonly editPlannerActionDraft: EditPlannerActionDraft;
  readonly setLifeActionParent: SetLifeActionParent;
  readonly selectGoalNextAction: SelectGoalNextAction;
  readonly setLifeActionPlan: SetLifeActionPlan;
  readonly plannerInbox: PlannerInbox;
  readonly planning: PlanningServices;
  readonly balance: BalanceServices;
  readonly plannerFocus: PlannerFocus;
  readonly plannerCatalog: PlannerCatalog;
  readonly dailyDirection: DailyDirection;
  readonly getPlannerToday: GetPlannerToday;
  readonly completeLifeAction: CompleteLifeAction;
  readonly verifyLifeActionResult: VerifyLifeActionResult;
  readonly confirmDecisionFromActions: ConfirmDecisionFromActions;
  readonly updateDecisionDetails: UpdateDecisionDetails;
  readonly cancelDecisionSafely: CancelDecisionSafely;
  readonly deleteDecisionSafely: DeleteDecisionSafely;
  readonly restoreDeletedDecision: RestoreDeletedDecision;
  readonly updateLifeActionDetails: UpdateLifeActionDetails;
  readonly cancelLifeActionSafely: CancelLifeActionSafely;
  readonly rescheduleDecisionSafely: RescheduleDecisionSafely;
  readonly rescheduleLifeActionSafely: RescheduleLifeActionSafely;
  readonly getActionSessionsForLifeAction: GetActionSessionsForLifeAction;
  readonly getUnfinishedActionSession: GetUnfinishedActionSession;
  readonly getOpenDayConflict: GetOpenDayConflict;
  readonly resolveOpenDayConflict: ResolveOpenDayConflict;
  readonly createRoutineBlock: CreateRoutineBlock;
  readonly updateRoutineBlock: UpdateRoutineBlock;
  readonly deleteRoutineBlock: DeleteRoutineBlock;
  readonly getRoutineBlocksForDate: GetRoutineBlocksForDate;
  readonly getMorningCenterOverview: GetMorningCenterOverview;
  readonly getMorningCompletionOverview: GetMorningCompletionOverview;
  readonly getMorningHistory: GetMorningHistory;
  readonly getMorningPhysicalActivationOverview: GetMorningPhysicalActivationOverview;
  readonly getMorningPhysicalExecutionOverview: GetMorningPhysicalExecutionOverview;
  readonly getMorningOverview: GetMorningOverview;
  readonly getRoutineActionOptions: GetRoutineActionOptions;
  readonly getRoutineActionDetails: GetRoutineActionDetails;
  readonly delayRoutineOccurrence: DelayRoutineOccurrence;
  readonly skipRoutineOccurrence: SkipRoutineOccurrence;
  readonly rescheduleRoutineOccurrence: RescheduleRoutineOccurrence;
  readonly shortenRoutineOccurrence: ShortenRoutineOccurrence;
  readonly replaceRoutineOccurrenceAction: ReplaceRoutineOccurrenceAction;
  readonly clearRoutineOccurrenceOverride: ClearRoutineOccurrenceOverride;
  readonly getRoutinePlanFactForDate: GetRoutinePlanFactForDate;
  readonly getRoutineExecutionForOccurrence: GetRoutineExecutionForOccurrence;
  readonly getRunningRoutineOccurrence: GetRunningRoutineOccurrence;
  readonly startRoutineOccurrence: StartRoutineOccurrence;
  readonly completeRoutineOccurrence: CompleteRoutineOccurrence;
  readonly abandonRoutineOccurrence: AbandonRoutineOccurrence;
  readonly createWalk: CreateWalk;
  readonly startRoutineWalk: StartRoutineWalk;
  readonly startDecisionWalk: StartDecisionWalk;
  readonly getLatestWalkOutcomeForDecision: GetLatestWalkOutcomeForDecision;
  readonly advanceWalkReflectionStage: AdvanceWalkReflectionStage;
  readonly disableWalkReflectionGuidance: DisableWalkReflectionGuidance;
  readonly completeWalk: CompleteWalk;
  readonly completeWalkReentry: CompleteWalkReentry;
  readonly closeWalkReentry: CloseWalkReentry;
  readonly recordWalkOutcome: RecordWalkOutcome;
  readonly abandonWalk: AbandonWalk;
  readonly deleteWalk: DeleteWalk;
  readonly getActiveWalk: GetActiveWalk;
  readonly getPendingWalkReentry: GetPendingWalkReentry;
  readonly getWalkStatistics: GetWalkStatistics;
  readonly getWalkAnalytics: GetWalkAnalytics;
  readonly getWalkRecommendation: GetWalkRecommendation;
  readonly getWalksForDate: GetWalksForDate;
  readonly getWalkHistory: GetWalkHistory;
  readonly getWalkHistoryDetail: GetWalkHistoryDetail;
  readonly getRunningWalk: GetRunningWalk;
  readonly pauseWalk: PauseWalk;
  readonly resumeWalk: ResumeWalk;
  readonly startWalk: StartWalk;
  readonly updateWalkPhoto: UpdateWalkPhoto;
  readonly updateWalkSphere: UpdateWalkSphere;
  readonly createSphere: CreateSphere;
  readonly updateSphere: UpdateSphere;
  readonly archiveSphere: ArchiveSphere;
  readonly restoreSphere: RestoreSphere;
  readonly getSpheres: GetSpheres;
  readonly createDirection: CreateDirection;
  readonly updateDirection: UpdateDirection;
  readonly archiveDirection: ArchiveDirection;
  readonly restoreDirection: RestoreDirection;
  readonly makeDirectionMain: MakeDirectionMain;
  readonly getDirections: GetDirections;
  readonly getDirectionsForSphere: GetDirectionsForSphere;
  readonly getDirectionsOverview: GetDirectionsOverview;
  readonly getManagementOverview: GetManagementOverview;
  readonly getDirectionDetails: GetDirectionDetails;
  readonly applyDirectionStrategicReview: ApplyDirectionStrategicReview;
  readonly createProject: CreateProject;
  readonly updateProject: UpdateProject;
  readonly archiveProject: ArchiveProject;
  readonly restoreProject: RestoreProject;
  readonly completeProject: CompleteProject;
  readonly pauseProject: PauseProject;
  readonly resumeProject: ResumeProject;
  readonly makeProjectMain: MakeProjectMain;
  readonly getProjects: GetProjects;
  readonly getProjectsForSphere: GetProjectsForSphere;
  readonly getProjectsForDirection: GetProjectsForDirection;
  readonly getProjectById: GetProjectById;
  readonly createGoal: CreateGoal;
  readonly updateGoal: UpdateGoal;
  readonly archiveGoal: ArchiveGoal;
  readonly deletePilotGoal: DeletePilotGoal;
  readonly deletePilotDirection: DeletePilotDirection;
  readonly deletePilotSphere: DeletePilotSphere;
  readonly deletePilotLifeAction: DeletePilotLifeAction;
  readonly archiveLifeAction: ArchiveLifeAction;
  readonly getGoalById: GetGoalById;
  readonly getGoals: GetGoals;
  readonly closeDatabase: () => void;
}

export class LifeOsApplication {
  public readonly sync: SyncApplication;
  public readonly localSettings: BrowserLocalSettingsStore;
  public readonly dayRepository: DayRepository;
  public readonly decisionRepository: DecisionRepository;
  public readonly lifeActionRepository: LifeActionRepository;
  public readonly actionSessionRepository: ActionSessionRepository;
  public readonly morningCycleRepository: MorningCycleRepository;
  public readonly exerciseDefinitionRepository: ExerciseDefinitionRepository;
  public readonly eveningCycleRepository: EveningCycleRepository;
  public readonly tomorrowPlanRepository: TomorrowPlanRepository;
  public readonly preparationPlanRepository: PreparationPlanRepository;
  public readonly recommendationApplicationRepository: RecommendationApplicationRepository;
  public readonly routineBlockRepository: RoutineBlockRepository;
  public readonly routineOccurrenceOverrideRepository: RoutineOccurrenceOverrideRepository;
  public readonly routineOccurrenceExecutionRepository: RoutineOccurrenceExecutionRepository;
  public readonly walkRepository: WalkRepository;
  public readonly walkCaptureRepository: WalkCaptureRepository;
  public readonly createWalkCapture: CreateWalkCapture;
  public readonly updateWalkCapture: UpdateWalkCapture;
  public readonly processWalkCapture: ProcessWalkCapture;
  public readonly getPendingWalkCaptures: GetPendingWalkCaptures;
  public readonly getWalkCaptures: GetWalkCaptures;
  public readonly getWalkCaptureById: GetWalkCaptureById;
  public readonly sphereRepository: SphereRepository;
  public readonly directionRepository: DirectionRepository;
  public readonly projectRepository: ProjectRepository;
  public readonly goalRepository: GoalRepository;
  public readonly journalRepository: JournalRepository;
  public readonly clock: Clock;
  public readonly currentDateProvider: CurrentDateProvider;
  public readonly idGenerator: IdGenerator;
  public readonly ensureCurrentDay: EnsureCurrentDay;
  public readonly currentDay: Day;
  public readonly currentDate: DayDate;
  public readonly startCurrentDay: StartCurrentDay;
  public readonly getEveningReview: GetEveningReview;
  public readonly getEveningCycleReview: GetEveningCycleReview;
  public readonly getEveningHistory: GetEveningHistory;
  public readonly getEveningHistorySummary: GetEveningHistorySummary;
  public readonly detectEveningPatterns: DetectEveningPatterns;
  public readonly getEveningSignals: GetEveningSignals;
  public readonly getEveningRecommendations: GetEveningRecommendations;
  public readonly getEveningAnalytics: GetEveningAnalytics;
  public readonly recommendationApplications: RecommendationApplicationService;
  public readonly getApplicationMode: GetApplicationMode;
  public readonly getOpenLoopsForDay: GetOpenLoopsForDay;
  public readonly resolveOpenLoop: ResolveOpenLoop;
  public readonly morningCycle: MorningCycleApplicationService;
  public readonly morningExerciseCatalog: MorningExerciseCatalogService;
  public readonly eveningCycle: EveningCycleApplicationService;
  public readonly getReflectionContext: GetReflectionContext;
  public readonly reflection: ReflectionApplicationService;
  public readonly tomorrowPlan: TomorrowPlanService;
  public readonly preparation: PreparationService;
  public readonly relaxation: RelaxationApplicationService;
  public readonly sleepCheck: SleepCheckApplicationService;
  public readonly completeEveningCycle: CompleteEveningCycle;
  public readonly completeCurrentDay: CompleteCurrentDay;
  public readonly updateDayResultSphere: UpdateDayResultSphere;
  public readonly createDecisionForDate: CreateDecisionForDate;
  public readonly getDecisionsForDate: GetDecisionsForDate;
  public readonly getDecisionsForProject: GetDecisionsForProject;
  public readonly getProjectLifeActions: GetProjectLifeActions;
  public readonly getDeletedDecisions: GetDeletedDecisions;
  public readonly getDecisionById: GetDecisionById;
  public readonly getDecisionOverview: GetDecisionOverview;
  public readonly getActionListsForDate: GetActionListsForDate;
  public readonly getLifeActionsForDate: GetLifeActionsForDate;
  public readonly getLifeActionsForDecision: GetLifeActionsForDecision;
  public readonly getHistoryForDateRange: GetHistoryForDateRange;
  public readonly getJournalTimeline: GetJournalTimeline;
  public readonly getStatistics: GetStatistics;
  public readonly correctJournalData: CorrectJournalData;
  public readonly createLifeActionForDecision: CreateLifeActionForDecision;
  public readonly startLifeActionSession: StartLifeActionSession;
  public readonly pauseActionSession: PauseActionSession;
  public readonly resumeActionSession: ResumeActionSession;
  public readonly completeActionSession: CompleteActionSession;
  public readonly createLifeActionDraft: CreateLifeActionDraft;
  public readonly setLifeActionGoal: SetLifeActionGoal;
  public readonly editPlannerActionDraft: EditPlannerActionDraft;
  public readonly setLifeActionParent: SetLifeActionParent;
  public readonly selectGoalNextAction: SelectGoalNextAction;
  public readonly setLifeActionPlan: SetLifeActionPlan;
  public readonly plannerInbox: PlannerInbox;
  public readonly planning: PlanningServices;
  public readonly balance: BalanceServices;
  public readonly plannerFocus: PlannerFocus;
  public readonly plannerCatalog: PlannerCatalog;
  public readonly dailyDirection: DailyDirection;
  public readonly getPlannerToday: GetPlannerToday;
  public readonly completeLifeAction: CompleteLifeAction;
  public readonly verifyLifeActionResult: VerifyLifeActionResult;
  public readonly confirmDecisionFromActions: ConfirmDecisionFromActions;
  public readonly updateDecisionDetails: UpdateDecisionDetails;
  public readonly cancelDecisionSafely: CancelDecisionSafely;
  public readonly deleteDecisionSafely: DeleteDecisionSafely;
  public readonly restoreDeletedDecision: RestoreDeletedDecision;
  public readonly updateLifeActionDetails: UpdateLifeActionDetails;
  public readonly cancelLifeActionSafely: CancelLifeActionSafely;
  public readonly rescheduleDecisionSafely: RescheduleDecisionSafely;
  public readonly rescheduleLifeActionSafely: RescheduleLifeActionSafely;
  public readonly getActionSessionsForLifeAction: GetActionSessionsForLifeAction;
  public readonly getUnfinishedActionSession: GetUnfinishedActionSession;
  public readonly getOpenDayConflict: GetOpenDayConflict;
  public readonly resolveOpenDayConflict: ResolveOpenDayConflict;
  public readonly createRoutineBlock: CreateRoutineBlock;
  public readonly updateRoutineBlock: UpdateRoutineBlock;
  public readonly deleteRoutineBlock: DeleteRoutineBlock;
  public readonly getRoutineBlocksForDate: GetRoutineBlocksForDate;
  public readonly getMorningCenterOverview: GetMorningCenterOverview;
  public readonly getMorningCompletionOverview: GetMorningCompletionOverview;
  public readonly getMorningHistory: GetMorningHistory;
  public readonly getMorningPhysicalActivationOverview: GetMorningPhysicalActivationOverview;
  public readonly getMorningPhysicalExecutionOverview: GetMorningPhysicalExecutionOverview;
  public readonly getMorningOverview: GetMorningOverview;
  public readonly getRoutineActionOptions: GetRoutineActionOptions;
  public readonly getRoutineActionDetails: GetRoutineActionDetails;
  public readonly delayRoutineOccurrence: DelayRoutineOccurrence;
  public readonly skipRoutineOccurrence: SkipRoutineOccurrence;
  public readonly rescheduleRoutineOccurrence: RescheduleRoutineOccurrence;
  public readonly shortenRoutineOccurrence: ShortenRoutineOccurrence;
  public readonly replaceRoutineOccurrenceAction: ReplaceRoutineOccurrenceAction;
  public readonly clearRoutineOccurrenceOverride: ClearRoutineOccurrenceOverride;
  public readonly getRoutinePlanFactForDate: GetRoutinePlanFactForDate;
  public readonly getRoutineExecutionForOccurrence: GetRoutineExecutionForOccurrence;
  public readonly getRunningRoutineOccurrence: GetRunningRoutineOccurrence;
  public readonly startRoutineOccurrence: StartRoutineOccurrence;
  public readonly completeRoutineOccurrence: CompleteRoutineOccurrence;
  public readonly abandonRoutineOccurrence: AbandonRoutineOccurrence;
  public readonly createWalk: CreateWalk;
  public readonly startRoutineWalk: StartRoutineWalk;
  public readonly startDecisionWalk: StartDecisionWalk;
  public readonly getLatestWalkOutcomeForDecision: GetLatestWalkOutcomeForDecision;
  public readonly advanceWalkReflectionStage: AdvanceWalkReflectionStage;
  public readonly disableWalkReflectionGuidance: DisableWalkReflectionGuidance;
  public readonly completeWalk: CompleteWalk;
  public readonly completeWalkReentry: CompleteWalkReentry;
  public readonly closeWalkReentry: CloseWalkReentry;
  public readonly recordWalkOutcome: RecordWalkOutcome;
  public readonly abandonWalk: AbandonWalk;
  public readonly deleteWalk: DeleteWalk;
  public readonly getActiveWalk: GetActiveWalk;
  public readonly getPendingWalkReentry: GetPendingWalkReentry;
  public readonly getWalkStatistics: GetWalkStatistics;
  public readonly getWalkAnalytics: GetWalkAnalytics;
  public readonly getWalkRecommendation: GetWalkRecommendation;
  public readonly getWalksForDate: GetWalksForDate;
  public readonly getWalkHistory: GetWalkHistory;
  public readonly getWalkHistoryDetail: GetWalkHistoryDetail;
  public readonly getRunningWalk: GetRunningWalk;
  public readonly pauseWalk: PauseWalk;
  public readonly resumeWalk: ResumeWalk;
  public readonly startWalk: StartWalk;
  public readonly updateWalkPhoto: UpdateWalkPhoto;
  public readonly updateWalkSphere: UpdateWalkSphere;
  public readonly createSphere: CreateSphere;
  public readonly updateSphere: UpdateSphere;
  public readonly archiveSphere: ArchiveSphere;
  public readonly restoreSphere: RestoreSphere;
  public readonly getSpheres: GetSpheres;
  public readonly createDirection: CreateDirection;
  public readonly updateDirection: UpdateDirection;
  public readonly archiveDirection: ArchiveDirection;
  public readonly restoreDirection: RestoreDirection;
  public readonly makeDirectionMain: MakeDirectionMain;
  public readonly getDirections: GetDirections;
  public readonly getDirectionsForSphere: GetDirectionsForSphere;
  public readonly getDirectionsOverview: GetDirectionsOverview;
  public readonly getManagementOverview: GetManagementOverview;
  public readonly getDirectionDetails: GetDirectionDetails;
  public readonly applyDirectionStrategicReview: ApplyDirectionStrategicReview;
  public readonly createProject: CreateProject;
  public readonly updateProject: UpdateProject;
  public readonly archiveProject: ArchiveProject;
  public readonly restoreProject: RestoreProject;
  public readonly completeProject: CompleteProject;
  public readonly pauseProject: PauseProject;
  public readonly resumeProject: ResumeProject;
  public readonly makeProjectMain: MakeProjectMain;
  public readonly getProjects: GetProjects;
  public readonly getProjectsForSphere: GetProjectsForSphere;
  public readonly getProjectsForDirection: GetProjectsForDirection;
  public readonly getProjectById: GetProjectById;
  public readonly createGoal: CreateGoal;
  public readonly updateGoal: UpdateGoal;
  public readonly archiveGoal: ArchiveGoal;
  public readonly deletePilotGoal: DeletePilotGoal;
  public readonly deletePilotDirection: DeletePilotDirection;
  public readonly deletePilotSphere: DeletePilotSphere;
  public readonly deletePilotLifeAction: DeletePilotLifeAction;
  public readonly archiveLifeAction: ArchiveLifeAction;
  public readonly getGoalById: GetGoalById;
  public readonly getGoals: GetGoals;

  readonly #closeDatabase: () => void;

  public constructor(services: LifeOsApplicationServices) {
    this.sync = services.sync;
    this.localSettings = services.localSettings;
    this.dayRepository = services.dayRepository;
    this.decisionRepository = services.decisionRepository;
    this.lifeActionRepository = services.lifeActionRepository;
    this.actionSessionRepository = services.actionSessionRepository;
    this.morningCycleRepository = services.morningCycleRepository;
    this.exerciseDefinitionRepository = services.exerciseDefinitionRepository;
    this.eveningCycleRepository = services.eveningCycleRepository;
    this.tomorrowPlanRepository = services.tomorrowPlanRepository;
    this.preparationPlanRepository = services.preparationPlanRepository;
    this.recommendationApplicationRepository = services.recommendationApplicationRepository;
    this.routineBlockRepository = services.routineBlockRepository;
    this.routineOccurrenceOverrideRepository = services.routineOccurrenceOverrideRepository;
    this.routineOccurrenceExecutionRepository = services.routineOccurrenceExecutionRepository;
    this.walkRepository = services.walkRepository;
    this.walkCaptureRepository = services.walkCaptureRepository;
    this.createWalkCapture = services.createWalkCapture;
    this.updateWalkCapture = services.updateWalkCapture;
    this.processWalkCapture = services.processWalkCapture;
    this.getPendingWalkCaptures = services.getPendingWalkCaptures;
    this.getWalkCaptures = services.getWalkCaptures;
    this.getWalkCaptureById = services.getWalkCaptureById;
    this.sphereRepository = services.sphereRepository;
    this.directionRepository = services.directionRepository;
    this.projectRepository = services.projectRepository;
    this.goalRepository = services.goalRepository;
    this.journalRepository = services.journalRepository;
    this.clock = services.clock;
    this.currentDateProvider = services.currentDateProvider;
    this.idGenerator = services.idGenerator;
    this.ensureCurrentDay = services.ensureCurrentDay;
    this.currentDay = services.currentDay;
    this.currentDate = services.currentDate;
    this.startCurrentDay = services.startCurrentDay;
    this.getEveningReview = services.getEveningReview;
    this.getEveningCycleReview = services.getEveningCycleReview;
    this.getEveningHistory = services.getEveningHistory;
    this.getEveningHistorySummary = services.getEveningHistorySummary;
    this.detectEveningPatterns = services.detectEveningPatterns;
    this.getEveningSignals = services.getEveningSignals;
    this.getEveningRecommendations = services.getEveningRecommendations;
    this.getEveningAnalytics = services.getEveningAnalytics;
    this.recommendationApplications = services.recommendationApplications;
    this.getApplicationMode = services.getApplicationMode;
    this.getOpenLoopsForDay = services.getOpenLoopsForDay;
    this.resolveOpenLoop = services.resolveOpenLoop;
    this.morningCycle = services.morningCycle;
    this.morningExerciseCatalog = services.morningExerciseCatalog;
    this.eveningCycle = services.eveningCycle;
    this.getReflectionContext = services.getReflectionContext;
    this.reflection = services.reflection;
    this.tomorrowPlan = services.tomorrowPlan;
    this.preparation = services.preparation;
    this.relaxation = services.relaxation;
    this.sleepCheck = services.sleepCheck;
    this.completeEveningCycle = services.completeEveningCycle;
    this.completeCurrentDay = services.completeCurrentDay;
    this.updateDayResultSphere = services.updateDayResultSphere;
    this.createDecisionForDate = services.createDecisionForDate;
    this.getDecisionsForDate = services.getDecisionsForDate;
    this.getDecisionsForProject = services.getDecisionsForProject;
    this.getProjectLifeActions = services.getProjectLifeActions;
    this.getDeletedDecisions = services.getDeletedDecisions;
    this.getDecisionById = services.getDecisionById;
    this.getDecisionOverview = services.getDecisionOverview;
    this.getActionListsForDate = services.getActionListsForDate;
    this.getLifeActionsForDate = services.getLifeActionsForDate;
    this.getLifeActionsForDecision = services.getLifeActionsForDecision;
    this.getHistoryForDateRange = services.getHistoryForDateRange;
    this.getJournalTimeline = services.getJournalTimeline;
    this.getStatistics = services.getStatistics;
    this.correctJournalData = services.correctJournalData;
    this.createLifeActionForDecision = services.createLifeActionForDecision;
    this.startLifeActionSession = services.startLifeActionSession;
    this.pauseActionSession = services.pauseActionSession;
    this.resumeActionSession = services.resumeActionSession;
    this.completeActionSession = services.completeActionSession;
    this.createLifeActionDraft = services.createLifeActionDraft;
    this.setLifeActionGoal = services.setLifeActionGoal;
    this.setLifeActionPlan = services.setLifeActionPlan;
    this.plannerInbox = services.plannerInbox;
    this.planning = services.planning;
    this.balance = services.balance;
    this.plannerFocus = services.plannerFocus;
    this.plannerCatalog = services.plannerCatalog;
    this.editPlannerActionDraft = services.editPlannerActionDraft;
    this.setLifeActionParent = services.setLifeActionParent;
    this.selectGoalNextAction = services.selectGoalNextAction;
    this.dailyDirection = services.dailyDirection;
    this.getPlannerToday = services.getPlannerToday;
    this.completeLifeAction = services.completeLifeAction;
    this.verifyLifeActionResult = services.verifyLifeActionResult;
    this.confirmDecisionFromActions = services.confirmDecisionFromActions;
    this.updateDecisionDetails = services.updateDecisionDetails;
    this.cancelDecisionSafely = services.cancelDecisionSafely;
    this.deleteDecisionSafely = services.deleteDecisionSafely;
    this.restoreDeletedDecision = services.restoreDeletedDecision;
    this.updateLifeActionDetails = services.updateLifeActionDetails;
    this.cancelLifeActionSafely = services.cancelLifeActionSafely;
    this.rescheduleDecisionSafely = services.rescheduleDecisionSafely;
    this.rescheduleLifeActionSafely = services.rescheduleLifeActionSafely;
    this.getActionSessionsForLifeAction = services.getActionSessionsForLifeAction;
    this.getUnfinishedActionSession = services.getUnfinishedActionSession;
    this.getOpenDayConflict = services.getOpenDayConflict;
    this.resolveOpenDayConflict = services.resolveOpenDayConflict;
    this.createRoutineBlock = services.createRoutineBlock;
    this.updateRoutineBlock = services.updateRoutineBlock;
    this.deleteRoutineBlock = services.deleteRoutineBlock;
    this.getRoutineBlocksForDate = services.getRoutineBlocksForDate;
    this.getMorningCenterOverview = services.getMorningCenterOverview;
    this.getMorningCompletionOverview = services.getMorningCompletionOverview;
    this.getMorningHistory = services.getMorningHistory;
    this.getMorningPhysicalActivationOverview = services.getMorningPhysicalActivationOverview;
    this.getMorningPhysicalExecutionOverview = services.getMorningPhysicalExecutionOverview;
    this.getMorningOverview = services.getMorningOverview;
    this.getRoutineActionOptions = services.getRoutineActionOptions;
    this.getRoutineActionDetails = services.getRoutineActionDetails;
    this.delayRoutineOccurrence = services.delayRoutineOccurrence;
    this.skipRoutineOccurrence = services.skipRoutineOccurrence;
    this.rescheduleRoutineOccurrence = services.rescheduleRoutineOccurrence;
    this.shortenRoutineOccurrence = services.shortenRoutineOccurrence;
    this.replaceRoutineOccurrenceAction = services.replaceRoutineOccurrenceAction;
    this.clearRoutineOccurrenceOverride = services.clearRoutineOccurrenceOverride;
    this.getRoutinePlanFactForDate = services.getRoutinePlanFactForDate;
    this.getRoutineExecutionForOccurrence = services.getRoutineExecutionForOccurrence;
    this.getRunningRoutineOccurrence = services.getRunningRoutineOccurrence;
    this.startRoutineOccurrence = services.startRoutineOccurrence;
    this.completeRoutineOccurrence = services.completeRoutineOccurrence;
    this.abandonRoutineOccurrence = services.abandonRoutineOccurrence;
    this.createWalk = services.createWalk;
    this.startRoutineWalk = services.startRoutineWalk;
    this.startDecisionWalk = services.startDecisionWalk;
    this.getLatestWalkOutcomeForDecision = services.getLatestWalkOutcomeForDecision;
    this.advanceWalkReflectionStage = services.advanceWalkReflectionStage;
    this.disableWalkReflectionGuidance = services.disableWalkReflectionGuidance;
    this.completeWalk = services.completeWalk;
    this.completeWalkReentry = services.completeWalkReentry;
    this.closeWalkReentry = services.closeWalkReentry;
    this.recordWalkOutcome = services.recordWalkOutcome;
    this.abandonWalk = services.abandonWalk;
    this.deleteWalk = services.deleteWalk;
    this.getActiveWalk = services.getActiveWalk;
    this.getPendingWalkReentry = services.getPendingWalkReentry;
    this.getWalkStatistics = services.getWalkStatistics;
    this.getWalkAnalytics = services.getWalkAnalytics;
    this.getWalkRecommendation = services.getWalkRecommendation;
    this.getWalksForDate = services.getWalksForDate;
    this.getWalkHistory = services.getWalkHistory;
    this.getWalkHistoryDetail = services.getWalkHistoryDetail;
    this.getRunningWalk = services.getRunningWalk;
    this.pauseWalk = services.pauseWalk;
    this.resumeWalk = services.resumeWalk;
    this.startWalk = services.startWalk;
    this.updateWalkPhoto = services.updateWalkPhoto;
    this.updateWalkSphere = services.updateWalkSphere;
    this.createSphere = services.createSphere;
    this.updateSphere = services.updateSphere;
    this.archiveSphere = services.archiveSphere;
    this.restoreSphere = services.restoreSphere;
    this.getSpheres = services.getSpheres;
    this.createDirection = services.createDirection;
    this.updateDirection = services.updateDirection;
    this.archiveDirection = services.archiveDirection;
    this.restoreDirection = services.restoreDirection;
    this.makeDirectionMain = services.makeDirectionMain;
    this.getDirections = services.getDirections;
    this.getDirectionsForSphere = services.getDirectionsForSphere;
    this.getDirectionsOverview = services.getDirectionsOverview;
    this.getManagementOverview = services.getManagementOverview;
    this.getDirectionDetails = services.getDirectionDetails;
    this.applyDirectionStrategicReview = services.applyDirectionStrategicReview;
    this.createProject = services.createProject;
    this.updateProject = services.updateProject;
    this.archiveProject = services.archiveProject;
    this.restoreProject = services.restoreProject;
    this.completeProject = services.completeProject;
    this.pauseProject = services.pauseProject;
    this.resumeProject = services.resumeProject;
    this.makeProjectMain = services.makeProjectMain;
    this.getProjects = services.getProjects;
    this.getProjectsForSphere = services.getProjectsForSphere;
    this.getProjectsForDirection = services.getProjectsForDirection;
    this.getProjectById = services.getProjectById;
    this.createGoal = services.createGoal;
    this.updateGoal = services.updateGoal;
    this.archiveGoal = services.archiveGoal;
    this.deletePilotGoal = services.deletePilotGoal;
    this.deletePilotDirection = services.deletePilotDirection;
    this.deletePilotSphere = services.deletePilotSphere;
    this.deletePilotLifeAction = services.deletePilotLifeAction;
    this.archiveLifeAction = services.archiveLifeAction;
    this.getGoalById = services.getGoalById;
    this.getGoals = services.getGoals;
    this.#closeDatabase = services.closeDatabase;
  }

  public close(): void {
    void this.sync.close();
    this.#closeDatabase();
  }
}
