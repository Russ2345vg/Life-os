import type { EntityId } from './EntityId';

export interface DomainEvent<TEventType extends string = string> {
  readonly eventId: EntityId;
  readonly eventType: TEventType;
  readonly occurredAt: Date;
}
