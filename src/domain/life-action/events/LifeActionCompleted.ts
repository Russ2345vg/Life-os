import type { EntityId } from '../../shared/EntityId';
import type { ActionActualResult } from '../ActionActualResult';
import { LifeActionEvent } from './LifeActionEvent';

export class LifeActionCompleted extends LifeActionEvent<'action.completed'> {
  public readonly eventType = 'action.completed';
  public readonly actualResult: ActionActualResult;

  public constructor(
    eventId: EntityId,
    lifeActionId: EntityId,
    actualResult: ActionActualResult,
    occurredAt: Date,
  ) {
    super(eventId, lifeActionId, occurredAt);
    this.actualResult = actualResult;
  }
}
