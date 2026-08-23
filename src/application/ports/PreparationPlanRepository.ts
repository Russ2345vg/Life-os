import type { EntityId, PreparationPlan } from '../../domain';

export interface PreparationPlanRepository {
  findById(id: EntityId): Promise<PreparationPlan | null>;
  findByCycleId(cycleId: EntityId): Promise<PreparationPlan | null>;
  findByTomorrowPlanId(tomorrowPlanId: EntityId): Promise<PreparationPlan | null>;
  findByTargetDayId(targetDayId: EntityId): Promise<PreparationPlan | null>;
  createIfAbsent(plan: PreparationPlan): Promise<PreparationPlan>;
  saveIfVersionMatches(plan: PreparationPlan, expectedVersion: number): Promise<boolean>;
}
