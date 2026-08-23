import type { TomorrowPlanRepository } from '../../application';
import type { DayDate, EntityId, TomorrowPlan } from '../../domain';

export class InMemoryTomorrowPlanRepository implements TomorrowPlanRepository {
  readonly #plans = new Map<string, TomorrowPlan>();

  public async findById(id: EntityId): Promise<TomorrowPlan | null> {
    return this.#plans.get(id.toString()) ?? null;
  }

  public async findByCycleId(cycleId: EntityId): Promise<TomorrowPlan | null> {
    return [...this.#plans.values()].find((plan) => plan.cycleId.equals(cycleId)) ?? null;
  }

  public async findByTargetDate(date: DayDate): Promise<TomorrowPlan | null> {
    return [...this.#plans.values()].find((plan) => plan.targetDateKey.equals(date)) ?? null;
  }

  public async createIfAbsent(plan: TomorrowPlan): Promise<TomorrowPlan> {
    const existing = await this.findByCycleId(plan.cycleId);
    if (existing !== null) return existing;
    const byTarget = await this.findByTargetDate(plan.targetDateKey);
    if (byTarget !== null) return byTarget;
    this.#plans.set(plan.id.toString(), plan);
    return plan;
  }

  public async saveIfVersionMatches(plan: TomorrowPlan, expectedVersion: number): Promise<boolean> {
    const stored = this.#plans.get(plan.id.toString());
    if (stored === undefined || stored.version !== expectedVersion) return false;
    this.#plans.set(plan.id.toString(), plan);
    return true;
  }
}
