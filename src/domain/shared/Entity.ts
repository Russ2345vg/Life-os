import type { EntityId } from './EntityId';

export abstract class Entity<TId extends EntityId = EntityId> {
  readonly #id: TId;

  protected constructor(id: TId) {
    this.#id = id;
  }

  public get id(): TId {
    return this.#id;
  }

  public equals(other: Entity<TId> | null | undefined): boolean {
    return other !== null && other !== undefined && this.#id.equals(other.id);
  }
}
