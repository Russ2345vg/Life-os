import type { EntityId } from '../../domain';
import type { MemoryEvent, MemoryEventSummary, MemoryKind } from '../../domain/memory';

export interface MemoryCursor {
  readonly occurredOn: string;
  readonly createdAt: string;
  readonly id: string;
}
export interface MemoryQuery {
  readonly year: number;
  readonly kind?: MemoryKind;
  readonly sphereId?: string;
  readonly search?: string;
  readonly highlightOnly?: boolean;
  readonly deleted: boolean;
  readonly cursor?: MemoryCursor;
}
export interface MemoryPage {
  readonly items: readonly MemoryEventSummary[];
  readonly nextCursor: MemoryCursor | null;
}
export interface MemorySaveOptions {
  /** null photo otherwise retains bytes materialized after an editor was opened. */
  readonly removePhoto?: boolean;
}
export interface MemoryRepository {
  findById(id: EntityId): Promise<MemoryEvent | null>;
  findSummaryById(id: EntityId): Promise<MemoryEventSummary | null>;
  save(
    event: MemoryEvent,
    expectedVersion: number | null,
    options?: MemorySaveOptions,
  ): Promise<MemoryEvent>;
  list(query: MemoryQuery): Promise<MemoryPage>;
  listYear(year: number): Promise<readonly MemoryEventSummary[]>;
}
