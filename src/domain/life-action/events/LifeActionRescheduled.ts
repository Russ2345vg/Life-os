import type { DayDate } from '../../day/DayDate';
import type { EntityId } from '../../shared/EntityId';
import { LifeActionEvent } from './LifeActionEvent';

export class LifeActionRescheduled extends LifeActionEvent<'action.rescheduled'> {
  public readonly eventType = 'action.rescheduled';
  public readonly previousDate: DayDate;
  public readonly newDate: DayDate;
  public readonly previousPlannedDate: DayDate;
  public readonly newPlannedDate: DayDate;
  public readonly rescheduleNumber: number;

  public constructor(
    eventId: EntityId,
    lifeActionId: EntityId,
    previousDate: DayDate,
    newDate: DayDate,
    rescheduleNumber: number,
    occurredAt: Date,
  ) {
    super(eventId, lifeActionId, occurredAt);
    this.previousDate = previousDate;
    this.newDate = newDate;
    this.previousPlannedDate = previousDate;
    this.newPlannedDate = newDate;
    this.rescheduleNumber = rescheduleNumber;
  }
}
