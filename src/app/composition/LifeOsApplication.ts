import type {
  ActionSessionRepository,
  Clock,
  CreateDecisionForDate,
  CurrentDateProvider,
  DayRepository,
  DecisionRepository,
  GetDecisionsForDate,
  IdGenerator,
  LifeActionRepository,
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
    this.#closeDatabase = services.closeDatabase;
  }

  public close(): void {
    this.#closeDatabase();
  }
}
