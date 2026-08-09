import type { Clock, CurrentDateProvider, IdGenerator } from '../../application';
import {
  CompleteCurrentDay,
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
  GetDeletedDecisions,
  GetEveningReview,
  GetDecisionById,
  GetDecisionOverview,
  GetActionListsForDate,
  GetLifeActionsForDate,
  GetLifeActionsForDecision,
  GetHistoryForDateRange,
  GetJournalTimeline,
  GetActionSessionsForLifeAction,
  GetUnfinishedActionSession,
  GetOpenDayConflict,
  ResolveOpenDayConflict,
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
} from '../../application';
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
import { IndexedDbOpenDayConflictReader } from '../../infrastructure/persistence/IndexedDbOpenDayConflictReader';
import { IndexedDbOpenDayRecoveryUnitOfWork } from '../../infrastructure/persistence/IndexedDbOpenDayRecoveryUnitOfWork';
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
    const openDayConflictReader = new IndexedDbOpenDayConflictReader(database);
    const openDayRecoveryUnitOfWork = new IndexedDbOpenDayRecoveryUnitOfWork(database);
    const clock = dependencies.clock ?? new SystemClock();
    const currentDateProvider =
      dependencies.currentDateProvider ?? new SystemCurrentDateProvider(clock);
    const idGenerator = dependencies.idGenerator ?? new CryptoIdGenerator();
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
    const getEveningReview = new GetEveningReview(
      dayRepository,
      decisionRepository,
      lifeActionRepository,
      actionSessionRepository,
      currentDateProvider,
      routineBlockRepository,
      routineOccurrenceOverrideRepository,
      routineOccurrenceExecutionRepository,
    );
    const dayCompletionUnitOfWork = new IndexedDbDayCompletionUnitOfWork(database);
    const completeCurrentDay = new CompleteCurrentDay(
      getEveningReview,
      dayCompletionUnitOfWork,
      clock,
      idGenerator,
    );
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
    );
    const getDecisionsForDate = new GetDecisionsForDate(decisionRepository);
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
    const updateDecisionDetails = new UpdateDecisionDetails(decisionRepository, clock, idGenerator);
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
    const application = new LifeOsApplication({
      dayRepository,
      decisionRepository,
      lifeActionRepository,
      actionSessionRepository,
      routineBlockRepository,
      routineOccurrenceOverrideRepository,
      routineOccurrenceExecutionRepository,
      walkRepository,
      sphereRepository,
      journalRepository,
      clock,
      currentDateProvider,
      idGenerator,
      ensureCurrentDay,
      currentDay,
      currentDate: currentDay.date,
      startCurrentDay,
      getEveningReview,
      completeCurrentDay,
      updateDayResultSphere,
      createDecisionForDate,
      getDecisionsForDate,
      getDeletedDecisions,
      getDecisionById,
      getDecisionOverview,
      getActionListsForDate,
      getLifeActionsForDate,
      getLifeActionsForDecision,
      getHistoryForDateRange,
      getJournalTimeline,
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
      closeDatabase: () => database.close(),
    });

    return application;
  } catch (error: unknown) {
    database.close();
    throw new LifeOsApplicationInitializationError(error);
  }
}
