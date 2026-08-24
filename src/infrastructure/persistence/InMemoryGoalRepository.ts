import type { GoalRepository } from '../../application';
import type { EntityId, Goal } from '../../domain';

export class InMemoryGoalRepository implements GoalRepository {
  readonly #goals = new Map<string, Goal>();

  public constructor(goals: readonly Goal[] = []) {
    for (const goal of goals) this.#goals.set(goal.id.toString(), goal);
  }

  public async findById(id: EntityId): Promise<Goal | null> {
    return this.#goals.get(id.toString()) ?? null;
  }

  public async findAll(): Promise<readonly Goal[]> {
    return [...this.#goals.values()];
  }

  public async findByDirectionId(directionId: EntityId): Promise<readonly Goal[]> {
    return [...this.#goals.values()].filter((goal) => goal.directionId?.equals(directionId));
  }

  public async create(goal: Goal): Promise<boolean> {
    if (this.#goals.has(goal.id.toString())) return false;
    this.#goals.set(goal.id.toString(), goal);
    return true;
  }

  public async updateIfVersionMatches(goal: Goal, expectedVersion: number): Promise<boolean> {
    if (this.#goals.get(goal.id.toString())?.version !== expectedVersion) return false;
    this.#goals.set(goal.id.toString(), goal);
    return true;
  }
}
