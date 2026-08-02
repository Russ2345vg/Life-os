import type {
  ActionSessionRepository,
  Clock,
  CurrentDateProvider,
  DayRepository,
  DecisionRepository,
  IdGenerator,
  LifeActionRepository,
} from '../../application';
import { EnsureCurrentDay } from '../../application';

interface LifeOsApplicationServices {
  readonly dayRepository: DayRepository;
  readonly decisionRepository: DecisionRepository;
  readonly lifeActionRepository: LifeActionRepository;
  readonly actionSessionRepository: ActionSessionRepository;
  readonly clock: Clock;
  readonly currentDateProvider: CurrentDateProvider;
  readonly idGenerator: IdGenerator;
  readonly ensureCurrentDay: EnsureCurrentDay;
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
    this.#closeDatabase = services.closeDatabase;
  }

  public close(): void {
    this.#closeDatabase();
  }
}
