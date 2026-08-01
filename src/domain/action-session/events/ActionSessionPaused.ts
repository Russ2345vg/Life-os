import type { EntityId } from '../../shared/EntityId';
import { ActionSessionEvent } from './ActionSessionEvent';

export class ActionSessionPaused extends ActionSessionEvent<'session.paused'> {
  public readonly eventType = 'session.paused';

  public constructor(
    eventId: EntityId,
    actionSessionId: EntityId,
    lifeActionId: EntityId,
    pausedAt: Date,
  ) {
    super(eventId, actionSessionId, lifeActionId, pausedAt);
  }
}
