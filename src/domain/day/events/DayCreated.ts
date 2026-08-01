import type { DomainEvent } from '../../shared/DomainEvent';
import type { EntityId } from '../../shared/EntityId';
import { copyDate } from '../../shared/dateCopy';
import type { DayDate } from '../DayDate';
import type { DayStatus } from '../DayStatus';

export class DayCreated implements DomainEvent<'day.created'> {
  public readonly eventType = 'day.created';
  public readonly eventId: EntityId;
  public readonly dayId: EntityId;
  public readonly date: DayDate;
  public readonly initialStatus: DayStatus;
  readonly #occurredAt: Date;

  public constructor(
    eventId: EntityId,
    dayId: EntityId,
    date: DayDate,
    initialStatus: DayStatus,
    occurredAt: Date,
  ) {
    this.eventId = eventId;
    this.dayId = dayId;
    this.date = date;
    this.initialStatus = initialStatus;
    this.#occurredAt = copyDate(occurredAt);
  }

  public get occurredAt(): Date {
    return copyDate(this.#occurredAt);
  }
}
