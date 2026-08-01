import type { EntityId } from '../../shared/EntityId';
import { copyDate } from '../../shared/dateCopy';
import { ActionSessionEvent } from './ActionSessionEvent';

export class ActionSessionResumed extends ActionSessionEvent<'session.resumed'> {
  public readonly eventType = 'session.resumed';
  readonly #pausedAt: Date;

  public constructor(
    eventId: EntityId,
    actionSessionId: EntityId,
    lifeActionId: EntityId,
    pausedAt: Date,
    resumedAt: Date,
  ) {
    super(eventId, actionSessionId, lifeActionId, resumedAt);
    this.#pausedAt = copyDate(pausedAt);
  }

  public get pausedAt(): Date {
    return copyDate(this.#pausedAt);
  }
}
