import type { JournalRepository } from '../../application';
import {
  JOURNAL_ENTRY_TYPE,
  type DayDate,
  type EntityId,
  type JournalEntry,
  type JournalEntryType,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';

export class InMemoryJournalRepository implements JournalRepository {
  readonly #entriesById = new Map<string, JournalEntry>();

  public async append(entry: JournalEntry): Promise<void> {
    return this.appendMany([entry]);
  }

  public async appendMany(entries: readonly JournalEntry[]): Promise<void> {
    this.assertCanAppend(entries);
    for (const entry of entries) this.#entriesById.set(entry.id.toString(), entry);
  }

  public async findByEffectiveDateRange(
    startDate: DayDate,
    endDate: DayDate,
  ): Promise<readonly JournalEntry[]> {
    return [...this.#entriesById.values()]
      .filter(
        (entry) =>
          !entry.effectiveDate.isBefore(startDate) && !entry.effectiveDate.isAfter(endDate),
      )
      .sort(compareJournalEntries);
  }

  public async findById(id: EntityId): Promise<JournalEntry | null> {
    return this.#entriesById.get(id.toString()) ?? null;
  }

  public async findCorrectionsBySourceEntryId(
    sourceEntryId: EntityId,
  ): Promise<readonly JournalEntry[]> {
    return [...this.#entriesById.values()]
      .filter(
        (entry) =>
          entry.type === JOURNAL_ENTRY_TYPE.dataCorrected &&
          entry.correction?.sourceEntryId.equals(sourceEntryId) === true,
      )
      .sort(compareJournalEntries);
  }

  public assertCanAppend(entries: readonly JournalEntry[]): void {
    const inputIds = new Set<string>();
    for (const entry of entries) {
      const id = entry.id.toString();
      if (inputIds.has(id) || this.#entriesById.has(id)) {
        throw new DomainError('journal.duplicate_entry', 'Событие уже записано в журнал.');
      }
      inputIds.add(id);
    }
  }

  public async findLatestBySubjectAndType(
    subjectId: EntityId,
    type: JournalEntryType,
  ): Promise<JournalEntry | null> {
    return (
      [...this.#entriesById.values()]
        .filter((entry) => entry.type === type && entry.subjectId?.equals(subjectId) === true)
        .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())[0] ?? null
    );
  }
}

export function compareJournalEntries(left: JournalEntry, right: JournalEntry): number {
  const byDate = left.effectiveDate.toString().localeCompare(right.effectiveDate.toString());
  if (byDate !== 0) return byDate;
  const byTime = left.occurredAt.getTime() - right.occurredAt.getTime();
  return byTime !== 0 ? byTime : left.id.toString().localeCompare(right.id.toString());
}
