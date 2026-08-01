import { normalizeDecisionText } from './decisionText';

const MAXIMUM_LENGTH = 1_000;

export class ExpectedResult {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  public static create(value: string): ExpectedResult {
    return new ExpectedResult(
      normalizeDecisionText(
        value,
        'Ожидаемый результат',
        MAXIMUM_LENGTH,
        'expected_result.invalid',
      ),
    );
  }

  public equals(other: ExpectedResult): boolean {
    return this.#value === other.#value;
  }

  public toString(): string {
    return this.#value;
  }
}
