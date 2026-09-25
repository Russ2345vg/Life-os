import type { EntityId, Goal, LifeAction } from '../../domain';
import type { RecurrenceRule } from '../../domain/planner/RecurrenceRule';

/** Raw authoritative reads reserved for trash commands and the trash projection. */
export interface TrashRepository {
  findGoalIncludingDeleted(id: EntityId): Promise<Goal | null>;
  findActionIncludingDeleted(id: EntityId): Promise<LifeAction | null>;
  /** Includes active, removed and purged rules so restore can distinguish replay from expiry. */
  findSeriesIncludingRemoved(id: string): Promise<RecurrenceRule | null>;
  listDeletedGoals(): Promise<readonly Goal[]>;
  listDeletedActions(): Promise<readonly LifeAction[]>;
  listRemovedSeries(): Promise<readonly RecurrenceRule[]>;
}
