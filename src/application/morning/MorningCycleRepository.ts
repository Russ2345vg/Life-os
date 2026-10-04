import type { DayDate, MorningCycle } from '../../domain';

export interface MorningCycleRepository {
  findByDate(date: DayDate): Promise<MorningCycle | null>;
  latestBefore(date: DayDate): Promise<MorningCycle | null>;
  save(cycle: MorningCycle): Promise<void>;
  subscribe(listener: () => void): () => void;
}
