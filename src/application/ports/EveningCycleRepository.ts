import type { DayDate, EntityId, EveningCycle } from '../../domain';

export interface EveningCycleRepository {
  findById(id: EntityId): Promise<EveningCycle | null>;
  findByDayId(dayId: EntityId): Promise<EveningCycle | null>;
  findByDateKey(dateKey: DayDate): Promise<EveningCycle | null>;
  findLatestUnfinishedOnOrBefore?(dateKey: DayDate): Promise<EveningCycle | null>;
  findLatestWithSavedRelaxationDefaultBefore?(dateKey: DayDate): Promise<EveningCycle | null>;
  createIfAbsent(cycle: EveningCycle): Promise<EveningCycle>;
  saveIfVersionMatches(cycle: EveningCycle, expectedVersion: number): Promise<boolean>;
}
