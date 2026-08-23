import type { DayDate, EntityId, TomorrowPlan } from '../../domain';

export interface TomorrowPlanRepository {
  findById(id: EntityId): Promise<TomorrowPlan | null>;
  findByCycleId(cycleId: EntityId): Promise<TomorrowPlan | null>;
  findByTargetDate(date: DayDate): Promise<TomorrowPlan | null>;
  createIfAbsent(plan: TomorrowPlan): Promise<TomorrowPlan>;
  saveIfVersionMatches(plan: TomorrowPlan, expectedVersion: number): Promise<boolean>;
}
