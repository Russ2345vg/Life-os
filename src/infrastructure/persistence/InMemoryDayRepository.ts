import type { DayRepository } from '../../application';
import type { Day, DayDate } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';

export class InMemoryDayRepository implements DayRepository {
  readonly #daysByDate = new Map<string, Day>();

  public async findByDate(date: DayDate): Promise<Day | null> {
    return this.#daysByDate.get(date.toString()) ?? null;
  }

  public async save(day: Day): Promise<void> {
    const key = day.date.toString();
    const existingDay = this.#daysByDate.get(key);

    if (existingDay !== undefined && !existingDay.id.equals(day.id)) {
      throw new DomainError('day_repository.duplicate_date', `День на дату ${key} уже существует.`);
    }

    this.#daysByDate.set(key, day);
  }
}
