import type {
  ActionSessionRepository,
  Clock,
  CompleteCurrentDay,
  CompleteActionSession,
  CompleteLifeAction,
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
  GetDecisionsForDate,
  GetDeletedDecisions,
  GetEveningReview,
  GetDecisionById,
  GetDecisionOverview,
  GetLifeActionsForDecision,
  GetHistoryForDateRange,
  GetActionListsForDate,
  GetLifeActionsForDate,
  GetActionSessionsForLifeAction,
  GetUnfinishedActionSession,
  GetOpenDayConflict,
  ResolveOpenDayConflict,
  IdGenerator,
  LifeActionRepository,
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
  AbandonWalk,
  CompleteWalk,
  CreateWalk,
  DeleteWalk,
  GetWalkStatistics,
  GetWalksForDate,
  GetRunningWalk,
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
} from '../../application';
import { EnsureCurrentDay } from '../../application';
import type { Day, DayDate } from '../../domain';

interface LifeOsApplicationServices {
  readonly dayRepository: DayRepository;
  readonly decisionRepository: DecisionRepository;
  readonly lifeActionRepository: LifeActionRepository;
  readonly actionSessionRepository: ActionSessionRepository;
  readonly routineBlockRepository: RoutineBlockRepository;
  readonly routineOccurrenceOverrideRepository: RoutineOccurrenceOverrideRepository;
  readonly routineOccurrenceExecutionRepository: RoutineOccurrenceExecutionRepository;
  readonly walkRepository: WalkRepository;
  readonly sphereRepository: SphereRepository;
  readonly clock: Clock;
  readonly currentDateProvider: CurrentDateProvider;
  readonly idGenerator: IdGenerator;
  readonly ensureCurrentDay: EnsureCurrentDay;
  readonly currentDay: Day;
  readonly currentDate: DayDate;
  readonly startCurrentDay: StartCurrentDay;
  readonly getEveningReview: GetEveningReview;
  readonly completeCurrentDay: CompleteCurrentDay;
  readonly updateDayResultSphere: UpdateDayResultSphere;
  readonly createDecisionForDate: CreateDecisionForDate;
  readonly getDecisionsForDate: GetDecisionsForDate;
  readonly getDeletedDecisions: GetDeletedDecisions;
  readonly getDecisionById: GetDecisionById;
  readonly getDecisionOverview: GetDecisionOverview;
  readonly getActionListsForDate: GetActionListsForDate;
  readonly getLifeActionsForDate: GetLifeActionsForDate;
  readonly getLifeActionsForDecision: GetLifeActionsForDecision;
  readonly getHistoryForDateRange: GetHistoryForDateRange;
  readonly createLifeActionForDecision: CreateLifeActionForDecision;
  readonly startLifeActionSession: StartLifeActionSession;
  readonly pauseActionSession: PauseActionSession;
  readonly resumeActionSession: ResumeActionSession;
  readonly completeActionSession: CompleteActionSession;
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
  readonly completeWalk: CompleteWalk;
  readonly abandonWalk: AbandonWalk;
  readonly deleteWalk: DeleteWalk;
  readonly getWalkStatistics: GetWalkStatistics;
  readonly getWalksForDate: GetWalksForDate;
  readonly getRunningWalk: GetRunningWalk;
  readonly startWalk: StartWalk;
  readonly updateWalkPhoto: UpdateWalkPhoto;
  readonly updateWalkSphere: UpdateWalkSphere;
  readonly createSphere: CreateSphere;
  readonly updateSphere: UpdateSphere;
  readonly archiveSphere: ArchiveSphere;
  readonly restoreSphere: RestoreSphere;
  readonly getSpheres: GetSpheres;
  readonly closeDatabase: () => void;
}

