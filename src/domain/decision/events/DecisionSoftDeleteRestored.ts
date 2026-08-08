import type { EntityId } from '../../shared/EntityId';
import { DecisionEvent } from './DecisionEvent';

export class DecisionSoftDeleteRestored extends DecisionEvent<'decision.restored_from_trash'> {
  public readonly eventType = 'decision.restored_from_trash';

  public constructor(eventId: EntityId, decisionId: EntityId, occurredAt: Date) {
    super(eventId, decisionId, occurredAt);
  }
}
