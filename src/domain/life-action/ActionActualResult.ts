import { normalizeLifeActionText } from './lifeActionText';

const MAXIMUM_LENGTH = 2_000;

export class ActionActualResult {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  public static create(value: string): ActionActualResult {
    return new ActionActualResult(
      normalizeLifeActionText(
        value,
        'Фактический результат действия',
        MAXIMUM_LENGTH,
        'action_actual_result.invalid',
      ),
    );
  }

  public equals(other: ActionActualResult): boolean {
    return this.#value === other.#value;
  }

  public toString(): string {
    return this.#value;
  }
}
