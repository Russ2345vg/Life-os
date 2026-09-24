import { describe, expect, it } from 'vitest';
import { plannerDisplayDate } from './plannerDisplayDate';
describe('planner display date', () => {
  it('keeps the domain day and includes the year', () => {
    expect(plannerDisplayDate('2026-09-18')).toBe('18 сентября 2026 г.');
    expect(plannerDisplayDate('2024-02-29')).toBe('29 февраля 2024 г.');
  });
  it('labels an unscheduled action', () => expect(plannerDisplayDate(null)).toBe('Без даты'));
});
