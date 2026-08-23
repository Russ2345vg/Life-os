import type {
  DecisionRepository,
  DecisionsByProjectIdsReader,
  DecisionsByProjectReader,
} from '../../application';
import type { DayDate, Decision, EntityId } from '../../domain';

export class InMemoryDecisionRepository
  implements DecisionRepository, DecisionsByProjectReader, DecisionsByProjectIdsReader
{
  readonly #decisionsById = new Map<string, Decision>();
  readonly #persistedVersions = new Map<string, number>();

  public async findById(id: EntityId): Promise<Decision | null> {
    return this.#decisionsById.get(id.toString()) ?? null;
  }

  public async findByDate(date: DayDate): Promise<readonly Decision[]> {
    return [...this.#decisionsById.values()].filter((decision) => decision.isScheduledFor(date));
  }

  public async findByProjectId(projectId: EntityId): Promise<readonly Decision[]> {
    return [...this.#decisionsById.values()].filter((decision) =>
      decision.projectId?.equals(projectId),
    );
  }

  public async findByProjectIds(projectIds: readonly EntityId[]): Promise<readonly Decision[]> {
    const acceptedIds = new Set(projectIds.map((projectId) => projectId.toString()));
    return [...this.#decisionsById.values()].filter((decision) =>
      decision.projectId === null ? false : acceptedIds.has(decision.projectId.toString()),
    );
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
