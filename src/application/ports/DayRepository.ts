import type { Day, DayDate } from '../../domain';

export interface DayRepository {
  findByDate(date: DayDate): Promise<Day | null>;
  save(day: Day): Promise<void>;
}
