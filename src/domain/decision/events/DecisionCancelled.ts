import type { EntityId } from '../../shared/EntityId';
import type { DecisionCancelReason } from '../DecisionCancelReason';
import type { DecisionStatus } from '../DecisionStatus';
import { DecisionEvent } from './DecisionEvent';

export class DecisionCancelled extends DecisionEvent<'decision.cancelled'> {
  public readonly eventType = 'decision.cancelled';
  public readonly previousStatus: DecisionStatus;
  public readonly reason: DecisionCancelReason | null;

  public constructor(
    eventId: EntityId,
    decisionId: EntityId,
    previousStatus: DecisionStatus,
    reason: DecisionCancelReason | null,
    occurredAt: Date,
  ) {
    super(eventId, decisionId, occurredAt);
    this.previousStatus = previousStatus;
    this.reason = reason;
  }
}
