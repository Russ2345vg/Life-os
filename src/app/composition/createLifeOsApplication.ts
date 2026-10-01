import { BalanceIndicators } from '../../application/balance/BalanceIndicators';
import { GetLifeBalance } from '../../application/balance/GetLifeBalance';
import { ArchiveGoal } from '../../application/commands/ArchiveGoal';
import { ArchiveLifeAction } from '../../application/commands/ArchiveLifeAction';
import { ArchiveDirection } from '../../application/commands/ArchiveDirection';
import { ArchiveSphere } from '../../application/commands/ArchiveSphere';
import { CompleteLifeAction } from '../../application/commands/CompleteLifeAction';
import { CreateDirection } from '../../application/commands/CreateDirection';
import { CreateGoal } from '../../application/commands/CreateGoal';
import { CreateLifeActionDraft } from '../../application/commands/CreateLifeActionDraft';
import { CreateSphere } from '../../application/commands/CreateSphere';
import { EditPlannerActionDraft } from '../../application/commands/EditPlannerActionDraft';
import { EnsureCurrentDay } from '../../application/commands/EnsureCurrentDay';
import { EnsureDefaultSpheres } from '../../application/commands/EnsureDefaultSpheres';
import { RemoveDirectionSafely } from '../../application/commands/RemoveDirectionSafely';
import { RestoreDirection } from '../../application/commands/RestoreDirection';
import { RestoreSphere } from '../../application/commands/RestoreSphere';
import { SelectGoalNextAction } from '../../application/commands/SelectGoalNextAction';
import { SetLifeActionGoal } from '../../application/commands/SetLifeActionGoal';
import { SetLifeActionParent } from '../../application/commands/SetLifeActionParent';
import { SetLifeActionPlan } from '../../application/commands/SetLifeActionPlan';
import { SetLifeActionTime } from '../../application/commands/SetLifeActionTime';
import { TimeCapacityService } from '../../application/time/TimeCapacityService';
import { WorkSessions } from '../../application/time/WorkSessions';
import { UpdateDirection } from '../../application/commands/UpdateDirection';
import { UpdateGoal } from '../../application/commands/UpdateGoal';
import { UpdateLifeActionDetails } from '../../application/commands/UpdateLifeActionDetails';
import { UpdateSphere } from '../../application/commands/UpdateSphere';
import { DiaryApplicationService } from '../../application/diary/DiaryService';
import { BrowserMemoryPhotoReader } from '../../infrastructure/memory/BrowserMemoryPhotoReader';
import type { Clock } from '../../application/ports/Clock';
import type { CurrentDateProvider } from '../../application/ports/CurrentDateProvider';
import type { IdGenerator } from '../../application/ports/IdGenerator';
import { DailyDirection } from '../../application/planner/DailyDirection';
import { MonthlyDirectionFocusService } from '../../application/planner/MonthlyDirectionFocusService';
import { GoalContributions } from '../../application/planner/GoalContributions';
import { PeriodPlanning } from '../../application/planner/PeriodPlanning';
import { PlannerCatalog } from '../../application/planner/PlannerCatalog';
import { PlannerFocus } from '../../application/planner/PlannerFocus';
import { PlannerInbox } from '../../application/planner/PlannerInbox';
import { PlannerScenarios } from '../../application/planner/PlannerScenarios';
import { IndexedDbTaskScenarioRepository } from '../../infrastructure/persistence/IndexedDbTaskScenarioRepository';
import { RecurringActions } from '../../application/planner/RecurringActions';
import { GetDirections } from '../../application/queries/GetDirections';
import { GetGoals } from '../../application/queries/GetGoals';
import { GetPlannerToday } from '../../application/queries/GetPlannerToday';
import { GetSpheres } from '../../application/queries/GetSpheres';
import { SleepScheduleService } from '../../application/sleep/SleepScheduleService';
import { ColdShowerService } from '../../application/sleep/ColdShowerService';
import { DeletePilotDirection } from '../../application/sync/pilot/DeletePilotDirection';
import { DeletePilotGoal } from '../../application/sync/pilot/DeletePilotGoal';
import { DeletePilotLifeAction } from '../../application/sync/pilot/DeletePilotLifeAction';
import { DeletePilotSphere } from '../../application/sync/pilot/DeletePilotSphere';
import { TauriAndroidWakeAlarmGateway } from '../../infrastructure/alarm/TauriAndroidWakeAlarmGateway';
import { SystemClock } from '../../infrastructure/clock/SystemClock';
import { SystemCurrentDateProvider } from '../../infrastructure/clock/SystemCurrentDateProvider';
import { CryptoIdGenerator } from '../../infrastructure/ids/CryptoIdGenerator';
import { IndexedDbBalanceRepository } from '../../infrastructure/persistence/IndexedDbBalanceRepository';
import { IndexedDbDayRepository } from '../../infrastructure/persistence/IndexedDbDayRepository';
import { IndexedDbDecisionRepository } from '../../infrastructure/persistence/IndexedDbDecisionRepository';
import { IndexedDbDiaryRepository } from '../../infrastructure/persistence/IndexedDbDiaryRepository';
import { IndexedDbDirectionRepository } from '../../infrastructure/persistence/IndexedDbDirectionRepository';
import { IndexedDbGoalRepository } from '../../infrastructure/persistence/IndexedDbGoalRepository';
import { IndexedDbJournalUnitOfWork } from '../../infrastructure/persistence/IndexedDbJournalUnitOfWork';
import { IndexedDbLifeActionRepository } from '../../infrastructure/persistence/IndexedDbLifeActionRepository';
import { IndexedDbMonthlyDirectionFocusRepository } from '../../infrastructure/persistence/IndexedDbMonthlyDirectionFocusRepository';
import { IndexedDbTimeCapacityRepository } from '../../infrastructure/persistence/IndexedDbTimeCapacityRepository';
import { IndexedDbActionSessionRepository } from '../../infrastructure/persistence/IndexedDbActionSessionRepository';
import { IndexedDbPlannerRepository } from '../../infrastructure/persistence/IndexedDbPlannerRepository';
import { IndexedDbPlanningRepository } from '../../infrastructure/persistence/IndexedDbPlanningRepository';
import { IndexedDbProjectRepository } from '../../infrastructure/persistence/IndexedDbProjectRepository';
import { IndexedDbSleepScheduleRepository } from '../../infrastructure/persistence/IndexedDbSleepScheduleRepository';
import { IndexedDbSphereRepository } from '../../infrastructure/persistence/IndexedDbSphereRepository';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { MeaningfulLocalSettingsSync } from '../../infrastructure/sync/MeaningfulLocalSettingsSync';
import { LIFE_OS_SYNC_REGISTRY } from '../../infrastructure/sync/LifeOsSyncRegistry';
import { IndexedDbDirectionDeletionRepository } from '../../infrastructure/sync/pilot/IndexedDbDirectionDeletionRepository';
import { IndexedDbPilotDeleteRepository } from '../../infrastructure/sync/pilot/IndexedDbPilotDeleteRepository';
import { IndexedDbPilotMutationRecorder } from '../../infrastructure/sync/pilot/IndexedDbPilotMutationRecorder';
import type { SupabasePublicEnvironment } from '../../infrastructure/sync/supabase/SupabaseConfig';
import { BrowserLocalSettingsStore } from '../settings/BrowserLocalSettingsStore';
import type { LifeOsApplication } from './LifeOsApplication';
import { PlanImport } from '../../application/plan-import/PlanImport';
import { LifeOsApplicationInitializationError } from './LifeOsApplicationInitializationError';
import { createLifeOsSyncApplication } from './createLifeOsSyncApplication';
import { createMemoryModule } from './modules/createMemoryModule';
import { PlannerLibraryReadModels } from '../../application/planner/PlannerLibraryReadModels';
import { IndexedDbPlannerChangeSource } from '../../infrastructure/persistence/IndexedDbPlannerChangeSource';

