import type { DomainEvent } from '../../shared/DomainEvent';
import type { EntityId } from '../../shared/EntityId';
import { copyDate } from '../../shared/dateCopy';

export abstract class DecisionEvent<TEventType extends string> implements DomainEvent<TEventType> {
  public abstract readonly eventType: TEventType;
  public readonly eventId: EntityId;
  public readonly decisionId: EntityId;
  readonly #occurredAt: Date;

  protected constructor(eventId: EntityId, decisionId: EntityId, occurredAt: Date) {
    this.eventId = eventId;
    this.decisionId = decisionId;
    this.#occurredAt = copyDate(occurredAt);
  }

  public get occurredAt(): Date {
    return copyDate(this.#occurredAt);
  }
}
