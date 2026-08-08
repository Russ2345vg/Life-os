import {
  resolveRoutineOccurrencesForDate,
  type DayDate,
  type EffectiveRoutineOccurrence,
} from '../../domain';
import type { RoutineBlockRepository } from '../ports/RoutineBlockRepository';
import type { RoutineOccurrenceOverrideRepository } from '../ports/RoutineOccurrenceOverrideRepository';

export class GetRoutineBlocksForDate {
  public constructor(
    readonly repository: RoutineBlockRepository,
    readonly overrideRepository?: RoutineOccurrenceOverrideRepository,
  ) {}

  public async execute(date: DayDate): Promise<readonly EffectiveRoutineOccurrence[]> {
    const [blocks, overrides] = await Promise.all([
      this.repository.findAll(),
      this.overrideRepository?.findAll() ?? Promise.resolve([]),
    ]);
    return resolveRoutineOccurrencesForDate(blocks, overrides, date);
  }
}
