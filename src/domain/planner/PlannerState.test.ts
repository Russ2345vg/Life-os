import { describe, expect, it } from 'vitest';
import { inboxIdea } from './InboxIdea';
import { changeFocusRole, focusPeriod, focusWeek } from './FocusPeriod';
describe('planner invariants', () => {
  it('uses a calendar week across the year boundary', () => {
    expect(focusWeek('2027-01-01')).toEqual({
      id: 'focus:week:2026-12-28',
      startDate: '2026-12-28',
      endDate: '2027-01-03',
    });
  });
  it('rejects empty title and dangling conversion state', () => {
    const source = {
      id: 'i',
      title: ' ',
      note: null,
      status: 'inbox',
      targetId: null,
      targetType: null,
      createdAt: '2026-09-13',
      updatedAt: '2026-09-13',
      version: 1,
      schemaVersion: 1,
    } as const;
    expect(() => inboxIdea(source)).toThrow();
    expect(() => inboxIdea({ ...source, title: 'Idea', status: 'converted' })).toThrow();
  });
  it('allows focus above the recommendation with unique references and removal/re-add', () => {
    const base = focusPeriod({
      ...focusWeek('2026-09-13'),
      goals: [],
      updatedAt: '2026-09-13',
      version: 1,
      schemaVersion: 1,
    });
    let current = base;
    for (let i = 0; i < 5; i++)
      current = changeFocusRole(current, String(i), 'supporting', '2026-09-13');
    expect(changeFocusRole(current, '6', 'primary', '2026-09-13').goals).toHaveLength(6);
    expect(changeFocusRole(current, '0', 'supporting', '2026-09-13')).toBe(current);
    current = changeFocusRole(current, '0', null, '2026-09-13');
    expect(changeFocusRole(current, '0', 'primary', '2026-09-13').goals).toHaveLength(5);
  });
});
