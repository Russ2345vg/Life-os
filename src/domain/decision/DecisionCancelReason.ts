import { normalizeDecisionText } from './decisionText';

const MAXIMUM_LENGTH = 1_000;

export class DecisionCancelReason {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  public static create(value: string): DecisionCancelReason {
    return new DecisionCancelReason(
      normalizeDecisionText(
        value,
        'Причина отмены',
        MAXIMUM_LENGTH,
        'decision_cancel_reason.invalid',
      ),
    );
  }

  public equals(other: DecisionCancelReason): boolean {
    return this.#value === other.#value;
  }

  public toString(): string {
    return this.#value;
  }
}
