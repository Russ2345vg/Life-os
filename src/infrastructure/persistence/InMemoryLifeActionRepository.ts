import type { LifeActionRepository } from '../../application';
import type { DayDate, EntityId, LifeAction } from '../../domain';

export class InMemoryLifeActionRepository implements LifeActionRepository {
  readonly #lifeActionsById = new Map<string, LifeAction>();

  public async findById(id: EntityId): Promise<LifeAction | null> {
    return this.#lifeActionsById.get(id.toString()) ?? null;
  }

  public async findByDate(date: DayDate): Promise<readonly LifeAction[]> {
    return [...this.#lifeActionsById.values()].filter((lifeAction) =>
      lifeAction.isScheduledFor(date),
    );
  }

  public async findByDecisionId(decisionId: EntityId): Promise<readonly LifeAction[]> {
    return [...this.#lifeActionsById.values()].filter((lifeAction) =>
      lifeAction.decisionId?.equals(decisionId),
    );
  }

  public async save(lifeAction: LifeAction): Promise<void> {
    this.#lifeActionsById.set(lifeAction.id.toString(), lifeAction);
  }
}
