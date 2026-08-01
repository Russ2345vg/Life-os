import type { EntityId } from './EntityId';

export interface DomainEvent {
  readonly eventId: EntityId;
  readonly eventName: string;
  readonly occurredAt: Date;
}
