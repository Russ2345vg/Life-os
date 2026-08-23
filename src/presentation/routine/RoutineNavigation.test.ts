import { describe, expect, it } from 'vitest';
import { DayDate } from '../../domain';
import { buildRoutineRoute, parseRoutineRoute, ROUTINE_SECTION } from './RoutineNavigation';

describe('routine navigation', () => {
  it('builds and restores a direct evening route with the selected date', () => {
    const date = DayDate.create('2026-08-20');
    const hash = buildRoutineRoute(ROUTINE_SECTION.evening, date);

    expect(hash).toBe('#/routine/evening?date=2026-08-20');
    expect(parseRoutineRoute(hash)).toEqual({ section: ROUTINE_SECTION.evening, date });
  });

  it('accepts routine subsection routes without a date', () => {
    expect(parseRoutineRoute('#/routine/morning')).toEqual({
      section: ROUTINE_SECTION.morning,
      date: null,
    });
  });

  it('restores the selected query date again after a page refresh', () => {
    const hash = '#/routine/evening?date=2026-08-20';

    expect(parseRoutineRoute(hash)?.date?.toString()).toBe('2026-08-20');
    expect(parseRoutineRoute(hash)?.date?.toString()).toBe('2026-08-20');
  });

  it.each(['#/routine/night', '#/routine/evening?date=wrong', '#/history'])(
    'rejects an unsupported route: %s',
    (hash) => {
      expect(parseRoutineRoute(hash)).toBeNull();
    },
  );
});
