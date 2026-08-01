import { normalizeLifeActionText } from './lifeActionText';

const MAXIMUM_LENGTH = 1_000;

export class ActionExpectedResult {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  public static create(value: string): ActionExpectedResult {
    return new ActionExpectedResult(
      normalizeLifeActionText(
        value,
        'Ожидаемый результат действия',
        MAXIMUM_LENGTH,
        'action_expected_result.invalid',
      ),
    );
  }

  public equals(other: ActionExpectedResult): boolean {
    return this.#value === other.#value;
  }

  public toString(): string {
    return this.#value;
  }
}
