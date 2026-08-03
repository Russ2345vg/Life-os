import type {
  ActionSessionRepository,
  Clock,
  CompleteActionSession,
  CompleteLifeAction,
  CancelDecisionSafely,
  CancelLifeActionSafely,
  ConfirmDecisionFromActions,
  CreateDecisionForDate,
  CreateLifeActionForDecision,
  CurrentDateProvider,
  DayRepository,
  DecisionRepository,
  GetDecisionsForDate,
  GetDecisionById,
  GetLifeActionsForDecision,
  GetActionSessionsForLifeAction,
  GetUnfinishedActionSession,
  IdGenerator,
  LifeActionRepository,
  PauseActionSession,
  ResumeActionSession,
  RescheduleDecisionSafely,
  RescheduleLifeActionSafely,
  StartLifeActionSession,
  UpdateDecisionDetails,
  UpdateLifeActionDetails,
} from '../../application';
import { EnsureCurrentDay } from '../../application';
import type { DayDate } from '../../domain';

interface LifeOsApplicationServices {
  readonly dayRepository: DayRepository;
  readonly decisionRepository: DecisionRepository;
  readonly lifeActionRepository: LifeActionRepository;
  readonly actionSessionRepository: ActionSessionRepository;
  readonly clock: Clock;
  readonly currentDateProvider: CurrentDateProvider;
  readonly idGenerator: IdGenerator;
  readonly ensureCurrentDay: EnsureCurrentDay;
  readonly currentDate: DayDate;
  readonly createDecisionForDate: CreateDecisionForDate;
  readonly getDecisionsForDate: GetDecisionsForDate;
  readonly getDecisionById: GetDecisionById;
  readonly getLifeActionsForDecision: GetLifeActionsForDecision;
  readonly createLifeActionForDecision: CreateLifeActionForDecision;
  readonly startLifeActionSession: StartLifeActionSession;
  readonly pauseActionSession: PauseActionSession;
  readonly resumeActionSession: ResumeActionSession;
  readonly completeActionSession: CompleteActionSession;
  readonly completeLifeAction: CompleteLifeAction;
  readonly confirmDecisionFromActions: ConfirmDecisionFromActions;
  readonly updateDecisionDetails: UpdateDecisionDetails;
  readonly cancelDecisionSafely: CancelDecisionSafely;
  readonly updateLifeActionDetails: UpdateLifeActionDetails;
  readonly cancelLifeActionSafely: CancelLifeActionSafely;
  readonly rescheduleDecisionSafely: RescheduleDecisionSafely;
  readonly rescheduleLifeActionSafely: RescheduleLifeActionSafely;
  readonly getActionSessionsForLifeAction: GetActionSessionsForLifeAction;
  readonly getUnfinishedActionSession: GetUnfinishedActionSession;
  readonly closeDatabase: () => void;
}

export class LifeOsApplication {
  public readonly dayRepository: DayRepository;
  public readonly decisionRepository: DecisionRepository;
  public readonly lifeActionRepository: LifeActionRepository;
  public readonly actionSessionRepository: ActionSessionRepository;
  public readonly clock: Clock;
  public readonly currentDateProvider: CurrentDateProvider;
  public readonly idGenerator: IdGenerator;
  public readonly ensureCurrentDay: EnsureCurrentDay;
  public readonly currentDate: DayDate;
  public readonly createDecisionForDate: CreateDecisionForDate;
  public readonly getDecisionsForDate: GetDecisionsForDate;
  public readonly getDecisionById: GetDecisionById;
  public readonly getLifeActionsForDecision: GetLifeActionsForDecision;
  public readonly createLifeActionForDecision: CreateLifeActionForDecision;
  public readonly startLifeActionSession: StartLifeActionSession;
  public readonly pauseActionSession: PauseActionSession;
  public readonly resumeActionSession: ResumeActionSession;
  public readonly completeActionSession: CompleteActionSession;
  public readonly completeLifeAction: CompleteLifeAction;
  public readonly confirmDecisionFromActions: ConfirmDecisionFromActions;
  public readonly updateDecisionDetails: UpdateDecisionDetails;
  public readonly cancelDecisionSafely: CancelDecisionSafely;
  public readonly updateLifeActionDetails: UpdateLifeActionDetails;
  public readonly cancelLifeActionSafely: CancelLifeActionSafely;
  public readonly rescheduleDecisionSafely: RescheduleDecisionSafely;
  public readonly rescheduleLifeActionSafely: RescheduleLifeActionSafely;
  public readonly getActionSessionsForLifeAction: GetActionSessionsForLifeAction;
  public readonly getUnfinishedActionSession: GetUnfinishedActionSession;

  readonly #closeDatabase: () => void;

  public constructor(services: LifeOsApplicationServices) {
    this.dayRepository = services.dayRepository;
    this.decisionRepository = services.decisionRepository;
    this.lifeActionRepository = services.lifeActionRepository;
    this.actionSessionRepository = services.actionSessionRepository;
    this.clock = services.clock;
    this.currentDateProvider = services.currentDateProvider;
    this.idGenerator = services.idGenerator;
    this.ensureCurrentDay = services.ensureCurrentDay;
    this.currentDate = services.currentDate;
    this.createDecisionForDate = services.createDecisionForDate;
    this.getDecisionsForDate = services.getDecisionsForDate;
    this.getDecisionById = services.getDecisionById;
    this.getLifeActionsForDecision = services.getLifeActionsForDecision;
    this.createLifeActionForDecision = services.createLifeActionForDecision;
    this.startLifeActionSession = services.startLifeActionSession;
    this.pauseActionSession = services.pauseActionSession;
    this.resumeActionSession = services.resumeActionSession;
    this.completeActionSession = services.completeActionSession;
    this.completeLifeAction = services.completeLifeAction;
    this.confirmDecisionFromActions = services.confirmDecisionFromActions;
    this.updateDecisionDetails = services.updateDecisionDetails;
    this.cancelDecisionSafely = services.cancelDecisionSafely;
    this.updateLifeActionDetails = services.updateLifeActionDetails;
    this.cancelLifeActionSafely = services.cancelLifeActionSafely;
    this.rescheduleDecisionSafely = services.rescheduleDecisionSafely;
    this.rescheduleLifeActionSafely = services.rescheduleLifeActionSafely;
    this.getActionSessionsForLifeAction = services.getActionSessionsForLifeAction;
    this.getUnfinishedActionSession = services.getUnfinishedActionSession;
    this.#closeDatabase = services.closeDatabase;
  }

  public close(): void {
    this.#closeDatabase();
  }
}
