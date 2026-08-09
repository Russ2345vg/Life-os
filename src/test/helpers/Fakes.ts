import type { Clock, CurrentDateProvider, DayRepository, IdGenerator } from '../../application';
import type { Day } from '../../domain';
import { DAY_STATUS, DayDate, EntityId } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';

export class FakeClock implements Clock {
  #currentTime: Date;

  public constructor(currentTime: Date) {
    this.#currentTime = new Date(currentTime.getTime());
  }

  public now(): Date {
    return new Date(this.#currentTime.getTime());
  }

  public setTime(currentTime: Date): void {
    this.#currentTime = new Date(currentTime.getTime());
  }
}

export class FakeCurrentDateProvider implements CurrentDateProvider {
  #currentDate: DayDate;

  public constructor(currentDate: DayDate) {
    this.#currentDate = currentDate;
  }

  public getCurrentDate(): DayDate {
    return this.#currentDate;
  }

  public setCurrentDate(currentDate: DayDate): void {
    this.#currentDate = currentDate;
  }
}

export class FakeIdGenerator implements IdGenerator {
  readonly #prefix: string;
  #nextValue = 1;

  public constructor(prefix = 'fake-id') {
    this.#prefix = prefix;
  }

  public generate(): EntityId {
    const id = EntityId.create(`${this.#prefix}-${this.#nextValue}`);
    this.#nextValue += 1;
    return id;
  }

  public get generatedCount(): number {
    return this.#nextValue - 1;
  }
}

export class FakeDayRepository implements DayRepository {
  readonly #daysByDate = new Map<string, Day>();
  #saveCount = 0;

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
    this.#daysByDate.set(day.date.toString(), day);
    this.#saveCount += 1;
  }

  public async saveIfVersionMatches(day: Day, expectedVersion: number): Promise<boolean> {
    const stored = this.#daysByDate.get(day.date.toString());
    if (stored === undefined || !stored.id.equals(day.id) || stored.version !== expectedVersion) {
      return false;
    }
    this.#daysByDate.set(day.date.toString(), day);
    this.#saveCount += 1;
    return true;
  }

  public seed(day: Day): void {
    this.#daysByDate.set(day.date.toString(), day);
  }

  public get size(): number {
    return this.#daysByDate.size;
  }

  public get saveCount(): number {
    return this.#saveCount;
  }
}
