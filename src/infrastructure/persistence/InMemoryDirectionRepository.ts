import type { DirectionRepository, DirectionVersionedUpdate } from '../../application';
import type { Direction, EntityId } from '../../domain';

export class InMemoryDirectionRepository implements DirectionRepository {
  readonly #directions = new Map<string, Direction>();

  public constructor(directions: readonly Direction[] = []) {
    for (const direction of directions) this.#directions.set(direction.id.toString(), direction);
  }

  public async findById(id: EntityId): Promise<Direction | null> {
    return this.#directions.get(id.toString()) ?? null;
  }

  public async findAll(): Promise<readonly Direction[]> {
    return [...this.#directions.values()];
  }

  public async findBySphereId(sphereId: EntityId): Promise<readonly Direction[]> {
    return [...this.#directions.values()].filter((direction) =>
      direction.sphereId?.equals(sphereId),
    );
  }

  public async create(direction: Direction): Promise<boolean> {
    if (this.#directions.has(direction.id.toString())) return false;
    this.#directions.set(direction.id.toString(), direction);
    return true;
  }

  public async updateIfVersionMatches(
    direction: Direction,
    expectedVersion: number,
  ): Promise<boolean> {
    if (this.#directions.get(direction.id.toString())?.version !== expectedVersion) return false;
    this.#directions.set(direction.id.toString(), direction);
    return true;
  }

  public async updateManyIfVersionsMatch(
    updates: readonly DirectionVersionedUpdate[],
  ): Promise<boolean> {
    if (
      updates.some(
        ({ direction, expectedVersion }) =>
          this.#directions.get(direction.id.toString())?.version !== expectedVersion,
      )
    ) {
      return false;
    }
    for (const { direction } of updates) this.#directions.set(direction.id.toString(), direction);
    return true;
  }
}
