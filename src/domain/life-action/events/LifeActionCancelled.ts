import type { EntityId } from '../../shared/EntityId';
import type { ActionCancelReason } from '../ActionCancelReason';
import type { LifeActionStatus } from '../LifeActionStatus';
import { LifeActionEvent } from './LifeActionEvent';

export class LifeActionCancelled extends LifeActionEvent<'action.cancelled'> {
  public readonly eventType = 'action.cancelled';
  public readonly previousStatus: LifeActionStatus;
  public readonly reason: ActionCancelReason;

  public constructor(
    eventId: EntityId,
    lifeActionId: EntityId,
    previousStatus: LifeActionStatus,
    reason: ActionCancelReason,
    occurredAt: Date,
  ) {
    super(eventId, lifeActionId, occurredAt);
    this.previousStatus = previousStatus;
    this.reason = reason;
  }
}
