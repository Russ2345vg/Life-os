import type { DayDate, EntityId, MorningCycle } from '../../domain';

export interface MorningCycleRepository {
  findByDayId(dayId: EntityId): Promise<MorningCycle | null>;
  findByDateKey(dateKey: DayDate): Promise<MorningCycle | null>;
  findLatestUnfinishedBefore(dateKey: DayDate): Promise<MorningCycle | null>;
  findBetween(startDate: DayDate, endDate: DayDate): Promise<readonly MorningCycle[]>;
  createIfAbsent(cycle: MorningCycle): Promise<MorningCycle>;
  saveIfVersionMatches(cycle: MorningCycle, expectedVersion: number): Promise<boolean>;
}
