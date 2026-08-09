import type { DomainEvent } from '../../shared/DomainEvent';
import type { EntityId } from '../../shared/EntityId';
import { copyDate } from '../../shared/dateCopy';
import type { DayDate } from '../DayDate';

export class DayCompleted implements DomainEvent<'day.completed'> {
  public readonly eventType = 'day.completed';
  public readonly eventId: EntityId;
  public readonly dayId: EntityId;
  public readonly date: DayDate;
  public readonly summary: string | null;
  public readonly sphereId: EntityId | null;
  readonly #occurredAt: Date;

  public constructor(
    eventId: EntityId,
    dayId: EntityId,
    date: DayDate,
    summary: string | null,
    sphereId: EntityId | null,
    occurredAt: Date,
  ) {
    this.eventId = eventId;
    this.dayId = dayId;
    this.date = date;
    this.summary = summary;
    this.sphereId = sphereId;
    this.#occurredAt = copyDate(occurredAt);
  }

  public get occurredAt(): Date {
    return copyDate(this.#occurredAt);
  }
}