export interface CreateLifeOsApplicationDependencies {
  readonly database?: LifeOsIndexedDb;
  readonly clock?: Clock;
  readonly currentDateProvider?: CurrentDateProvider;
  readonly idGenerator?: IdGenerator;
  readonly syncEnvironment?: SupabasePublicEnvironment;
  readonly memoryEnabled?: boolean;
}

export async function createLifeOsApplication(
  dependencies: CreateLifeOsApplicationDependencies = {},
): Promise<LifeOsApplication> {
  const database = dependencies.database ?? new LifeOsIndexedDb();
  let libraryReads: PlannerLibraryReadModels | undefined;

  try {
    await database.open();

    const clock = dependencies.clock ?? new SystemClock();
    const currentDateProvider =
      dependencies.currentDateProvider ?? new SystemCurrentDateProvider(clock);
    const idGenerator = dependencies.idGenerator ?? new CryptoIdGenerator();
    const mutationRecorder = new IndexedDbPilotMutationRecorder({
      createId: () => idGenerator.generate().toString(),
      now: () => clock.now(),
    });
    database.configureSyncMutationCapture(mutationRecorder, LIFE_OS_SYNC_REGISTRY, [
      'direction',
      'project',
      'goal',
    ]);

    const balanceRepository = new IndexedDbBalanceRepository(database, clock, currentDateProvider);
    const dayRepository = new IndexedDbDayRepository(database);
    const decisionRepository = new IndexedDbDecisionRepository(database);
    const lifeActionRepository = new IndexedDbLifeActionRepository(database);
    const journalUnitOfWork = new IndexedDbJournalUnitOfWork(database, mutationRecorder);
    const sphereRepository = new IndexedDbSphereRepository(database);
    const directionRepository = new IndexedDbDirectionRepository(database, mutationRecorder);
    const projectRepository = new IndexedDbProjectRepository(database, mutationRecorder);
    const goalRepository = new IndexedDbGoalRepository(database, mutationRecorder);
    const sleepScheduleRepository = new IndexedDbSleepScheduleRepository(database);

    let meaningfulSettingsSync: MeaningfulLocalSettingsSync | null = null;
    const localSettings = new BrowserLocalSettingsStore(undefined, () => {
      void meaningfulSettingsSync?.reconcile().catch(() => undefined);
    });
    meaningfulSettingsSync = new MeaningfulLocalSettingsSync(
      database,
      mutationRecorder,
      localSettings,
    );
    const { sync, accountSync } = createLifeOsSyncApplication({
      database,
      clock,
      idGenerator,
      mutationRecorder,
      meaningfulSettingsSync,
      ...(dependencies.syncEnvironment === undefined
        ? {}
        : { environment: dependencies.syncEnvironment }),
    });

    await new EnsureDefaultSpheres(sphereRepository, clock).execute();
    const ensureCurrentDay = new EnsureCurrentDay(
      dayRepository,
      currentDateProvider,
      clock,
      idGenerator,
    );
    const currentDay = await ensureCurrentDay.execute();

    const planningRepository = new IndexedDbPlanningRepository(database, mutationRecorder);
    const planning = {
      periods: new PeriodPlanning(planningRepository, clock, idGenerator),
      progress: new GoalContributions(planningRepository, clock, idGenerator),
      recurrence: new RecurringActions(planningRepository, clock, idGenerator),
    };
    const diaryRepository = new IndexedDbDiaryRepository(database);
    const diary = new DiaryApplicationService(
      diaryRepository,
      clock,
      currentDateProvider,
      planningRepository,
    );
    const memory = createMemoryModule({
      database,
      clock,
      currentDateProvider,
      idGenerator,
      writesEnabled:
        dependencies.memoryEnabled ?? import.meta.env.VITE_LIFEOS_MEMORY_ENABLED !== 'false',
      diary: diaryRepository,
      spheres: sphereRepository,
      directions: directionRepository,
      goals: goalRepository,
      photoReader: new BrowserMemoryPhotoReader(),
    });
    const plannerRepository = new IndexedDbPlannerRepository(database, mutationRecorder);
    const plannerInbox = new PlannerInbox(plannerRepository, clock, idGenerator);
    const plannerFocus = new PlannerFocus(
      plannerRepository,
      goalRepository,
      clock,
      planning.periods,
    );
    const plannerCatalog = new PlannerCatalog(lifeActionRepository);

    const createLifeActionDraft = new CreateLifeActionDraft(
      lifeActionRepository,
      decisionRepository,
      clock,
      idGenerator,
      { goalRepository, directionRepository, unitOfWork: journalUnitOfWork },
    );
    const completeLifeAction = new CompleteLifeAction(
      lifeActionRepository,
      clock,
      idGenerator,
      journalUnitOfWork,
    );
    const setLifeActionPlan = new SetLifeActionPlan(
      lifeActionRepository,
      journalUnitOfWork,
      clock,
      idGenerator,
    );
    const setLifeActionTime = new SetLifeActionTime(lifeActionRepository, journalUnitOfWork);
    const timeCapacity = new TimeCapacityService(new IndexedDbTimeCapacityRepository(database));
    const setLifeActionGoal = new SetLifeActionGoal(
      lifeActionRepository,
      goalRepository,
      journalUnitOfWork,
    );

    const pilotDeleteRepository = new IndexedDbPilotDeleteRepository(database, mutationRecorder);
    const deletePilotDirection = new DeletePilotDirection(pilotDeleteRepository);
    const deletePilotSphere = new DeletePilotSphere(pilotDeleteRepository);
    const balance = {
      read: new GetLifeBalance(balanceRepository),
      indicators: new BalanceIndicators(balanceRepository, clock),
      createSphere: new CreateSphere(sphereRepository, clock, idGenerator),
      updateSphere: new UpdateSphere(sphereRepository, clock),
      createDirection: new CreateDirection(directionRepository, clock, idGenerator),
      updateDirection: new UpdateDirection(directionRepository, projectRepository, clock),
      archiveSphere: new ArchiveSphere(sphereRepository, clock),
      archiveDirection: new ArchiveDirection(directionRepository, clock),
      restoreSphere: new RestoreSphere(sphereRepository, clock),
      restoreDirection: new RestoreDirection(directionRepository, clock),
      deletePilotSphere,
      deletePilotDirection,
      removeDirectionSafely: new RemoveDirectionSafely(
        new IndexedDbDirectionDeletionRepository(database, mutationRecorder),
        clock,
        currentDateProvider,
      ),
      refreshSnapshots: () => balanceRepository.refreshSnapshots(),
    };
    await balance.refreshSnapshots();

    const sleepSchedule = new SleepScheduleService(
      sleepScheduleRepository,
      clock,
      idGenerator,
      new TauriAndroidWakeAlarmGateway(),
    );
    void sleepSchedule.syncAlarm().catch(() => undefined);

    const getGoals = new GetGoals(goalRepository);
    const getDirections = new GetDirections(directionRepository);
    const getSpheres = new GetSpheres(sphereRepository);
    libraryReads = new PlannerLibraryReadModels(
      {
        getGoals: () => getGoals.execute(),
        getDirections: () => getDirections.execute(),
        getSpheres: () => getSpheres.execute(),
        getActions: () => plannerCatalog.actions(),
        getIdeas: () => plannerInbox.list(),
        getFocus: (today) => plannerFocus.get(today),
        getTimeCapacity: () => timeCapacity.get(),
      },
      new IndexedDbPlannerChangeSource(database),
    );

    const application: LifeOsApplication = {
      planImport: new PlanImport({
        spheres: sphereRepository,
        directions: directionRepository,
        goals: goalRepository,
        actions: lifeActionRepository,
        decisions: decisionRepository,
        unitOfWork: journalUnitOfWork,
        clock,
        ids: idGenerator,
      }),
      libraryReads,
      sync,
      accountSync,
      clock,
      currentDateProvider,
      currentDate: currentDay.date,
      balance,
      planning,
      diary,
      memory,
      plannerInbox,
      plannerScenarios: new PlannerScenarios(
        new IndexedDbTaskScenarioRepository(database),
        lifeActionRepository,
        clock,
        idGenerator,
      ),
      plannerFocus,
      plannerCatalog,
      createLifeActionDraft,
      completeLifeAction,
      setLifeActionPlan,
      setLifeActionTime,
      timeCapacity,
      workSessions: new WorkSessions(
        new IndexedDbActionSessionRepository(database),
        lifeActionRepository,
        journalUnitOfWork,
        clock,
        idGenerator,
      ),
      setLifeActionGoal,
      getPlannerToday: new GetPlannerToday(lifeActionRepository),
      getGoals,
      getDirections,
      getSpheres,
      dailyDirection: new DailyDirection(dayRepository, directionRepository, ensureCurrentDay),
      monthlyDirectionFocus: new MonthlyDirectionFocusService(
        new IndexedDbMonthlyDirectionFocusRepository(database),
        directionRepository,
        dayRepository,
        clock,
      ),
      sleepSchedule,
      coldShower: new ColdShowerService(sleepScheduleRepository, clock, currentDateProvider),
      createGoal: new CreateGoal(goalRepository, directionRepository, clock, idGenerator),
      updateGoal: new UpdateGoal(goalRepository, directionRepository, clock, decisionRepository),
      archiveGoal: new ArchiveGoal(goalRepository, clock),
      deletePilotGoal: new DeletePilotGoal(pilotDeleteRepository),
      deletePilotLifeAction: new DeletePilotLifeAction(pilotDeleteRepository),
      archiveLifeAction: new ArchiveLifeAction(lifeActionRepository, clock, idGenerator),
      editPlannerActionDraft: new EditPlannerActionDraft(
        lifeActionRepository,
        journalUnitOfWork,
        clock,
        idGenerator,
      ),
      setLifeActionParent: new SetLifeActionParent(
        lifeActionRepository,
        journalUnitOfWork,
        clock,
        idGenerator,
      ),
      selectGoalNextAction: new SelectGoalNextAction(goalRepository, lifeActionRepository, clock),
      updateLifeActionDetails: new UpdateLifeActionDetails(
        lifeActionRepository,
        clock,
        idGenerator,
      ),
      close: () => {
        libraryReads?.close();
        void sync.close();
        database.close();
      },
    };

    return application;
  } catch (error: unknown) {
    libraryReads?.close();
    database.close();
    throw new LifeOsApplicationInitializationError(error);
  }
}
