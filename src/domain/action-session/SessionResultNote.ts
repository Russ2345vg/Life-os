import { DomainError } from '../../shared/errors/DomainError';

const MAXIMUM_LENGTH = 1_000;

export class SessionResultNote {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  public static create(value: string): SessionResultNote {
    const normalizedValue = value.trim();

    if (normalizedValue.length === 0) {
      throw new DomainError(
        'session_result_note.invalid',
        'Результат сессии не может быть пустым.',
      );
    }

    if (normalizedValue.length > MAXIMUM_LENGTH) {
      throw new DomainError(
        'session_result_note.invalid',
        `Результат сессии не может быть длиннее ${MAXIMUM_LENGTH} символов.`,
      );
    }

    return new SessionResultNote(normalizedValue);
  }

  public equals(other: SessionResultNote): boolean {
    return this.#value === other.#value;
  }

  public toString(): string {
    return this.#value;
  }
}
