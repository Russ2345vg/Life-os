import type { DayRepository } from '../../application';
import { DAY_STATUS, type Day, type DayDate } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';

export class InMemoryDayRepository implements DayRepository {
  readonly #daysByDate = new Map<string, Day>();

  public async findByDate(date: DayDate): Promise<Day | null> {
    return this.#daysByDate.get(date.toString()) ?? null;
  }

  public async findOpen(): Promise<Day | null> {
    const openDays = [...this.#daysByDate.values()].filter((day) => day.status === DAY_STATUS.open);

    if (openDays.length > 1) {
      throw new DomainError(
        'day.multiple_open_detected',
        'Обнаружено несколько одновременно открытых дней.',
      );
    }

    return openDays[0] ?? null;
  }

  public async save(day: Day): Promise<void> {
    const key = day.date.toString();
    const existingDay = this.#daysByDate.get(key);

    if (existingDay !== undefined && !existingDay.id.equals(day.id)) {
      throw new DomainError('day_repository.duplicate_date', `День на дату ${key} уже существует.`);
    }

    this.#daysByDate.set(key, day);
  }

  public async saveIfVersionMatches(day: Day, expectedVersion: number): Promise<boolean> {
    const stored = this.#daysByDate.get(day.date.toString());
    if (stored === undefined || !stored.id.equals(day.id) || stored.version !== expectedVersion) {
      return false;
    }
    this.#daysByDate.set(day.date.toString(), day);
    return true;
  }
}
