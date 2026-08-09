import type { DayDate, JournalEntry } from '../../domain';

export interface JournalRepository {
  append(entry: JournalEntry): Promise<void>;
  appendMany(entries: readonly JournalEntry[]): Promise<void>;
  findByEffectiveDateRange(startDate: DayDate, endDate: DayDate): Promise<readonly JournalEntry[]>;
}
