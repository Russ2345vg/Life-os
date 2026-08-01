import type { DayDate } from '../../day/DayDate';
import type { EntityId } from '../../shared/EntityId';
import { DecisionEvent } from './DecisionEvent';

export class DecisionStarted extends DecisionEvent<'decision.started'> {
  public readonly eventType = 'decision.started';
  public readonly plannedDate: DayDate;

  public constructor(
    eventId: EntityId,
    decisionId: EntityId,
    plannedDate: DayDate,
    occurredAt: Date,
  ) {
    super(eventId, decisionId, occurredAt);
    this.plannedDate = plannedDate;
  }
}
