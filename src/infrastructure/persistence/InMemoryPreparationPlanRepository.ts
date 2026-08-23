import type { PreparationPlanRepository } from '../../application';
import type { EntityId, PreparationPlan } from '../../domain';

export class InMemoryPreparationPlanRepository implements PreparationPlanRepository {
  readonly #plans = new Map<string, PreparationPlan>();

  public async findById(id: EntityId): Promise<PreparationPlan | null> {
    return this.#plans.get(id.toString()) ?? null;
  }
  public async findByCycleId(cycleId: EntityId): Promise<PreparationPlan | null> {
    return [...this.#plans.values()].find((plan) => plan.cycleId.equals(cycleId)) ?? null;
  }
  public async findByTomorrowPlanId(tomorrowPlanId: EntityId): Promise<PreparationPlan | null> {
    return (
      [...this.#plans.values()].find((plan) => plan.tomorrowPlanId.equals(tomorrowPlanId)) ?? null
    );
  }
  public async findByTargetDayId(targetDayId: EntityId): Promise<PreparationPlan | null> {
    return [...this.#plans.values()].find((plan) => plan.targetDayId.equals(targetDayId)) ?? null;
  }
  public async createIfAbsent(plan: PreparationPlan): Promise<PreparationPlan> {
    const existing =
      (await this.findByCycleId(plan.cycleId)) ??
      (await this.findByTomorrowPlanId(plan.tomorrowPlanId)) ??
      (await this.findByTargetDayId(plan.targetDayId));
    if (existing !== null) return existing;
    this.#plans.set(plan.id.toString(), plan);
    return plan;
  }
  public async saveIfVersionMatches(
    plan: PreparationPlan,
    expectedVersion: number,
  ): Promise<boolean> {
    const stored = this.#plans.get(plan.id.toString());
    if (stored === undefined || stored.version !== expectedVersion) return false;
    this.#plans.set(plan.id.toString(), plan);
    return true;
  }
}
