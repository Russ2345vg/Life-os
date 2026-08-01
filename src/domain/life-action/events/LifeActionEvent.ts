import type { DomainEvent } from '../../shared/DomainEvent';
import type { EntityId } from '../../shared/EntityId';
import { copyDate } from '../../shared/dateCopy';

export abstract class LifeActionEvent<
  TEventType extends string,
> implements DomainEvent<TEventType> {
  public abstract readonly eventType: TEventType;
  public readonly eventId: EntityId;
  public readonly lifeActionId: EntityId;
  readonly #occurredAt: Date;

  protected constructor(eventId: EntityId, lifeActionId: EntityId, occurredAt: Date) {
    this.eventId = eventId;
    this.lifeActionId = lifeActionId;
    this.#occurredAt = copyDate(occurredAt);
  }

  public get occurredAt(): Date {
    return copyDate(this.#occurredAt);
  }
}
