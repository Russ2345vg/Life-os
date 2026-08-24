import type { Clock, CurrentDateProvider, IdGenerator } from '../../application';
import {
  CompleteCurrentDay,
  CompleteEveningCycle,
  CorrectJournalData,
  CreateDecisionForDate,
  CreateLifeActionForDecision,
  CompleteActionSession,
  CompleteLifeAction,
  VerifyLifeActionResult,
  CancelDecisionSafely,
  DeleteDecisionSafely,
  RestoreDeletedDecision,
  CancelLifeActionSafely,
  ConfirmDecisionFromActions,
  EnsureCurrentDay,
  GetDecisionsForDate,
  GetDecisionsForProject,
  GetDeletedDecisions,
  GetEveningReview,
  GetEveningCycleReview,
  GetEveningHistory,
  GetEveningHistorySummary,
  GetEveningAnalytics,
  DetectEveningPatterns,
  GetEveningSignals,
  GetEveningRecommendations,
  RecommendationApplicationService,
  GetApplicationMode,
  GetOpenLoopsForDay,
  GetDecisionById,
  GetDecisionOverview,
  GetActionListsForDate,
  GetLifeActionsForDate,
  GetLifeActionsForDecision,
  GetHistoryForDateRange,
  GetJournalTimeline,
  GetStatistics,
  GetActionSessionsForLifeAction,
  GetUnfinishedActionSession,
  GetOpenDayConflict,
  ResolveOpenDayConflict,
  ResolveOpenLoop,
  MainDecisionLimitPolicy,
  PauseActionSession,
  ResumeActionSession,
  RescheduleDecisionSafely,
  RescheduleLifeActionSafely,
  StartCurrentDay,
  StartLifeActionSession,
  UpdateDecisionDetails,
  UpdateLifeActionDetails,
  CreateRoutineBlock,
  UpdateRoutineBlock,
  DeleteRoutineBlock,
  GetRoutineBlocksForDate,
  GetRoutineActionOptions,
  GetRoutineActionDetails,
  DelayRoutineOccurrence,
  SkipRoutineOccurrence,
  RescheduleRoutineOccurrence,
  ShortenRoutineOccurrence,
  ReplaceRoutineOccurrenceAction,
  ClearRoutineOccurrenceOverride,
  GetRoutinePlanFactForDate,
  GetRoutineExecutionForOccurrence,
  GetRunningRoutineOccurrence,
  StartRoutineOccurrence,
  CompleteRoutineOccurrence,
  AbandonRoutineOccurrence,
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
  CreateSphere,
  UpdateSphere,
  ArchiveSphere,
  RestoreSphere,
  EnsureDefaultSpheres,
  GetSpheres,
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
  EnsureSingleMainProject,
  GetProjects,
  GetProjectsForSphere,
  GetProjectsForDirection,
  GetProjectById,
  GetProjectLifeActions,
  GetManagementOverview,
  CreateGoal,
  UpdateGoal,
  ArchiveGoal,
  GetGoalById,
  GetGoals,
  ApplyDirectionStrategicReview,
  GetMorningOverview,
  MorningCycleApplicationService,
  EveningCycleApplicationService,
  GetReflectionContext,
  ReflectionApplicationService,
  TomorrowPlanService,
  PreparationService,
} from '../../application';
import { ReflectionEngine } from '../../domain';
import { SystemClock } from '../../infrastructure/clock/SystemClock';
import { SystemCurrentDateProvider } from '../../infrastructure/clock/SystemCurrentDateProvider';
import { CryptoIdGenerator } from '../../infrastructure/ids/CryptoIdGenerator';
import { IndexedDbActionSessionRepository } from '../../infrastructure/persistence/IndexedDbActionSessionRepository';
import { IndexedDbDayCompletionUnitOfWork } from '../../infrastructure/persistence/IndexedDbDayCompletionUnitOfWork';
import { IndexedDbDayRepository } from '../../infrastructure/persistence/IndexedDbDayRepository';
import { IndexedDbDecisionRepository } from '../../infrastructure/persistence/IndexedDbDecisionRepository';
import { IndexedDbDecisionRescheduleUnitOfWork } from '../../infrastructure/persistence/IndexedDbDecisionRescheduleUnitOfWork';
import { IndexedDbLifeActionRepository } from '../../infrastructure/persistence/IndexedDbLifeActionRepository';
import { IndexedDbJournalRepository } from '../../infrastructure/persistence/IndexedDbJournalRepository';
import { IndexedDbJournalUnitOfWork } from '../../infrastructure/persistence/IndexedDbJournalUnitOfWork';
import { IndexedDbRoutineBlockRepository } from '../../infrastructure/persistence/IndexedDbRoutineBlockRepository';
import { IndexedDbRoutineOccurrenceOverrideRepository } from '../../infrastructure/persistence/IndexedDbRoutineOccurrenceOverrideRepository';
import { IndexedDbRoutineOccurrenceExecutionRepository } from '../../infrastructure/persistence/IndexedDbRoutineOccurrenceExecutionRepository';
import { IndexedDbWalkRepository } from '../../infrastructure/persistence/IndexedDbWalkRepository';
import { IndexedDbSphereRepository } from '../../infrastructure/persistence/IndexedDbSphereRepository';
import { IndexedDbDirectionRepository } from '../../infrastructure/persistence/IndexedDbDirectionRepository';
import { IndexedDbProjectRepository } from '../../infrastructure/persistence/IndexedDbProjectRepository';
import { IndexedDbGoalRepository } from '../../infrastructure/persistence/IndexedDbGoalRepository';
import { IndexedDbOpenDayConflictReader } from '../../infrastructure/persistence/IndexedDbOpenDayConflictReader';
import { IndexedDbOpenDayRecoveryUnitOfWork } from '../../infrastructure/persistence/IndexedDbOpenDayRecoveryUnitOfWork';
import { IndexedDbEveningCycleRepository } from '../../infrastructure/persistence/IndexedDbEveningCycleRepository';
import { IndexedDbMorningCycleRepository } from '../../infrastructure/persistence/IndexedDbMorningCycleRepository';
import { IndexedDbEveningHistoryReader } from '../../infrastructure/persistence/IndexedDbEveningHistoryReader';
import { IndexedDbOpenLoopResolutionUnitOfWork } from '../../infrastructure/persistence/IndexedDbOpenLoopResolutionUnitOfWork';
import { IndexedDbTomorrowPlanRepository } from '../../infrastructure/persistence/IndexedDbTomorrowPlanRepository';
import { IndexedDbTomorrowPlanUnitOfWork } from '../../infrastructure/persistence/IndexedDbTomorrowPlanUnitOfWork';
import { IndexedDbPreparationPlanRepository } from '../../infrastructure/persistence/IndexedDbPreparationPlanRepository';
import { IndexedDbPreparationRuleRepository } from '../../infrastructure/persistence/IndexedDbPreparationRuleRepository';
import { IndexedDbPreparationUnitOfWork } from '../../infrastructure/persistence/IndexedDbPreparationUnitOfWork';
import { IndexedDbRecommendationApplicationRepository } from '../../infrastructure/persistence/IndexedDbRecommendationApplicationRepository';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { LifeOsApplication } from './LifeOsApplication';
import { LifeOsApplicationInitializationError } from './LifeOsApplicationInitializationError';

