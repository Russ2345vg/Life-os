import type { EntityId } from '../../shared/EntityId';
import { ActionSessionEvent } from './ActionSessionEvent';

export class ActionSessionStarted extends ActionSessionEvent<'session.started'> {
  public readonly eventType = 'session.started';

  public constructor(
    eventId: EntityId,
    actionSessionId: EntityId,
    lifeActionId: EntityId,
    startedAt: Date,
  ) {
    super(eventId, actionSessionId, lifeActionId, startedAt);
  }
}
