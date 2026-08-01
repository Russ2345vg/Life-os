import { normalizeDecisionText } from './decisionText';

const MAXIMUM_LENGTH = 200;

export class DecisionTitle {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  public static create(value: string): DecisionTitle {
    return new DecisionTitle(
      normalizeDecisionText(value, 'Название решения', MAXIMUM_LENGTH, 'decision_title.invalid'),
    );
  }

  public equals(other: DecisionTitle): boolean {
    return this.#value === other.#value;
  }

  public toString(): string {
    return this.#value;
  }
}
