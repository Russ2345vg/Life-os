import type { EntityId } from '../../shared/EntityId';
import type { DayDate } from '../../day/DayDate';
import type { DecisionKind } from '../DecisionKind';
import type { ExpectedResult } from '../ExpectedResult';
import { DecisionEvent } from './DecisionEvent';

export class DecisionPlanned extends DecisionEvent<'decision.planned'> {
  public readonly eventType = 'decision.planned';
  public readonly plannedDate: DayDate;
  public readonly kind: DecisionKind;
  public readonly order: number | null;
  public readonly expectedResult: ExpectedResult | null;

  public constructor(
    eventId: EntityId,
    decisionId: EntityId,
    plannedDate: DayDate,
    kind: DecisionKind,
    order: number | null,
    expectedResult: ExpectedResult | null,
    occurredAt: Date,
  ) {
    super(eventId, decisionId, occurredAt);
    this.plannedDate = plannedDate;
    this.kind = kind;
    this.order = order;
    this.expectedResult = expectedResult;
  }
}
