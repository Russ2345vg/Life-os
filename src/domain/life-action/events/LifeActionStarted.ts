import type { DayDate } from '../../day/DayDate';
import type { EntityId } from '../../shared/EntityId';
import { LifeActionEvent } from './LifeActionEvent';

export class LifeActionStarted extends LifeActionEvent<'action.started'> {
  public readonly eventType = 'action.started';
  public readonly plannedDate: DayDate;

  public constructor(
    eventId: EntityId,
    lifeActionId: EntityId,
    plannedDate: DayDate,
    occurredAt: Date,
  ) {
    super(eventId, lifeActionId, occurredAt);
    this.plannedDate = plannedDate;
  }
}
