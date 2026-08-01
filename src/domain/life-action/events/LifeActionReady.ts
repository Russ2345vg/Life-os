import type { DayDate } from '../../day/DayDate';
import type { EntityId } from '../../shared/EntityId';
import type { ActionExpectedResult } from '../ActionExpectedResult';
import { LifeActionEvent } from './LifeActionEvent';

export class LifeActionReady extends LifeActionEvent<'action.ready'> {
  public readonly eventType = 'action.ready';
  public readonly expectedResult: ActionExpectedResult;
  public readonly plannedDate: DayDate;

  public constructor(
    eventId: EntityId,
    lifeActionId: EntityId,
    expectedResult: ActionExpectedResult,
    plannedDate: DayDate,
    occurredAt: Date,
  ) {
    super(eventId, lifeActionId, occurredAt);
    this.expectedResult = expectedResult;
    this.plannedDate = plannedDate;
  }
}
