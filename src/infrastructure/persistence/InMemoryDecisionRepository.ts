import type { DecisionRepository } from '../../application';
import type { DayDate, Decision, EntityId } from '../../domain';

export class InMemoryDecisionRepository implements DecisionRepository {
  readonly #decisionsById = new Map<string, Decision>();

  public async findById(id: EntityId): Promise<Decision | null> {
    return this.#decisionsById.get(id.toString()) ?? null;
  }

  public async findByDate(date: DayDate): Promise<readonly Decision[]> {
    return [...this.#decisionsById.values()].filter((decision) => decision.isScheduledFor(date));
  }

  public async save(decision: Decision): Promise<void> {
    this.#decisionsById.set(decision.id.toString(), decision);
  }
}
