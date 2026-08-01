export class EntityId {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  public static create(value: string): EntityId {
    const normalizedValue = value.trim();

    if (normalizedValue.length === 0) {
      throw new TypeError('Идентификатор сущности не может быть пустым.');
    }

    return new EntityId(normalizedValue);
  }

  public get value(): string {
    return this.#value;
  }

  public equals(other: EntityId): boolean {
    return this.#value === other.#value;
  }

  public toString(): string {
    return this.#value;
  }
}
