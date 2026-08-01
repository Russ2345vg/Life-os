import { normalizeDecisionText } from './decisionText';

const MAXIMUM_LENGTH = 2_000;

export class ActualResultSummary {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  public static create(value: string): ActualResultSummary {
    return new ActualResultSummary(
      normalizeDecisionText(
        value,
        'Фактический результат',
        MAXIMUM_LENGTH,
        'actual_result_summary.invalid',
      ),
    );
  }

  public equals(other: ActualResultSummary): boolean {
    return this.#value === other.#value;
  }

  public toString(): string {
    return this.#value;
  }
}
