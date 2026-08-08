import type { RoutineOccurrenceOverrideRepository } from '../../application';
import type { DayDate, EntityId, RoutineOccurrenceOverride } from '../../domain';

export class InMemoryRoutineOccurrenceOverrideRepository implements RoutineOccurrenceOverrideRepository {
  readonly #items = new Map<string, RoutineOccurrenceOverride>();

  public constructor(items: readonly RoutineOccurrenceOverride[] = []) {
    for (const item of items) this.#items.set(key(item.routineBlockId, item.occurrenceDate), item);
  }

  public async findByOccurrence(
    routineBlockId: EntityId,
    occurrenceDate: DayDate,
  ): Promise<RoutineOccurrenceOverride | null> {
    return this.#items.get(key(routineBlockId, occurrenceDate)) ?? null;
  }

  public async findAll(): Promise<readonly RoutineOccurrenceOverride[]> {
    return [...this.#items.values()];
  }

  public async saveIfVersionMatches(
    override: RoutineOccurrenceOverride,
    expectedVersion: number | null,
  ): Promise<boolean> {
    const itemKey = key(override.routineBlockId, override.occurrenceDate);
    const current = this.#items.get(itemKey);
    if (
      (expectedVersion === null && current !== undefined) ||
      (expectedVersion !== null && current?.version !== expectedVersion)
    ) {
      return false;
    }
    this.#items.set(itemKey, override);
    return true;
  }

  public async deleteIfVersionMatches(id: EntityId, expectedVersion: number): Promise<boolean> {
    const entry = [...this.#items.entries()].find(
      ([, item]) => item.id.equals(id) && item.version === expectedVersion,
    );
    return entry === undefined ? false : this.#items.delete(entry[0]);
  }
}

function key(routineBlockId: EntityId, occurrenceDate: DayDate): string {
  return `${routineBlockId.toString()}\u0000${occurrenceDate.toString()}`;
}