export class LifeOsApplication {
  public readonly dayRepository: DayRepository;
  public readonly decisionRepository: DecisionRepository;
  public readonly lifeActionRepository: LifeActionRepository;
  public readonly actionSessionRepository: ActionSessionRepository;
  public readonly routineBlockRepository: RoutineBlockRepository;
  public readonly routineOccurrenceOverrideRepository: RoutineOccurrenceOverrideRepository;
  public readonly routineOccurrenceExecutionRepository: RoutineOccurrenceExecutionRepository;
  public readonly walkRepository: WalkRepository;
  public readonly sphereRepository: SphereRepository;
  public readonly clock: Clock;
  public readonly currentDateProvider: CurrentDateProvider;
  public readonly idGenerator: IdGenerator;
  public readonly ensureCurrentDay: EnsureCurrentDay;
  public readonly currentDay: Day;
  public readonly currentDate: DayDate;
  public readonly startCurrentDay: StartCurrentDay;
  public readonly getEveningReview: GetEveningReview;
  public readonly completeCurrentDay: CompleteCurrentDay;
  public readonly updateDayResultSphere: UpdateDayResultSphere;
  public readonly createDecisionForDate: CreateDecisionForDate;
  public readonly getDecisionsForDate: GetDecisionsForDate;
  public readonly getDeletedDecisions: GetDeletedDecisions;
  public readonly getDecisionById: GetDecisionById;
  public readonly getDecisionOverview: GetDecisionOverview;
  public readonly getActionListsForDate: GetActionListsForDate;
  public readonly getLifeActionsForDate: GetLifeActionsForDate;
  public readonly getLifeActionsForDecision: GetLifeActionsForDecision;
  public readonly getHistoryForDateRange: GetHistoryForDateRange;
  public readonly createLifeActionForDecision: CreateLifeActionForDecision;
  public readonly startLifeActionSession: StartLifeActionSession;
  public readonly pauseActionSession: PauseActionSession;
  public readonly resumeActionSession: ResumeActionSession;
  public readonly completeActionSession: CompleteActionSession;
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
  public readonly completeWalk: CompleteWalk;
  public readonly abandonWalk: AbandonWalk;
  public readonly deleteWalk: DeleteWalk;
  public readonly getWalkStatistics: GetWalkStatistics;
  public readonly getWalksForDate: GetWalksForDate;
  public readonly getRunningWalk: GetRunningWalk;
  public readonly startWalk: StartWalk;
  public readonly updateWalkPhoto: UpdateWalkPhoto;
  public readonly updateWalkSphere: UpdateWalkSphere;
  public readonly createSphere: CreateSphere;
  public readonly updateSphere: UpdateSphere;
  public readonly archiveSphere: ArchiveSphere;
  public readonly restoreSphere: RestoreSphere;
  public readonly getSpheres: GetSpheres;

  readonly #closeDatabase: () => void;

  public constructor(services: LifeOsApplicationServices) {
    this.dayRepository = services.dayRepository;
    this.decisionRepository = services.decisionRepository;
    this.lifeActionRepository = services.lifeActionRepository;
    this.actionSessionRepository = services.actionSessionRepository;
    this.routineBlockRepository = services.routineBlockRepository;
    this.routineOccurrenceOverrideRepository = services.routineOccurrenceOverrideRepository;
    this.routineOccurrenceExecutionRepository = services.routineOccurrenceExecutionRepository;
    this.walkRepository = services.walkRepository;
    this.sphereRepository = services.sphereRepository;
    this.clock = services.clock;
    this.currentDateProvider = services.currentDateProvider;
    this.idGenerator = services.idGenerator;
    this.ensureCurrentDay = services.ensureCurrentDay;
    this.currentDay = services.currentDay;
    this.currentDate = services.currentDate;
    this.startCurrentDay = services.startCurrentDay;
    this.getEveningReview = services.getEveningReview;
    this.completeCurrentDay = services.completeCurrentDay;
    this.updateDayResultSphere = services.updateDayResultSphere;
    this.createDecisionForDate = services.createDecisionForDate;
    this.getDecisionsForDate = services.getDecisionsForDate;
    this.getDeletedDecisions = services.getDeletedDecisions;
    this.getDecisionById = services.getDecisionById;
    this.getDecisionOverview = services.getDecisionOverview;
    this.getActionListsForDate = services.getActionListsForDate;
    this.getLifeActionsForDate = services.getLifeActionsForDate;
    this.getLifeActionsForDecision = services.getLifeActionsForDecision;
    this.getHistoryForDateRange = services.getHistoryForDateRange;
    this.createLifeActionForDecision = services.createLifeActionForDecision;
    this.startLifeActionSession = services.startLifeActionSession;
    this.pauseActionSession = services.pauseActionSession;
    this.resumeActionSession = services.resumeActionSession;
    this.completeActionSession = services.completeActionSession;
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
    this.completeWalk = services.completeWalk;
    this.abandonWalk = services.abandonWalk;
    this.deleteWalk = services.deleteWalk;
    this.getWalkStatistics = services.getWalkStatistics;
    this.getWalksForDate = services.getWalksForDate;
    this.getRunningWalk = services.getRunningWalk;
    this.startWalk = services.startWalk;
    this.updateWalkPhoto = services.updateWalkPhoto;
    this.updateWalkSphere = services.updateWalkSphere;
    this.createSphere = services.createSphere;
    this.updateSphere = services.updateSphere;
    this.archiveSphere = services.archiveSphere;
    this.restoreSphere = services.restoreSphere;
    this.getSpheres = services.getSpheres;
    this.#closeDatabase = services.closeDatabase;
  }

  public close(): void {
    this.#closeDatabase();
  }
}
