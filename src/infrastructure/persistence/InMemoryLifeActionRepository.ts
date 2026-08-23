import type { LifeActionRepository, LifeActionsByDecisionIdsReader } from '../../application';
import type { DayDate, EntityId, LifeAction } from '../../domain';

export class InMemoryLifeActionRepository
  implements LifeActionRepository, LifeActionsByDecisionIdsReader
{
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

  public async findByDecisionIds(decisionIds: readonly EntityId[]): Promise<readonly LifeAction[]> {
    const acceptedIds = new Set(decisionIds.map((decisionId) => decisionId.toString()));
    return [...this.#lifeActionsById.values()].filter((lifeAction) =>
      lifeAction.decisionId === null ? false : acceptedIds.has(lifeAction.decisionId.toString()),
    );
  }

  public async findAll(): Promise<readonly LifeAction[]> {
    return [...this.#lifeActionsById.values()];
  }

  public async save(lifeAction: LifeAction): Promise<void> {
    this.#lifeActionsById.set(lifeAction.id.toString(), lifeAction);
  }
}
