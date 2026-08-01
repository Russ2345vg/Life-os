import { normalizeLifeActionText } from './lifeActionText';

const MAXIMUM_LENGTH = 200;

export class LifeActionTitle {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  public static create(value: string): LifeActionTitle {
    return new LifeActionTitle(
      normalizeLifeActionText(
        value,
        'Название действия',
        MAXIMUM_LENGTH,
        'life_action_title.invalid',
      ),
    );
  }

  public equals(other: LifeActionTitle): boolean {
    return this.#value === other.#value;
  }

  public toString(): string {
    return this.#value;
  }
}
