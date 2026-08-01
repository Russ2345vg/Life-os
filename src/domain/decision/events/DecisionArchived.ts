import type { EntityId } from '../../shared/EntityId';
import type { DecisionStatus } from '../DecisionStatus';
import { DecisionEvent } from './DecisionEvent';

export class DecisionArchived extends DecisionEvent<'decision.archived'> {
  public readonly eventType = 'decision.archived';
  public readonly status: DecisionStatus;

  public constructor(
    eventId: EntityId,
    decisionId: EntityId,
    status: DecisionStatus,
    occurredAt: Date,
  ) {
    super(eventId, decisionId, occurredAt);
    this.status = status;
  }
}