export interface CreateLifeOsApplicationDependencies {
  readonly database?: LifeOsIndexedDb;
  readonly clock?: Clock;
  readonly currentDateProvider?: CurrentDateProvider;
  readonly idGenerator?: IdGenerator;
}

export async function createLifeOsApplication(
  dependencies: CreateLifeOsApplicationDependencies = {},
): Promise<LifeOsApplication> {
  const database = dependencies.database ?? new LifeOsIndexedDb();

  try {
    await database.open();

    const dayRepository = new IndexedDbDayRepository(database);
    const decisionRepository = new IndexedDbDecisionRepository(database);
    const lifeActionRepository = new IndexedDbLifeActionRepository(database);
    const actionSessionRepository = new IndexedDbActionSessionRepository(database);
    const morningCycleRepository = new IndexedDbMorningCycleRepository(database);
    const eveningCycleRepository = new IndexedDbEveningCycleRepository(database);
    const tomorrowPlanRepository = new IndexedDbTomorrowPlanRepository(database);
    const preparationPlanRepository = new IndexedDbPreparationPlanRepository(database);
    const preparationRuleRepository = new IndexedDbPreparationRuleRepository(database);
    const recommendationApplicationRepository = new IndexedDbRecommendationApplicationRepository(
      database,
    );
    const journalRepository = new IndexedDbJournalRepository(database);
    const journalUnitOfWork = new IndexedDbJournalUnitOfWork(database);
    const routineBlockRepository = new IndexedDbRoutineBlockRepository(database);
    const routineOccurrenceOverrideRepository = new IndexedDbRoutineOccurrenceOverrideRepository(
      database,
    );
    const routineOccurrenceExecutionRepository = new IndexedDbRoutineOccurrenceExecutionRepository(
      database,
    );
    const walkRepository = new IndexedDbWalkRepository(database);
    const sphereRepository = new IndexedDbSphereRepository(database);
    const directionRepository = new IndexedDbDirectionRepository(database);
    const projectRepository = new IndexedDbProjectRepository(database);
    const goalRepository = new IndexedDbGoalRepository(database);
    const openDayConflictReader = new IndexedDbOpenDayConflictReader(database);
    const openDayRecoveryUnitOfWork = new IndexedDbOpenDayRecoveryUnitOfWork(database);
    const clock = dependencies.clock ?? new SystemClock();
    const currentDateProvider =
      dependencies.currentDateProvider ?? new SystemCurrentDateProvider(clock);
    const idGenerator = dependencies.idGenerator ?? new CryptoIdGenerator();
    const morningCycle = new MorningCycleApplicationService(
      morningCycleRepository,
      dayRepository,
      currentDateProvider,
      clock,
      idGenerator,
    );
    const eveningCycle = new EveningCycleApplicationService(
      eveningCycleRepository,
      dayRepository,
      clock,
      idGenerator,
    );
    const getReflectionContext = new GetReflectionContext(
      eveningCycleRepository,
      dayRepository,
      decisionRepository,
      lifeActionRepository,
      actionSessionRepository,
    );
    const reflection = new ReflectionApplicationService(
      eveningCycleRepository,
      getReflectionContext,
      new ReflectionEngine(),
      clock,
      idGenerator,
    );
    const tomorrowPlan = new TomorrowPlanService(
      eveningCycleRepository,
      tomorrowPlanRepository,
      dayRepository,
      decisionRepository,
      lifeActionRepository,
      currentDateProvider,
      clock,
      idGenerator,
      new IndexedDbTomorrowPlanUnitOfWork(database),
    );
    const preparation = new PreparationService(
      eveningCycleRepository,
      tomorrowPlanRepository,
      preparationPlanRepository,
      preparationRuleRepository,
      decisionRepository,
      lifeActionRepository,
      projectRepository,
      clock,
      idGenerator,
      new IndexedDbPreparationUnitOfWork(database),
    );
    const getOpenLoopsForDay = new GetOpenLoopsForDay(
      dayRepository,
      decisionRepository,
      lifeActionRepository,
      actionSessionRepository,
      eveningCycle,
    );
    const resolveOpenLoop = new ResolveOpenLoop(
      getOpenLoopsForDay,
      decisionRepository,
      lifeActionRepository,
      actionSessionRepository,
      new IndexedDbOpenLoopResolutionUnitOfWork(database),
      currentDateProvider,
      clock,
      idGenerator,
    );
    await new EnsureSingleMainProject(projectRepository, clock).execute();
    const ensureDefaultSpheres = new EnsureDefaultSpheres(sphereRepository, clock);
    await ensureDefaultSpheres.execute();
    const ensureCurrentDay = new EnsureCurrentDay(
      dayRepository,
      currentDateProvider,
      clock,
      idGenerator,
    );
    const currentDay = await ensureCurrentDay.execute();
    const startCurrentDay = new StartCurrentDay(
      dayRepository,
      decisionRepository,
      lifeActionRepository,
      currentDateProvider,
      clock,
      idGenerator,
      journalUnitOfWork,
    );
    const getEveningCycleReview = new GetEveningCycleReview(
      dayRepository,
      decisionRepository,
      lifeActionRepository,
      actionSessionRepository,
      currentDateProvider,
      routineBlockRepository,
      routineOccurrenceOverrideRepository,
      routineOccurrenceExecutionRepository,
      eveningCycle,
      ensureCurrentDay,
    );
    const getEveningReview = new GetEveningReview(getEveningCycleReview);
    const getEveningHistory = new GetEveningHistory(new IndexedDbEveningHistoryReader(database));
    const getEveningHistorySummary = new GetEveningHistorySummary(getEveningHistory);
    const detectEveningPatterns = new DetectEveningPatterns(getEveningHistory);
    const getEveningSignals = new GetEveningSignals(detectEveningPatterns);
    const getEveningRecommendations = new GetEveningRecommendations(getEveningSignals);
    const getEveningAnalytics = new GetEveningAnalytics(
      getEveningHistory,
      recommendationApplicationRepository,
    );
    const recommendationApplications = new RecommendationApplicationService(
      getEveningRecommendations,
      recommendationApplicationRepository,
      tomorrowPlan,
      preparationPlanRepository,
      decisionRepository,
      clock,
    );
    const getApplicationMode = new GetApplicationMode(
      dayRepository,
      eveningCycleRepository,
      currentDateProvider,
    );
    const dayCompletionUnitOfWork = new IndexedDbDayCompletionUnitOfWork(database);
    const completeEveningCycle = new CompleteEveningCycle(
      getEveningCycleReview,
      dayCompletionUnitOfWork,
      clock,
      idGenerator,
      tomorrowPlanRepository,
      preparationPlanRepository,
    );
    const completeCurrentDay = new CompleteCurrentDay(completeEveningCycle);
    const updateDayResultSphere = new UpdateDayResultSphere(dayRepository);
    const mainDecisionLimitPolicy = new MainDecisionLimitPolicy(decisionRepository);
    const createDecisionForDate = new CreateDecisionForDate(
      decisionRepository,
      dayRepository,
      mainDecisionLimitPolicy,
      currentDateProvider,
      clock,
      idGenerator,
      journalUnitOfWork,
      projectRepository,
    );
    const getDecisionsForDate = new GetDecisionsForDate(decisionRepository);
    const getDecisionsForProject = new GetDecisionsForProject(decisionRepository);
    const getProjectLifeActions = new GetProjectLifeActions(
      decisionRepository,
      lifeActionRepository,
      actionSessionRepository,
      projectRepository,
    );
    const getDeletedDecisions = new GetDeletedDecisions(decisionRepository);
    const getDecisionById = new GetDecisionById(decisionRepository);
    const getDecisionOverview = new GetDecisionOverview(
      decisionRepository,
      lifeActionRepository,
      actionSessionRepository,
    );
    const getActionListsForDate = new GetActionListsForDate(
      lifeActionRepository,
      decisionRepository,
      actionSessionRepository,
      clock,
    );
    const getLifeActionsForDate = new GetLifeActionsForDate(lifeActionRepository);
    const getLifeActionsForDecision = new GetLifeActionsForDecision(lifeActionRepository);
    const getHistoryForDateRange = new GetHistoryForDateRange(
      decisionRepository,
      lifeActionRepository,
      actionSessionRepository,
    );
    const getJournalTimeline = new GetJournalTimeline(
      journalRepository,
      decisionRepository,
      lifeActionRepository,
      sphereRepository,
    );
    const getStatistics = new GetStatistics(
      decisionRepository,
      lifeActionRepository,
      actionSessionRepository,
      walkRepository,
      journalRepository,
    );
    const correctJournalData = new CorrectJournalData(
      journalRepository,
      decisionRepository,
      lifeActionRepository,
      journalUnitOfWork,
      clock,
    );
    const createLifeActionForDecision = new CreateLifeActionForDecision(
      decisionRepository,
      lifeActionRepository,
      clock,
      idGenerator,
    );
    const startLifeActionSession = new StartLifeActionSession(
      lifeActionRepository,
      actionSessionRepository,
      dayRepository,
      currentDateProvider,
      clock,
      idGenerator,
      journalUnitOfWork,
    );
    const pauseActionSession = new PauseActionSession(
      actionSessionRepository,
      clock,
      idGenerator,
      lifeActionRepository,
      journalUnitOfWork,
    );
    const resumeActionSession = new ResumeActionSession(
      actionSessionRepository,
      clock,
      idGenerator,
      lifeActionRepository,
      journalUnitOfWork,
    );
    const completeActionSession = new CompleteActionSession(
      actionSessionRepository,
      clock,
      idGenerator,
      lifeActionRepository,
      journalUnitOfWork,
    );
    const completeLifeAction = new CompleteLifeAction(
      lifeActionRepository,
      clock,
      idGenerator,
      journalUnitOfWork,
    );
    const verifyLifeActionResult = new VerifyLifeActionResult(
      lifeActionRepository,
      actionSessionRepository,
      clock,
      idGenerator,
      journalUnitOfWork,
    );
    const confirmDecisionFromActions = new ConfirmDecisionFromActions(
      decisionRepository,
      lifeActionRepository,
      clock,
      idGenerator,
    );
    const updateDecisionDetails = new UpdateDecisionDetails(
      decisionRepository,
      clock,
      idGenerator,
      projectRepository,
    );
    const deleteDecisionSafely = new DeleteDecisionSafely(
      decisionRepository,
      lifeActionRepository,
      actionSessionRepository,
      clock,
      idGenerator,
    );
    const restoreDeletedDecision = new RestoreDeletedDecision(
      decisionRepository,
      mainDecisionLimitPolicy,
      clock,
      idGenerator,
    );
    const cancelDecisionSafely = new CancelDecisionSafely(
      decisionRepository,
      lifeActionRepository,
      clock,
      idGenerator,
      journalUnitOfWork,
    );
    const updateLifeActionDetails = new UpdateLifeActionDetails(
      lifeActionRepository,
      clock,
      idGenerator,
    );
    const cancelLifeActionSafely = new CancelLifeActionSafely(
      lifeActionRepository,
      actionSessionRepository,
      clock,
      idGenerator,
      journalUnitOfWork,
    );
    const decisionRescheduleUnitOfWork = new IndexedDbDecisionRescheduleUnitOfWork(database);
    const rescheduleDecisionSafely = new RescheduleDecisionSafely(
      decisionRepository,
      lifeActionRepository,
      actionSessionRepository,
      decisionRescheduleUnitOfWork,
      currentDateProvider,
      clock,
      idGenerator,
    );
    const rescheduleLifeActionSafely = new RescheduleLifeActionSafely(
      lifeActionRepository,
      actionSessionRepository,
      clock,
      idGenerator,
      currentDateProvider,
      journalUnitOfWork,
    );
    const getActionSessionsForLifeAction = new GetActionSessionsForLifeAction(
      actionSessionRepository,
    );
    const getUnfinishedActionSession = new GetUnfinishedActionSession(actionSessionRepository);
    const getOpenDayConflict = new GetOpenDayConflict(
      openDayConflictReader,
      actionSessionRepository,
      lifeActionRepository,
    );
    const resolveOpenDayConflict = new ResolveOpenDayConflict(
      openDayConflictReader,
      actionSessionRepository,
      lifeActionRepository,
      openDayRecoveryUnitOfWork,
      clock,
      idGenerator,
    );
    const createRoutineBlock = new CreateRoutineBlock(routineBlockRepository, clock, idGenerator);
    const updateRoutineBlock = new UpdateRoutineBlock(
      routineBlockRepository,
      clock,
      routineOccurrenceExecutionRepository,
    );
    const deleteRoutineBlock = new DeleteRoutineBlock(
      routineBlockRepository,
      routineOccurrenceExecutionRepository,
    );
    const getRoutineBlocksForDate = new GetRoutineBlocksForDate(
      routineBlockRepository,
      routineOccurrenceOverrideRepository,
    );
    const getMorningOverview = new GetMorningOverview(
      morningCycleRepository,
      tomorrowPlanRepository,
      decisionRepository,
      lifeActionRepository,
      getRoutineBlocksForDate,
      currentDateProvider,
    );
    const getRoutinePlanFactForDate = new GetRoutinePlanFactForDate(
      getRoutineBlocksForDate,
      routineOccurrenceExecutionRepository,
      clock,
    );
    const getRoutineExecutionForOccurrence = new GetRoutineExecutionForOccurrence(
      routineOccurrenceExecutionRepository,
    );
    const getRunningRoutineOccurrence = new GetRunningRoutineOccurrence(
      routineOccurrenceExecutionRepository,
      routineBlockRepository,
      routineOccurrenceOverrideRepository,
    );
    const getRoutineActionOptions = new GetRoutineActionOptions(
      lifeActionRepository,
      decisionRepository,
    );
    const getRoutineActionDetails = new GetRoutineActionDetails(
      lifeActionRepository,
      decisionRepository,
    );
    const routineOccurrenceDependencies = {
      routineBlockRepository,
      overrideRepository: routineOccurrenceOverrideRepository,
      dayRepository,
      actionSessionRepository,
      lifeActionRepository,
      currentDateProvider,
      clock,
      idGenerator,
      executionRepository: routineOccurrenceExecutionRepository,
    };
    const delayRoutineOccurrence = new DelayRoutineOccurrence(routineOccurrenceDependencies);
    const skipRoutineOccurrence = new SkipRoutineOccurrence(routineOccurrenceDependencies);
    const rescheduleRoutineOccurrence = new RescheduleRoutineOccurrence(
      routineOccurrenceDependencies,
    );
    const shortenRoutineOccurrence = new ShortenRoutineOccurrence(routineOccurrenceDependencies);
    const replaceRoutineOccurrenceAction = new ReplaceRoutineOccurrenceAction(
      routineOccurrenceDependencies,
    );
    const clearRoutineOccurrenceOverride = new ClearRoutineOccurrenceOverride(
      routineOccurrenceDependencies,
    );
    const routineExecutionDependencies = {
      routineBlockRepository,
      overrideRepository: routineOccurrenceOverrideRepository,
      executionRepository: routineOccurrenceExecutionRepository,
      dayRepository,
      currentDateProvider,
      clock,
      idGenerator,
    };
    const startRoutineOccurrence = new StartRoutineOccurrence(routineExecutionDependencies);
    const completeRoutineOccurrence = new CompleteRoutineOccurrence(routineExecutionDependencies);
    const abandonRoutineOccurrence = new AbandonRoutineOccurrence(routineExecutionDependencies);
    const createWalk = new CreateWalk(walkRepository, clock, idGenerator);
    const completeWalk = new CompleteWalk(walkRepository, clock);
    const abandonWalk = new AbandonWalk(walkRepository, clock);
    const deleteWalk = new DeleteWalk(walkRepository);
    const getWalkStatistics = new GetWalkStatistics(walkRepository, currentDateProvider);
    const getWalksForDate = new GetWalksForDate(walkRepository);
    const getRunningWalk = new GetRunningWalk(walkRepository);
    const startWalk = new StartWalk(walkRepository, currentDateProvider, clock);
    const updateWalkPhoto = new UpdateWalkPhoto(walkRepository, clock);
    const updateWalkSphere = new UpdateWalkSphere(walkRepository, clock);
    const createSphere = new CreateSphere(sphereRepository, clock, idGenerator);
    const updateSphere = new UpdateSphere(sphereRepository, clock);
    const archiveSphere = new ArchiveSphere(sphereRepository, clock);
    const restoreSphere = new RestoreSphere(sphereRepository, clock);
    const getSpheres = new GetSpheres(sphereRepository);
    const createDirection = new CreateDirection(directionRepository, clock, idGenerator);
    const updateDirection = new UpdateDirection(directionRepository, projectRepository, clock);
    const archiveDirection = new ArchiveDirection(directionRepository, clock);
    const restoreDirection = new RestoreDirection(directionRepository, clock);
    const makeDirectionMain = new MakeDirectionMain(directionRepository, clock);
    const getDirections = new GetDirections(directionRepository);
    const getDirectionsForSphere = new GetDirectionsForSphere(directionRepository);
    const getDirectionsOverview = new GetDirectionsOverview(directionRepository, projectRepository);
    const getManagementOverview = new GetManagementOverview(
      directionRepository,
      projectRepository,
      decisionRepository,
      lifeActionRepository,
      actionSessionRepository,
    );
    const getDirectionDetails = new GetDirectionDetails(
      directionRepository,
      projectRepository,
      decisionRepository,
      lifeActionRepository,
      actionSessionRepository,
      currentDateProvider,
      journalRepository,
    );
    const applyDirectionStrategicReview = new ApplyDirectionStrategicReview(
      directionRepository,
      projectRepository,
      journalUnitOfWork,
      clock,
      currentDateProvider,
      idGenerator,
    );
    const createProject = new CreateProject(
      projectRepository,
      directionRepository,
      clock,
      idGenerator,
    );
    const updateProject = new UpdateProject(
      projectRepository,
      directionRepository,
      clock,
      decisionRepository,
    );
    const archiveProject = new ArchiveProject(projectRepository, clock);
    const restoreProject = new RestoreProject(projectRepository, clock);
    const completeProject = new CompleteProject(projectRepository, clock);
    const pauseProject = new PauseProject(projectRepository, clock);
    const resumeProject = new ResumeProject(projectRepository, clock);
    const makeProjectMain = new MakeProjectMain(projectRepository, clock);
    const getProjects = new GetProjects(projectRepository);
    const getProjectsForSphere = new GetProjectsForSphere(projectRepository);
    const getProjectsForDirection = new GetProjectsForDirection(projectRepository);
    const getProjectById = new GetProjectById(projectRepository);
    const createGoal = new CreateGoal(goalRepository, directionRepository, clock, idGenerator);
    const updateGoal = new UpdateGoal(goalRepository, directionRepository, clock);
    const archiveGoal = new ArchiveGoal(goalRepository, clock);
    const getGoalById = new GetGoalById(goalRepository);
    const getGoals = new GetGoals(goalRepository);
    const application = new LifeOsApplication({
      dayRepository,
      decisionRepository,
      lifeActionRepository,
      actionSessionRepository,
      morningCycleRepository,
      eveningCycleRepository,
      tomorrowPlanRepository,
      preparationPlanRepository,
      recommendationApplicationRepository,
      routineBlockRepository,
      routineOccurrenceOverrideRepository,
      routineOccurrenceExecutionRepository,
      walkRepository,
      sphereRepository,
      directionRepository,
      projectRepository,
      goalRepository,
      journalRepository,
      clock,
      currentDateProvider,
      idGenerator,
      ensureCurrentDay,
      currentDay,
      currentDate: currentDay.date,
      startCurrentDay,
      getEveningReview,
      getEveningCycleReview,
      getEveningHistory,
      getEveningHistorySummary,
      detectEveningPatterns,
      getEveningSignals,
      getEveningRecommendations,
      getEveningAnalytics,
      recommendationApplications,
      getApplicationMode,
      getOpenLoopsForDay,
      resolveOpenLoop,
      morningCycle,
      eveningCycle,
      getReflectionContext,
      reflection,
      tomorrowPlan,
      preparation,
      completeEveningCycle,
      completeCurrentDay,
      updateDayResultSphere,
      createDecisionForDate,
      getDecisionsForDate,
      getDecisionsForProject,
      getProjectLifeActions,
      getDeletedDecisions,
      getDecisionById,
      getDecisionOverview,
      getActionListsForDate,
      getLifeActionsForDate,
      getLifeActionsForDecision,
      getHistoryForDateRange,
      getJournalTimeline,
      getStatistics,
      correctJournalData,
      createLifeActionForDecision,
      startLifeActionSession,
      pauseActionSession,
      resumeActionSession,
      completeActionSession,
      completeLifeAction,
      verifyLifeActionResult,
      confirmDecisionFromActions,
      updateDecisionDetails,
      cancelDecisionSafely,
      deleteDecisionSafely,
      restoreDeletedDecision,
      updateLifeActionDetails,
      cancelLifeActionSafely,
      rescheduleDecisionSafely,
      rescheduleLifeActionSafely,
      getActionSessionsForLifeAction,
      getUnfinishedActionSession,
      getOpenDayConflict,
      resolveOpenDayConflict,
      createRoutineBlock,
      updateRoutineBlock,
      deleteRoutineBlock,
      getRoutineBlocksForDate,
      getMorningOverview,
      getRoutineActionOptions,
      getRoutineActionDetails,
      delayRoutineOccurrence,
      skipRoutineOccurrence,
      rescheduleRoutineOccurrence,
      shortenRoutineOccurrence,
      replaceRoutineOccurrenceAction,
      clearRoutineOccurrenceOverride,
      getRoutinePlanFactForDate,
      getRoutineExecutionForOccurrence,
      getRunningRoutineOccurrence,
      startRoutineOccurrence,
      completeRoutineOccurrence,
      abandonRoutineOccurrence,
      createWalk,
      completeWalk,
      abandonWalk,
      deleteWalk,
      getWalkStatistics,
      getWalksForDate,
      getRunningWalk,
      startWalk,
      updateWalkPhoto,
      updateWalkSphere,
      createSphere,
      updateSphere,
      archiveSphere,
      restoreSphere,
      getSpheres,
      createDirection,
      updateDirection,
      archiveDirection,
      restoreDirection,
      makeDirectionMain,
      getDirections,
      getDirectionsForSphere,
      getDirectionsOverview,
      getManagementOverview,
      getDirectionDetails,
      applyDirectionStrategicReview,
      createProject,
      updateProject,
      archiveProject,
      restoreProject,
      completeProject,
      pauseProject,
      resumeProject,
      makeProjectMain,
      getProjects,
      getProjectsForSphere,
      getProjectsForDirection,
      getProjectById,
      createGoal,
      updateGoal,
      archiveGoal,
      getGoalById,
      getGoals,
      closeDatabase: () => database.close(),
    });

    return application;
  } catch (error: unknown) {
    database.close();
    throw new LifeOsApplicationInitializationError(error);
  }
}
