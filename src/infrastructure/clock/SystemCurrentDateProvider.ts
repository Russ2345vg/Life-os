import type { Clock, CurrentDateProvider } from '../../application';
import { DayDate } from '../../domain';
import { SystemClock } from './SystemClock';

export class SystemCurrentDateProvider implements CurrentDateProvider {
  readonly #clock: Clock;

  public constructor(clock: Clock = new SystemClock()) {
    this.#clock = clock;
  }

  public getCurrentDate(): DayDate {
    const now = this.#clock.now();

    return DayDate.fromParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }
}
