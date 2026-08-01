import type { DayDate } from '../../day/DayDate';
import type { EntityId } from '../../shared/EntityId';
import { DecisionEvent } from './DecisionEvent';

export class DecisionRescheduled extends DecisionEvent<'decision.rescheduled'> {
  public readonly eventType = 'decision.rescheduled';
  public readonly previousDate: DayDate;
  public readonly newDate: DayDate;
  public readonly rescheduleNumber: number;

  public constructor(
    eventId: EntityId,
    decisionId: EntityId,
    previousDate: DayDate,
    newDate: DayDate,
    rescheduleNumber: number,
    occurredAt: Date,
  ) {
    super(eventId, decisionId, occurredAt);
    this.previousDate = previousDate;
    this.newDate = newDate;
    this.rescheduleNumber = rescheduleNumber;
  }
}
