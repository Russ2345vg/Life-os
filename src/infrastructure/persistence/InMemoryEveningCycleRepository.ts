import type { EveningCycleRepository } from '../../application';
import { EVENING_CYCLE_STATE, type DayDate, type EntityId, type EveningCycle } from '../../domain';

export class InMemoryEveningCycleRepository implements EveningCycleRepository {
  readonly #byDateKey = new Map<string, EveningCycle>();

  public async findById(id: EntityId): Promise<EveningCycle | null> {
    return [...this.#byDateKey.values()].find((cycle) => cycle.id.equals(id)) ?? null;
  }

  public async findByDayId(dayId: EntityId): Promise<EveningCycle | null> {
    return [...this.#byDateKey.values()].find((cycle) => cycle.dayId.equals(dayId)) ?? null;
  }

  public async findByDateKey(dateKey: DayDate): Promise<EveningCycle | null> {
    return this.#byDateKey.get(dateKey.toString()) ?? null;
  }

  public async findLatestUnfinishedOnOrBefore(dateKey: DayDate): Promise<EveningCycle | null> {
    return (
      [...this.#byDateKey.values()]
        .filter(
          (cycle) =>
            !cycle.dateKey.isAfter(dateKey) &&
            cycle.state !== EVENING_CYCLE_STATE.notStarted &&
            cycle.state !== EVENING_CYCLE_STATE.completed,
        )
        .sort((left, right) =>
          right.dateKey.toString().localeCompare(left.dateKey.toString()),
        )[0] ?? null
    );
  }

  public async findLatestWithSavedRelaxationDefaultBefore(
    dateKey: DayDate,
  ): Promise<EveningCycle | null> {
    return (
      [...this.#byDateKey.values()]
        .filter(
          (cycle) =>
            cycle.dateKey.isBefore(dateKey) && cycle.relaxation?.defaultChangedForFuture === true,
        )
        .sort((left, right) =>
          right.dateKey.toString().localeCompare(left.dateKey.toString()),
        )[0] ?? null
    );
  }

  public async createIfAbsent(cycle: EveningCycle): Promise<EveningCycle> {
    const existing = await this.findByDateKey(cycle.dateKey);
    if (existing !== null) return existing;
    this.#byDateKey.set(cycle.dateKey.toString(), cycle);
    return cycle;
  }

  public async saveIfVersionMatches(
    cycle: EveningCycle,
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
    this.#byDateKey.set(cycle.dateKey.toString(), cycle);
    return true;
  }
}
