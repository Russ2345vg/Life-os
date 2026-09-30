import type { EntityId } from '../../domain';
import type { MemoryEventSummary } from '../../domain/memory';
import { DomainError } from '../../shared/errors/DomainError';
import type { MemoryQuery, MemoryRepository } from '../ports/MemoryRepository';

export interface MemoryYearOverview {
  readonly year: number;
  readonly uniqueEventCount: number;
  readonly highlights: readonly MemoryEventSummary[];
  readonly achievements: readonly MemoryEventSummary[];
  readonly months: readonly {
    readonly month: number;
    readonly events: readonly MemoryEventSummary[];
  }[];
}

export function buildMemoryYearOverview(
  events: readonly MemoryEventSummary[],
  year: number,
): MemoryYearOverview {
  if (!Number.isInteger(year) || year < 1 || year > 9999)
    throw new DomainError('memory.invalid_year', 'Выберите год от 1 до 9999.');
  const prefix = `${String(year).padStart(4, '0')}-`;
  const unique = new Map(
    events
      .filter((event) => event.deletedAt === null && event.occurredOn.toString().startsWith(prefix))
      .map((event) => [event.id.toString(), event]),
  );
  const selected = [...unique.values()].sort(
    (a, b) =>
      b.occurredOn.toString().localeCompare(a.occurredOn.toString()) ||
      b.createdAt.localeCompare(a.createdAt) ||
      (b.id.toString() === a.id.toString() ? 0 : b.id.toString() < a.id.toString() ? -1 : 1),
  );
  const months = [
    ...new Set(selected.map((event) => Number(event.occurredOn.toString().slice(5, 7)))),
  ].map((month) => ({
    month,
    events: selected.filter((event) => Number(event.occurredOn.toString().slice(5, 7)) === month),
  }));
  return {
    year,
    uniqueEventCount: selected.length,
    highlights: selected.filter((event) => event.isHighlight),
    achievements: selected.filter((event) => event.kind === 'achievement'),
    months,
  };
}

export class MemoryQueries {
  public constructor(private readonly repository: MemoryRepository) {}
  public get(id: EntityId) {
    return this.repository.findById(id);
  }
  public getSummary(id: EntityId) {
    return this.repository.findSummaryById(id);
  }
  public list(query: MemoryQuery) {
    return this.repository.list(query);
  }
  public async getYear(year: number): Promise<MemoryYearOverview> {
    return buildMemoryYearOverview(await this.repository.listYear(year), year);
  }
}
