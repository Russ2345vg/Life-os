import type { EntityId, Goal } from '../../domain';

export interface GoalRepository {
  findById(id: EntityId): Promise<Goal | null>;
  findAll(): Promise<readonly Goal[]>;
  create(goal: Goal): Promise<boolean>;
  updateIfVersionMatches(goal: Goal, expectedVersion: number): Promise<boolean>;
}
