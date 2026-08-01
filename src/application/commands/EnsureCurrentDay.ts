import { DAY_STATUS, Day } from '../../domain';
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

  public async execute(): Promise<Day> {
    const currentDate = this.#currentDateProvider.getCurrentDate();
    const existingDay = await this.#repository.findByDate(currentDate);

    if (existingDay === null) {
      const occurredAt = this.#clock.now();
      const day = Day.openCurrent({
        id: this.#idGenerator.generate(),
        currentDate,
        occurredAt,
        createdEventId: this.#idGenerator.generate(),
        openedEventId: this.#idGenerator.generate(),
      });

      await this.#repository.save(day);
      return day;
    }

    if (existingDay.status === DAY_STATUS.planned) {
      existingDay.open(currentDate, this.#clock.now(), this.#idGenerator.generate());
      await this.#repository.save(existingDay);
    }

    return existingDay;
  }
}
