import type { EntityId } from '../../shared/EntityId';
import type { ActualResultSummary } from '../ActualResultSummary';
import { DecisionEvent } from './DecisionEvent';

export class DecisionConfirmed extends DecisionEvent<'decision.confirmed'> {
  public readonly eventType = 'decision.confirmed';
  public readonly actualResultSummary: ActualResultSummary;
  readonly #evidenceIds: readonly EntityId[];

  public constructor(
    eventId: EntityId,
    decisionId: EntityId,
    actualResultSummary: ActualResultSummary,
    evidenceIds: readonly EntityId[],
    occurredAt: Date,
  ) {
    super(eventId, decisionId, occurredAt);
    this.actualResultSummary = actualResultSummary;
    this.#evidenceIds = [...evidenceIds];
  }

  public get evidenceIds(): readonly EntityId[] {
    return [...this.#evidenceIds];
  }
}
