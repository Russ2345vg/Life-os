import type { DecisionRepository } from '../../application';
import type { DayDate, Decision, EntityId } from '../../domain';

export class InMemoryDecisionRepository implements DecisionRepository {
  readonly #decisionsById = new Map<string, Decision>();
  readonly #persistedVersions = new Map<string, number>();

  public async findById(id: EntityId): Promise<Decision | null> {
    return this.#decisionsById.get(id.toString()) ?? null;
  }

  public async findByDate(date: DayDate): Promise<readonly Decision[]> {
    return [...this.#decisionsById.values()].filter((decision) => decision.isScheduledFor(date));
  }

  public async findAll(): Promise<readonly Decision[]> {
    return [...this.#decisionsById.values()];
  }

  public async save(decision: Decision): Promise<void> {
    const key = decision.id.toString();
    this.#decisionsById.set(key, decision);
    this.#persistedVersions.set(key, decision.version);
  }

  public async saveIfVersionMatches(decision: Decision, expectedVersion: number): Promise<boolean> {
    const key = decision.id.toString();
    if (this.#persistedVersions.get(key) !== expectedVersion) {
      return false;
    }

    this.#decisionsById.set(key, decision);
    this.#persistedVersions.set(key, decision.version);
    return true;
  }
}
