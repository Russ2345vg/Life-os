import { describe, expect, it } from 'vitest';
import { DayDate, EntityId } from '../../domain';
import { createMemoryEvent, summarizeMemoryEvent } from '../../domain/memory';
import { buildMemoryYearOverview } from './MemoryQueries';

function event(
  date: string,
  id: string,
  kind: 'moment' | 'achievement' = 'moment',
  isHighlight = false,
) {
  return summarizeMemoryEvent({
    ...createMemoryEvent(
      {
        id: EntityId.create(id),
        occurredOn: DayDate.create(date),
        title: id,
        body: '',
        kind,
        isHighlight,
        context: null,
        diarySource: null,
        photo: null,
      },
      new Date('2026-09-29T00:00:00Z'),
    ),
    version: 1,
  });
}
describe('memory year overview', () => {
  it('groups by calendar date including leap day and counts a highlight achievement once', () => {
    const overview = buildMemoryYearOverview(
      [
        event('2023-12-31', 'old'),
        event('2024-01-01', 'start'),
        event('2024-02-29', 'leap', 'achievement', true),
        event('2024-12-31', 'end'),
        event('2025-01-01', 'next'),
        { ...event('2024-06-01', 'deleted'), deletedAt: '2026-09-29T00:00:00.000Z' },
      ],
      2024,
    );
    expect(overview.uniqueEventCount).toBe(3);
    expect(overview.highlights.map((e) => e.title)).toEqual(['leap']);
    expect(overview.achievements.map((e) => e.title)).toEqual(['leap']);
    expect(overview.months.map((m) => [m.month, m.events.length])).toEqual([
      [12, 1],
      [2, 1],
      [1, 1],
    ]);
  });
  it('returns an empty view and rejects an invalid year', () => {
    expect(buildMemoryYearOverview([], 2026)).toMatchObject({
      year: 2026,
      uniqueEventCount: 0,
      months: [],
    });
    expect(() => buildMemoryYearOverview([], Number.NaN)).toThrow();
  });
});
