import type { RoutineBlockRepository } from '../../application';
import type { EntityId, RoutineBlock } from '../../domain';

export class InMemoryRoutineBlockRepository implements RoutineBlockRepository {
  readonly #blocks = new Map<string, RoutineBlock>();
  readonly #versions = new Map<string, number>();

  public async findById(id: EntityId): Promise<RoutineBlock | null> {
    return this.#blocks.get(id.toString()) ?? null;
  }

  public async findAll(): Promise<readonly RoutineBlock[]> {
    return [...this.#blocks.values()];
  }

  public async save(block: RoutineBlock): Promise<void> {
    const key = block.id.toString();
    this.#blocks.set(key, block);
    this.#versions.set(key, block.version);
  }

  public async saveIfVersionMatches(
    block: RoutineBlock,
    expectedVersion: number,
  ): Promise<boolean> {
    const key = block.id.toString();
    if (this.#versions.get(key) !== expectedVersion) return false;
    this.#blocks.set(key, block);
    this.#versions.set(key, block.version);
    return true;
  }

  public async deleteIfVersionMatches(id: EntityId, expectedVersion: number): Promise<boolean> {
    const key = id.toString();
    if (this.#versions.get(key) !== expectedVersion) return false;
    this.#versions.delete(key);
    return this.#blocks.delete(key);
  }
}
