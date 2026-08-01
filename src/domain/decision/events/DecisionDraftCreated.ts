import type { DecisionKind } from '../DecisionKind';
import type { DecisionTitle } from '../DecisionTitle';
import { DecisionEvent } from './DecisionEvent';
import type { EntityId } from '../../shared/EntityId';

export class DecisionDraftCreated extends DecisionEvent<'decision.draft_created'> {
  public readonly eventType = 'decision.draft_created';
  public readonly title: DecisionTitle;
  public readonly kind: DecisionKind;

  public constructor(
    eventId: EntityId,
    decisionId: EntityId,
    title: DecisionTitle,
    kind: DecisionKind,
    occurredAt: Date,
  ) {
    super(eventId, decisionId, occurredAt);
    this.title = title;
    this.kind = kind;
  }
}
