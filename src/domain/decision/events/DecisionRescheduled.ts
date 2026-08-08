import type { DayDate } from '../../day/DayDate';
import type { EntityId } from '../../shared/EntityId';
import { DecisionEvent } from './DecisionEvent';

export class DecisionRescheduled extends DecisionEvent<'decision.rescheduled'> {
  public readonly eventType = 'decision.rescheduled';
  public readonly previousDate: DayDate;
  public readonly newDate: DayDate;
  public readonly previousPlannedDate: DayDate;
  public readonly newPlannedDate: DayDate;
  public readonly previousOrder: number | null;
  public readonly newOrder: number | null;
  public readonly rescheduleNumber: number;
  public readonly reason: string;

  public constructor(
    eventId: EntityId,
    decisionId: EntityId,
    previousDate: DayDate,
    newDate: DayDate,
    previousOrder: number | null,
    newOrder: number | null,
    rescheduleNumber: number,
    reason: string,
    occurredAt: Date,
  ) {
    super(eventId, decisionId, occurredAt);
    this.previousDate = previousDate;
    this.newDate = newDate;
    this.previousPlannedDate = previousDate;
    this.newPlannedDate = newDate;
    this.previousOrder = previousOrder;
    this.newOrder = newOrder;
    this.rescheduleNumber = rescheduleNumber;
    this.reason = reason;
  }
}
