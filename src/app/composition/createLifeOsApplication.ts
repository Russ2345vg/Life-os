import type { Clock, CurrentDateProvider, IdGenerator } from '../../application';
import {
  CreateDecisionForDate,
  CreateLifeActionForDecision,
  CompleteActionSession,
  CompleteLifeAction,
  ConfirmDecisionFromActions,
  EnsureCurrentDay,
  GetDecisionsForDate,
  GetDecisionById,
  GetLifeActionsForDecision,
  GetActionSessionsForLifeAction,
  GetUnfinishedActionSession,
  MainDecisionLimitPolicy,
  PauseActionSession,
  ResumeActionSession,
  StartLifeActionSession,
} from '../../application';
import { SystemClock } from '../../infrastructure/clock/SystemClock';
import { SystemCurrentDateProvider } from '../../infrastructure/clock/SystemCurrentDateProvider';
import { CryptoIdGenerator } from '../../infrastructure/ids/CryptoIdGenerator';
import { IndexedDbActionSessionRepository } from '../../infrastructure/persistence/IndexedDbActionSessionRepository';
import { IndexedDbDayRepository } from '../../infrastructure/persistence/IndexedDbDayRepository';
import { IndexedDbDecisionRepository } from '../../infrastructure/persistence/IndexedDbDecisionRepository';
import { IndexedDbLifeActionRepository } from '../../infrastructure/persistence/IndexedDbLifeActionRepository';
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
    const clock = dependencies.clock ?? new SystemClock();
    const currentDateProvider =
      dependencies.currentDateProvider ?? new SystemCurrentDateProvider(clock);
    const idGenerator = dependencies.idGenerator ?? new CryptoIdGenerator();
    const ensureCurrentDay = new EnsureCurrentDay(
      dayRepository,
      currentDateProvider,
      clock,
      idGenerator,
    );
    const currentDay = await ensureCurrentDay.execute();
    const mainDecisionLimitPolicy = new MainDecisionLimitPolicy(decisionRepository);
    const createDecisionForDate = new CreateDecisionForDate(
      decisionRepository,
      mainDecisionLimitPolicy,
      clock,
      idGenerator,
    );
    const getDecisionsForDate = new GetDecisionsForDate(decisionRepository);
    const getDecisionById = new GetDecisionById(decisionRepository);
    const getLifeActionsForDecision = new GetLifeActionsForDecision(lifeActionRepository);
    const createLifeActionForDecision = new CreateLifeActionForDecision(
      decisionRepository,
      lifeActionRepository,
      clock,
      idGenerator,
    );
    const startLifeActionSession = new StartLifeActionSession(
      lifeActionRepository,
      actionSessionRepository,
      clock,
      idGenerator,
    );
    const pauseActionSession = new PauseActionSession(actionSessionRepository, clock, idGenerator);
    const resumeActionSession = new ResumeActionSession(
      actionSessionRepository,
      clock,
      idGenerator,
    );
    const completeActionSession = new CompleteActionSession(
      actionSessionRepository,
      clock,
      idGenerator,
    );
    const completeLifeAction = new CompleteLifeAction(lifeActionRepository, clock, idGenerator);
    const confirmDecisionFromActions = new ConfirmDecisionFromActions(
      decisionRepository,
      lifeActionRepository,
      clock,
      idGenerator,
    );
    const getActionSessionsForLifeAction = new GetActionSessionsForLifeAction(
      actionSessionRepository,
    );
    const getUnfinishedActionSession = new GetUnfinishedActionSession(actionSessionRepository);
    const application = new LifeOsApplication({
      dayRepository,
      decisionRepository,
      lifeActionRepository,
      actionSessionRepository,
      clock,
      currentDateProvider,
      idGenerator,
      ensureCurrentDay,
      currentDate: currentDay.date,
      createDecisionForDate,
      getDecisionsForDate,
      getDecisionById,
      getLifeActionsForDecision,
      createLifeActionForDecision,
      startLifeActionSession,
      pauseActionSession,
      resumeActionSession,
      completeActionSession,
      completeLifeAction,
      confirmDecisionFromActions,
      getActionSessionsForLifeAction,
      getUnfinishedActionSession,
      closeDatabase: () => database.close(),
    });

    return application;
  } catch (error: unknown) {
    database.close();
    throw new LifeOsApplicationInitializationError(error);
  }
}
