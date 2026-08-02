import type { EntityId } from '../../shared/EntityId';
import type { DecisionTitle } from '../DecisionTitle';
import type { ExpectedResult } from '../ExpectedResult';
import { DecisionEvent } from './DecisionEvent';

export class DecisionDetailsUpdated extends DecisionEvent<'decision.details_updated'> {
  public readonly eventType = 'decision.details_updated';
  public readonly title: DecisionTitle;
  public readonly expectedResult: ExpectedResult | null;

  public constructor(
    eventId: EntityId,
    decisionId: EntityId,
    title: DecisionTitle,
    expectedResult: ExpectedResult | null,
    occurredAt: Date,
  ) {
    super(eventId, decisionId, occurredAt);
    this.title = title;
    this.expectedResult = expectedResult;
  }
}
