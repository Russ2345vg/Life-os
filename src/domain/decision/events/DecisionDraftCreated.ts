import type { DecisionKind } from '../DecisionKind';
import type { DecisionPriority } from '../DecisionPriority';
import type { DecisionTitle } from '../DecisionTitle';
import { DecisionEvent } from './DecisionEvent';
import type { EntityId } from '../../shared/EntityId';

export class DecisionDraftCreated extends DecisionEvent<'decision.draft_created'> {
  public readonly eventType = 'decision.draft_created';
  public readonly title: DecisionTitle;
  public readonly kind: DecisionKind;
  public readonly reason: string | null;
  public readonly sphereId: EntityId | null;
  public readonly price: string | null;
  public readonly sacrifices: string | null;
  public readonly priority: DecisionPriority;
  public readonly projectReference: string | null;

  public constructor(
    eventId: EntityId,
    decisionId: EntityId,
    title: DecisionTitle,
    kind: DecisionKind,
    reason: string | null,
    sphereId: EntityId | null,
    price: string | null,
    sacrifices: string | null,
    priority: DecisionPriority,
    projectReference: string | null,
    occurredAt: Date,
  ) {
    super(eventId, decisionId, occurredAt);
    this.title = title;
    this.kind = kind;
    this.reason = reason;
    this.sphereId = sphereId;
    this.price = price;
    this.sacrifices = sacrifices;
    this.priority = priority;
    this.projectReference = projectReference;
  }
}
