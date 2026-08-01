import { DomainError } from '../../shared/errors/DomainError';
import { copyDate } from '../shared/dateCopy';

export class PauseInterval {
  readonly #startedAt: Date;
  readonly #endedAt: Date;

  private constructor(startedAt: Date, endedAt: Date) {
    this.#startedAt = copyDate(startedAt);
    this.#endedAt = copyDate(endedAt);
  }

  public static create(startedAt: Date, endedAt: Date): PauseInterval {
    assertValidDate(startedAt);
    assertValidDate(endedAt);

    if (endedAt.getTime() < startedAt.getTime()) {
      throw new DomainError(
        'action_session.pause_interval_reversed',
        'Конец паузы не может быть раньше её начала.',
      );
    }

    return new PauseInterval(startedAt, endedAt);
  }

  public get startedAt(): Date {
    return copyDate(this.#startedAt);
  }

  public get endedAt(): Date {
    return copyDate(this.#endedAt);
  }

  public get durationMilliseconds(): number {
    return this.#endedAt.getTime() - this.#startedAt.getTime();
  }
}

function assertValidDate(value: Date): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DomainError(
      'action_session.invalid_time',
      'Интервал паузы содержит некорректное время.',
    );
  }
}
