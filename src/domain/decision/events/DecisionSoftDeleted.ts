import type { EntityId } from '../../shared/EntityId';
import { DecisionEvent } from './DecisionEvent';

export class DecisionSoftDeleted extends DecisionEvent<'decision.deleted'> {
  public readonly eventType = 'decision.deleted';

  public constructor(eventId: EntityId, decisionId: EntityId, occurredAt: Date) {
    super(eventId, decisionId, occurredAt);
  }
}
