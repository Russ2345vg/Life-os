import { DomainError } from '../../shared/errors/DomainError';
import type { DomainEvent } from '../shared/DomainEvent';
import { Entity } from '../shared/Entity';
import type { EntityId } from '../shared/EntityId';
import { copyDate, copyOptionalDate } from '../shared/dateCopy';
import { DayDate } from './DayDate';
import { DAY_STATUS, type DayStatus } from './DayStatus';
import { DayCompleted, DayCreated, DayFirstActivityRecorded, DayOpened } from './events';

interface PlanDayInput {
  readonly id: EntityId;
  readonly date: DayDate;
  readonly currentDate: DayDate;
  readonly occurredAt: Date;
  readonly createdEventId: EntityId;
}

interface CreateCurrentDayInput {
  readonly id: EntityId;
  readonly currentDate: DayDate;
  readonly occurredAt: Date;
  readonly createdEventId: EntityId;
  readonly openedEventId: EntityId;
}

export class Day extends Entity {
  readonly #date: DayDate;
  readonly #createdAt: Date;
  readonly #plannedAt: Date | null;
  readonly #domainEvents: DomainEvent[];
  #status: DayStatus;
  #openedAt: Date | null;
  #firstActivityAt: Date | null;
  #completedAt: Date | null;
  #summary: string | null;
  #version: number;

  private constructor(
    id: EntityId,
    date: DayDate,
    status: DayStatus,
    createdAt: Date,
    plannedAt: Date | null,
    openedAt: Date | null,
    domainEvents: DomainEvent[],
  ) {
    super(id);
    this.#date = date;
    this.#status = status;
    this.#createdAt = copyDate(createdAt);
    this.#plannedAt = copyOptionalDate(plannedAt);
    this.#openedAt = copyOptionalDate(openedAt);
    this.#firstActivityAt = null;
    this.#completedAt = null;
    this.#summary = null;
    this.#version = 1;
    this.#domainEvents = domainEvents;
  }

  public static plan(input: PlanDayInput): Day {
    if (!input.date.isAfter(input.currentDate)) {
      throw new DomainError(
        'day.planning_requires_future_date',
        'Запланировать можно только будущий день.',
      );
    }

    const createdEvent = new DayCreated(
      input.createdEventId,
      input.id,
      input.date,
      DAY_STATUS.planned,
      input.occurredAt,
    );

    return new Day(
      input.id,
      input.date,
      DAY_STATUS.planned,
      input.occurredAt,
      input.occurredAt,
      null,
      [createdEvent],
    );
  }

  public static openCurrent(input: CreateCurrentDayInput): Day {
    const createdEvent = new DayCreated(
      input.createdEventId,
      input.id,
      input.currentDate,
      DAY_STATUS.open,
      input.occurredAt,
    );
    const openedEvent = new DayOpened(
      input.openedEventId,
      input.id,
      input.currentDate,
      input.occurredAt,
    );

    return new Day(
      input.id,
      input.currentDate,
      DAY_STATUS.open,
      input.occurredAt,
      null,
      input.occurredAt,
      [createdEvent, openedEvent],
    );
  }

  public get date(): DayDate {
    return this.#date;
  }

  public get status(): DayStatus {
    return this.#status;
  }

  public get createdAt(): Date {
    return copyDate(this.#createdAt);
  }

  public get plannedAt(): Date | null {
    return copyOptionalDate(this.#plannedAt);
  }

  public get openedAt(): Date | null {
    return copyOptionalDate(this.#openedAt);
  }

  public get firstActivityAt(): Date | null {
    return copyOptionalDate(this.#firstActivityAt);
  }

  public get completedAt(): Date | null {
    return copyOptionalDate(this.#completedAt);
  }

  public get summary(): string | null {
    return this.#summary;
  }

  public get version(): number {
    return this.#version;
  }

  public open(currentDate: DayDate, occurredAt: Date, eventId: EntityId): void {
    if (this.#status === DAY_STATUS.open) {
      return;
    }

    if (this.#status === DAY_STATUS.completed) {
      throw new DomainError('day.already_completed', 'Завершённый день нельзя открыть повторно.');
    }

    if (this.#date.isAfter(currentDate)) {
      throw new DomainError('day.open_too_early', 'Будущий день нельзя открыть раньше его даты.');
    }

    this.#status = DAY_STATUS.open;
    this.#openedAt = copyDate(occurredAt);
    this.#version += 1;
    this.#domainEvents.push(new DayOpened(eventId, this.id, this.#date, occurredAt));
  }

  public recordFirstActivity(occurredAt: Date, eventId: EntityId): void {
    if (this.#status !== DAY_STATUS.open) {
      throw new DomainError(
        'day.first_activity_requires_open_day',
        'Первую активность можно записать только для открытого дня.',
      );
    }

    if (this.#firstActivityAt !== null) {
      return;
    }

    this.#firstActivityAt = copyDate(occurredAt);
    this.#version += 1;
    this.#domainEvents.push(new DayFirstActivityRecorded(eventId, this.id, this.#date, occurredAt));
  }

  public complete(occurredAt: Date, eventId: EntityId, summary?: string): void {
    if (this.#status !== DAY_STATUS.open) {
      throw new DomainError(
        'day.completion_requires_open_day',
        'Завершить можно только открытый день.',
      );
    }

    this.#status = DAY_STATUS.completed;
    this.#completedAt = copyDate(occurredAt);
    this.#summary = summary ?? null;
    this.#version += 1;
    this.#domainEvents.push(
      new DayCompleted(eventId, this.id, this.#date, this.#summary, occurredAt),
    );
  }

  public isCurrent(currentDate: DayDate): boolean {
    return this.#date.equals(currentDate);
  }

  public isPastUnfinished(currentDate: DayDate): boolean {
    return this.#date.isBefore(currentDate) && this.#status !== DAY_STATUS.completed;
  }

  public requiresAttention(currentDate: DayDate): boolean {
    return this.isPastUnfinished(currentDate);
  }

  public getUncommittedEvents(): readonly DomainEvent[] {
    return [...this.#domainEvents];
  }

  public clearUncommittedEvents(): void {
    this.#domainEvents.length = 0;
  }
}
