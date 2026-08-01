import { normalizeLifeActionText } from './lifeActionText';

const MAXIMUM_LENGTH = 1_000;

export class ActionCancelReason {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  public static create(value: string): ActionCancelReason {
    return new ActionCancelReason(
      normalizeLifeActionText(
        value,
        'Причина отмены действия',
        MAXIMUM_LENGTH,
        'action_cancel_reason.invalid',
      ),
    );
  }

  public equals(other: ActionCancelReason): boolean {
    return this.#value === other.#value;
  }

  public toString(): string {
    return this.#value;
  }
}
