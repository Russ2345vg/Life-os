import type { DayDate, EntityId, JournalEntry, JournalEntryType } from '../../domain';

export interface JournalRepository {
  append(entry: JournalEntry): Promise<void>;
  appendMany(entries: readonly JournalEntry[]): Promise<void>;
  findById(id: EntityId): Promise<JournalEntry | null>;
  findCorrectionsBySourceEntryId(sourceEntryId: EntityId): Promise<readonly JournalEntry[]>;
  findByEffectiveDateRange(startDate: DayDate, endDate: DayDate): Promise<readonly JournalEntry[]>;
  findLatestBySubjectAndType(
    subjectId: EntityId,
    type: JournalEntryType,
  ): Promise<JournalEntry | null>;
}
