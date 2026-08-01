import type { DomainEvent } from '../../shared/DomainEvent';
import type { EntityId } from '../../shared/EntityId';
import { copyDate } from '../../shared/dateCopy';
import type { DayDate } from '../DayDate';

export class DayFirstActivityRecorded implements DomainEvent<'day.first_activity_recorded'> {
  public readonly eventType = 'day.first_activity_recorded';
  public readonly eventId: EntityId;
  public readonly dayId: EntityId;
  public readonly date: DayDate;
  readonly #occurredAt: Date;

  public constructor(eventId: EntityId, dayId: EntityId, date: DayDate, occurredAt: Date) {
    this.eventId = eventId;
    this.dayId = dayId;
    this.date = date;
    this.#occurredAt = copyDate(occurredAt);
  }

  public get occurredAt(): Date {
    return copyDate(this.#occurredAt);
  }
}
