import type { EntityId } from '../../shared/EntityId';
import type { LifeActionStatus } from '../LifeActionStatus';
import { LifeActionEvent } from './LifeActionEvent';

export class LifeActionArchived extends LifeActionEvent<'action.archived'> {
  public readonly eventType = 'action.archived';
  public readonly status: LifeActionStatus;

  public constructor(
    eventId: EntityId,
    lifeActionId: EntityId,
    status: LifeActionStatus,
    occurredAt: Date,
  ) {
    super(eventId, lifeActionId, occurredAt);
    this.status = status;
  }
}
