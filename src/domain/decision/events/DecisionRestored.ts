import type { DayDate } from '../../day/DayDate';
import type { EntityId } from '../../shared/EntityId';
import type { ExpectedResult } from '../ExpectedResult';
import { DecisionEvent } from './DecisionEvent';

export class DecisionRestored extends DecisionEvent<'decision.restored'> {
  public readonly eventType = 'decision.restored';
  public readonly plannedDate: DayDate;
  public readonly order: number | null;
  public readonly expectedResult: ExpectedResult | null;

  public constructor(
    eventId: EntityId,
    decisionId: EntityId,
    plannedDate: DayDate,
    order: number | null,
    expectedResult: ExpectedResult | null,
    occurredAt: Date,
  ) {
    super(eventId, decisionId, occurredAt);
    this.plannedDate = plannedDate;
    this.order = order;
    this.expectedResult = expectedResult;
  }
}
