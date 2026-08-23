import type { MorningCycleRepository } from '../../application/ports/MorningCycleRepository';
import type { DayDate, EntityId, MorningCycle } from '../../domain';

export class InMemoryMorningCycleRepository implements MorningCycleRepository {
  readonly #byDate = new Map<string, MorningCycle>();

  public async findByDayId(dayId: EntityId): Promise<MorningCycle | null> {
    return [...this.#byDate.values()].find((cycle) => cycle.dayId.equals(dayId)) ?? null;
  }

  public async findByDateKey(dateKey: DayDate): Promise<MorningCycle | null> {
    return this.#byDate.get(dateKey.toString()) ?? null;
  }

  public async createIfAbsent(cycle: MorningCycle): Promise<MorningCycle> {
    const existing = await this.findByDateKey(cycle.dateKey);
    if (existing !== null) return existing;
    this.#byDate.set(cycle.dateKey.toString(), cycle);
    return cycle;
  }

  public async saveIfVersionMatches(
    cycle: MorningCycle,
    expectedVersion: number,
  ): Promise<boolean> {
    const stored = await this.findByDateKey(cycle.dateKey);
    if (
      stored === null ||
      !stored.id.equals(cycle.id) ||
      !stored.dayId.equals(cycle.dayId) ||
      stored.version !== expectedVersion
    ) {
      return false;
    }
    this.#byDate.set(cycle.dateKey.toString(), cycle);
    return true;
  }

  public all(): readonly MorningCycle[] {
    return [...this.#byDate.values()];
  }
}
