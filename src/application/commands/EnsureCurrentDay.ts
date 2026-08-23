import { Day, type DayDate } from '../../domain';
import type { Clock } from '../ports/Clock';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { DayRepository } from '../ports/DayRepository';
import type { IdGenerator } from '../ports/IdGenerator';

export class EnsureCurrentDay {
  readonly #repository: DayRepository;
  readonly #currentDateProvider: CurrentDateProvider;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;

  public constructor(
    repository: DayRepository,
    currentDateProvider: CurrentDateProvider,
    clock: Clock,
    idGenerator: IdGenerator,
  ) {
    this.#repository = repository;
    this.#currentDateProvider = currentDateProvider;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
  }

  public async execute(requestedDate?: DayDate): Promise<Day> {
    const currentDate = this.#currentDateProvider.getCurrentDate();
    const targetDate = requestedDate ?? currentDate;
    const existingDay = await this.#repository.findByDate(targetDate);

    if (existingDay !== null) {
      return existingDay;
    }

    const occurredAt = this.#clock.now();
    const day = targetDate.isAfter(currentDate)
      ? Day.plan({
          id: this.#idGenerator.generate(),
          date: targetDate,
          currentDate,
          occurredAt,
          createdEventId: this.#idGenerator.generate(),
        })
      : Day.createCurrentPlanned({
          id: this.#idGenerator.generate(),
          currentDate: targetDate,
          occurredAt,
          createdEventId: this.#idGenerator.generate(),
        });

    await this.#repository.save(day);
    return day;
  }
}
