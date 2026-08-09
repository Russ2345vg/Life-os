import type {
  ActionSessionRepository,
  DecisionRepository,
  JournalRepository,
  LifeActionRepository,
  SphereRepository,
} from '../../application';
import type {
  ActionSession,
  DayDate,
  Decision,
  EntityId,
  JournalEntry,
  LifeAction,
  Sphere,
} from '../../domain';
import { JOURNAL_ENTRY_TYPE } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';

export class TestDecisionRepository implements DecisionRepository {
  readonly #items = new Map<string, Decision>();
  readonly #persistedVersions = new Map<string, number>();

  public constructor(items: readonly Decision[] = []) {
    for (const item of items) {
      const key = item.id.toString();
      this.#items.set(key, item);
      this.#persistedVersions.set(key, item.version);
    }
  }

  public async findById(id: EntityId): Promise<Decision | null> {
    return this.#items.get(id.toString()) ?? null;
  }

  public async findByDate(date: DayDate): Promise<readonly Decision[]> {
    return [...this.#items.values()].filter((decision) => decision.isScheduledFor(date));
  }

  public async findAll(): Promise<readonly Decision[]> {
    return [...this.#items.values()];
  }

  public async save(decision: Decision): Promise<void> {
    const key = decision.id.toString();
    this.#items.set(key, decision);
    this.#persistedVersions.set(key, decision.version);
  }

  public async saveIfVersionMatches(decision: Decision, expectedVersion: number): Promise<boolean> {
    const key = decision.id.toString();
    if (this.#persistedVersions.get(key) !== expectedVersion) {
      return false;
    }

    this.#items.set(key, decision);
    this.#persistedVersions.set(key, decision.version);
    return true;
  }
}

export class TestLifeActionRepository implements LifeActionRepository {
  readonly #items = new Map<string, LifeAction>();

  public constructor(items: readonly LifeAction[] = []) {
    for (const item of items) this.#items.set(item.id.toString(), item);
  }

  public async findById(id: EntityId): Promise<LifeAction | null> {
    return this.#items.get(id.toString()) ?? null;
  }

  public async findByDate(date: DayDate): Promise<readonly LifeAction[]> {
    return [...this.#items.values()].filter((item) => item.isScheduledFor(date));
  }

  public async findByDecisionId(decisionId: EntityId): Promise<readonly LifeAction[]> {
    return [...this.#items.values()].filter((item) => item.decisionId?.equals(decisionId) ?? false);
  }

  public async findAll(): Promise<readonly LifeAction[]> {
    return [...this.#items.values()];
  }

  public async save(item: LifeAction): Promise<void> {
    this.#items.set(item.id.toString(), item);
  }
}

export class TestActionSessionRepository implements ActionSessionRepository {
  readonly #items = new Map<string, ActionSession>();

  public constructor(items: readonly ActionSession[] = []) {
    for (const item of items) this.#items.set(item.id.toString(), item);
  }

  public async findById(id: EntityId): Promise<ActionSession | null> {
    return this.#items.get(id.toString()) ?? null;
  }

  public async findByLifeActionId(lifeActionId: EntityId): Promise<readonly ActionSession[]> {
    return [...this.#items.values()].filter((item) => item.lifeActionId.equals(lifeActionId));
  }

  public async findUnfinished(): Promise<ActionSession | null> {
    return [...this.#items.values()].find((item) => !item.isCompleted()) ?? null;
  }

  public async findAll(): Promise<readonly ActionSession[]> {
    return [...this.#items.values()];
  }

  public async save(item: ActionSession): Promise<void> {
    this.#items.set(item.id.toString(), item);
  }
}

export class TestJournalRepository implements JournalRepository {
  readonly #items = new Map<string, JournalEntry>();

  public async append(entry: JournalEntry): Promise<void> {
    return this.appendMany([entry]);
  }

  public async appendMany(entries: readonly JournalEntry[]): Promise<void> {
    for (const entry of entries) {
      if (this.#items.has(entry.id.toString())) {
        throw new DomainError('journal.duplicate_entry', 'Событие уже записано в журнал.');
      }
    }
    for (const entry of entries) this.#items.set(entry.id.toString(), entry);
  }

  public async findById(id: EntityId): Promise<JournalEntry | null> {
    return this.#items.get(id.toString()) ?? null;
  }

  public async findCorrectionsBySourceEntryId(
    sourceEntryId: EntityId,
  ): Promise<readonly JournalEntry[]> {
    return this.sortedItems().filter(
      (entry) =>
        entry.type === JOURNAL_ENTRY_TYPE.dataCorrected &&
        entry.correction?.sourceEntryId.equals(sourceEntryId) === true,
    );
  }

  public async findByEffectiveDateRange(
    startDate: DayDate,
    endDate: DayDate,
  ): Promise<readonly JournalEntry[]> {
    return this.sortedItems().filter(
      (entry) => !entry.effectiveDate.isBefore(startDate) && !entry.effectiveDate.isAfter(endDate),
    );
  }

  private sortedItems(): readonly JournalEntry[] {
    return [...this.#items.values()].sort(
      (left, right) =>
        left.effectiveDate.toString().localeCompare(right.effectiveDate.toString()) ||
        left.occurredAt.getTime() - right.occurredAt.getTime() ||
        left.id.toString().localeCompare(right.id.toString()),
    );
  }
}

export class TestSphereRepository implements SphereRepository {
  readonly #items = new Map<string, Sphere>();

  public async findById(id: EntityId): Promise<Sphere | null> {
    return this.#items.get(id.toString()) ?? null;
  }

  public async findAll(): Promise<readonly Sphere[]> {
    return [...this.#items.values()];
  }

  public async createIfNameAvailable(sphere: Sphere): Promise<'saved'> {
    this.#items.set(sphere.id.toString(), sphere);
    return 'saved';
  }

  public async updateIfVersionMatchesAndNameAvailable(sphere: Sphere): Promise<'saved'> {
    this.#items.set(sphere.id.toString(), sphere);
    return 'saved';
  }
}
