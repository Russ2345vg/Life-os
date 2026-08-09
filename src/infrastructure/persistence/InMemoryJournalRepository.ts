import type { JournalRepository } from '../../application';
import type { DayDate, JournalEntry } from '../../domain';
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
}

export function compareJournalEntries(left: JournalEntry, right: JournalEntry): number {
  const byDate = left.effectiveDate.toString().localeCompare(right.effectiveDate.toString());
  if (byDate !== 0) return byDate;
  const byTime = left.occurredAt.getTime() - right.occurredAt.getTime();
  return byTime !== 0 ? byTime : left.id.toString().localeCompare(right.id.toString());
}
