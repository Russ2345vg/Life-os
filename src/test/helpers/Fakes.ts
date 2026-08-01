import type { Clock, CurrentDateProvider, DayRepository, IdGenerator } from '../../application';
import type { Day } from '../../domain';
import { DayDate, EntityId } from '../../domain';

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

  public async save(day: Day): Promise<void> {
    this.#daysByDate.set(day.date.toString(), day);
    this.#saveCount += 1;
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
