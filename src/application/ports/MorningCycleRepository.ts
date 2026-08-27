import type { DayDate, EntityId, MorningCycle } from '../../domain';

export interface MorningCycleRepository {
  findByDayId(dayId: EntityId): Promise<MorningCycle | null>;
  findByDateKey(dateKey: DayDate): Promise<MorningCycle | null>;
  findLatestUnfinishedBefore(dateKey: DayDate): Promise<MorningCycle | null>;
  createIfAbsent(cycle: MorningCycle): Promise<MorningCycle>;
  saveIfVersionMatches(cycle: MorningCycle, expectedVersion: number): Promise<boolean>;
}
